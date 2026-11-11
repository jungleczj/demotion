import { randomUUID } from 'node:crypto';
import { mediaQualityError } from './media-quality.mjs';

const USER_AGENT = 'GoMotionLocalMVP/0.1 (local footage research prototype)';
export const assets = new Map();
const cache = new Map();
const MAX_CACHE = 100;
export const strip = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|lt|gt|nbsp);/g, ' ').replace(/\s+/g, ' ').trim();

export async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...options.headers },
    signal: options.signal || AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`请求失败 (${response.status})${response.status === 429 ? '，请稍后重试' : ''}`);
  return response.json();
}

function register(asset) {
  const id = `${asset.provider}:${asset.sourceId}`;
  const record = { ...assets.get(id), ...asset, id };
  assets.set(id, record);
  if (assets.size > 2000) assets.delete(assets.keys().next().value);
  return record;
}

export function registerUpload(file) {
  return register({ provider: 'upload', sourceId: randomUUID(), ...file, author: '本地上传', license: '用户提供', licenseUrl: '', sourceUrl: '', uploaded: true });
}

async function commons(query, config, kind) {
  const video = kind !== 'image';
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:${kind === 'image' ? 'bitmap' : 'video'}`,
    gsrlimit: '12', prop: video ? 'videoinfo' : 'imageinfo',
    [video ? 'viprop' : 'iiprop']: `url|size|mime|extmetadata${video ? '|derivatives' : ''}`,
    [video ? 'viurlwidth' : 'iiurlwidth']: '640',
    [video ? 'viextmetadatafilter' : 'iiextmetadatafilter']: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal',
  }).toString();
  const data = await requestJSON(url);
  if (data.error) throw new Error(data.error.info || 'Wikimedia 搜索失败');
  return Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index).flatMap((page) => {
    const info = (video ? page.videoinfo : page.imageinfo)?.[0];
    if (!info?.url || !video && info.size > 90 * 1024 * 1024) return [];
    const meta = info.extmetadata || {};
    const record = register({
      provider: 'commons', sourceId: String(page.pageid),
      title: page.title.replace(/^File:/, '').replace(/\.(webm|ogv|mp4|jpg|png|jpeg)$/i, '').replaceAll('_', ' '),
      description: strip(meta.ImageDescription?.value).slice(0, 650),
      url: info.url, thumbnail: info.thumburl || info.url,
      sourceUrl: info.descriptionurl, author: strip(meta.Artist?.value) || 'Wikimedia contributor',
      license: strip(meta.LicenseShortName?.value) || '请查看来源页',
      licenseUrl: meta.LicenseUrl?.value || info.descriptionurl,
      width: info.width || 0, height: info.height || 0,
      duration: info.duration || 0, bytes: info.size || 0,
      kind: info.mime?.startsWith('video/') || info.duration ? 'video' : 'image',
    });
    if (video) applyCommonsDerivatives(record, info);
    return record.kind === (video ? 'video' : 'image') ? [record] : [];
  });
}

// Use published video renditions, never infer a rendition URL from a filename.
function applyCommonsDerivatives(asset, info) {
  const duration = Number(info.duration || asset.duration) || 0;
  const files = (info.derivatives || []).filter((f) => f.src && Number(f.width) > 0);
  const estimate = (f) => Number(f.bandwidth) * duration / 8;
  const previews = files.filter((f) => !duration || !f.bandwidth || estimate(f) <= 12 * 1024 * 1024)
    .sort((a, b) => Math.abs(Number(a.height) - 480) - Math.abs(Number(b.height) - 480));
  const exports = files.filter((f) => Math.min(Number(f.width), Number(f.height)) >= 720 && (!duration || !f.bandwidth || estimate(f) <= 48 * 1024 * 1024))
    .sort((a, b) => Math.abs(Math.min(Number(a.width), Number(a.height)) - 720) - Math.abs(Math.min(Number(b.width), Number(b.height)) - 720));
  if (previews[0]) asset.analysisUrl = previews[0].src;
  if (exports[0]) {
    asset.originalUrl ||= asset.url;
    asset.url = exports[0].src;
    asset.width = Number(exports[0].width); asset.height = Number(exports[0].height);
    asset.bytes = Math.ceil(estimate(exports[0])) || 0;
  }
  asset.duration = duration; asset.derivativesChecked = true;
}

async function archive(query) {
  const words = query.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/\s+/).slice(0, 5);
  const q = `(${words.map((word) => `"${word}"`).join(' AND ')}) AND mediatype:movies AND (collection:prelinger OR collection:nasa OR collection:opensource_movies)`;
  const url = new URL('https://archive.org/advancedsearch.php');
  const params = new URLSearchParams({ q, rows: '4', output: 'json' });
  for (const field of ['identifier', 'title', 'description', 'creator', 'licenseurl']) params.append('fl[]', field);
  url.search = params.toString();
  const data = await requestJSON(url);
  const records = await Promise.allSettled((data.response?.docs || []).map(async (doc) => {
    const metadata = await requestJSON(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
    const files = (metadata.files || []).filter((file) => /\.mp4$/i.test(file.name) && Number(file.size) < 80 * 1024 * 1024 && Number(file.size) > 10000)
      .sort((a, b) => (Math.abs((Number(a.width) || 640) - 960)) - (Math.abs((Number(b.width) || 640) - 960)));
    if (!files[0]) return null;
    const file = files[0];
    const meta = metadata.metadata || doc;
    return register({
      provider: 'archive', sourceId: `${doc.identifier}/${file.name}`,
      title: String(meta.title || doc.title || doc.identifier), description: strip(meta.description).slice(0, 650),
      url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${file.name.split('/').map(encodeURIComponent).join('/')}`,
      thumbnail: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
      sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      author: strip(meta.creator || 'Internet Archive contributor'),
      license: meta.licenseurl ? String(meta.licenseurl).includes('publicdomain') ? 'Public domain / CC0' : 'Creative Commons · 查看来源' : '授权信息待确认',
      licenseUrl: String(meta.licenseurl || ''),
      width: Number(file.width) || 0, height: Number(file.height) || 0,
      duration: Number(file.length) || 0, bytes: Number(file.size) || 0, kind: 'video',
    });
  }));
  return records.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
}

async function pexels(query, config, kind) {
  if (!config.pexelsKey) throw new Error('请先连接 Pexels API key');
  const video = kind !== 'image';
  const url = new URL(video ? 'https://api.pexels.com/v1/videos/search' : 'https://api.pexels.com/v1/search');
  url.search = new URLSearchParams({ query, per_page: '24', orientation: config.outputFormat === 'portrait' ? 'portrait' : 'landscape' }).toString();
  const data = await requestJSON(url, { headers: { Authorization: config.pexelsKey } });
  return (video ? data.videos || [] : data.photos || []).flatMap((item) => {
    const file = video ? item.video_files.filter((v) => v.file_type === 'video/mp4' && v.width >= 640).sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0] : null;
    if (video && !file) return [];
    return [register({
      provider: 'pexels', sourceId: String(item.id),
      title: item.alt || item.url.split('/').filter(Boolean).at(-1)?.replace(/-\d+$/, '').replaceAll('-', ' ') || `Pexels ${item.id}`,
      description: item.alt || '', url: video ? file.link : item.src.large2x,
      analysisUrl: video ? [...item.video_files].filter((v) => v.file_type === 'video/mp4' && v.width >= 480).sort((a, b) => a.width - b.width)[0]?.link || file.link : item.src.medium,
      thumbnail: video ? item.image : item.src.medium,
      sourceUrl: item.url, author: video ? item.user.name : item.photographer,
      license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/',
      width: video ? file.width : item.width, height: video ? file.height : item.height,
      duration: item.duration || 0, bytes: 0, kind: video ? 'video' : 'image',
    })];
  });
}

async function pixabay(query, config, kind) {
  if (!config.pixabayKey) throw new Error('请先连接 Pixabay API key');
  const video = kind !== 'image';
  const url = new URL(video ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/');
  url.search = new URLSearchParams({ key: config.pixabayKey, q: query.slice(0, 100), per_page: '24', safesearch: 'true', ...(video ? { video_type: 'film' } : { image_type: 'photo' }) }).toString();
  const data = await requestJSON(url);
  return (data.hits || []).map((item) => {
    const file = video ? Object.values(item.videos).filter((f) => f?.url && Math.min(f.width, f.height) >= 720 && (!f.size || f.size <= 48 * 1024 * 1024)).sort((a, b) => Math.abs(Math.min(a.width, a.height) - 720) - Math.abs(Math.min(b.width, b.height) - 720))[0] || item.videos.medium || item.videos.small : null;
    return register({
      provider: 'pixabay', sourceId: String(item.id), title: item.tags, description: item.tags,
      url: video ? file.url : item.largeImageURL, thumbnail: video ? file.thumbnail || item.videos.tiny?.thumbnail : item.webformatURL,
      analysisUrl: video ? [item.videos.small, item.videos.tiny, file].find((v) => v?.url && (!v.size || v.size <= 24 * 1024 * 1024))?.url || item.videos.tiny?.url : item.webformatURL,
      sourceUrl: item.pageURL, author: item.user,
      license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/',
      width: video ? file.width : item.imageWidth, height: video ? file.height : item.imageHeight,
      duration: item.duration || 0, bytes: video ? file.size : item.imageSize, kind: video ? 'video' : 'image',
    });
  });
}

async function nasa(query, config, kind) {
  const url = new URL('https://images-api.nasa.gov/search');
  url.search = new URLSearchParams({ q: query, media_type: kind === 'image' ? 'image' : 'video', page_size: '6' }).toString();
  const data = await requestJSON(url);
  const results = await Promise.allSettled((data.collection?.items || []).map(async (item) => {
    const meta = item.data?.[0];
    if (!meta?.nasa_id || !item.href) return null;
    const files = await requestJSON(item.href);
    const video = kind !== 'image';
    const usable = files.filter((file) => typeof file === 'string' && (video ? /\.mp4$/i.test(file) : /\.(jpg|jpeg|png)$/i.test(file)));
    const chosen = usable.find((file) => /~medium\./i.test(file)) || usable.find((file) => /~small\./i.test(file)) || usable.find((file) => /~mobile\./i.test(file)) || usable[0];
    const preview = usable.find((file) => /~mobile\./i.test(file)) || usable.find((file) => /~small\./i.test(file)) || chosen;
    const secure = (file) => file?.replace(/^http:\/\/images-assets\.nasa\.gov\//i, 'https://images-assets.nasa.gov/');
    if (!chosen) return null;
    return register({
      provider: 'nasa', sourceId: meta.nasa_id, title: meta.title || meta.nasa_id,
      description: strip(meta.description || '').slice(0, 650), url: secure(chosen), analysisUrl: secure(preview),
      thumbnail: item.links?.find((link) => link.rel === 'preview')?.href || '',
      sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`,
      author: meta.photographer || meta.center || 'NASA',
      license: 'NASA 媒体使用条件', licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      width: 0, height: 0, duration: 0, bytes: 0, kind: video ? 'video' : 'image',
    });
  }));
  return results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
}

async function coverr(query, config, kind) {
  if (!config.coverrKey) throw new Error('请先连接 Coverr API key');
  if (kind === 'image') return [];
  const url = new URL('https://api.coverr.co/videos');
  url.search = new URLSearchParams({ query, page_size: '24', urls: 'true', filter: 'is_ai_generated:false' }).toString();
  const data = await requestJSON(url, { headers: { 'x-api-key': config.coverrKey } });
  return (data.hits || []).filter((item) => item.is_ai_generated === false && item.is_premium === false && item.urls?.mp4).map((item) => {
    const sourceUrl = item.slug ? `https://coverr.co/videos/${encodeURIComponent(item.slug)}` : 'https://coverr.co/stock-video-footage';
    const creator = item.author || item.creator || item.contributor;
    const author = typeof creator === 'string' ? creator : creator?.name || (item.contributor_id ? `Coverr contributor ${item.contributor_id}` : 'Coverr');
    return register({
      provider: 'coverr', sourceId: String(item.id), title: strip(item.title),
      description: strip(`${item.description || ''} ${(item.tags || []).join(' ')}`).slice(0, 650),
      url: item.urls.mp4, thumbnail: item.poster || item.thumbnail, sourceUrl, author,
      analysisUrl: item.urls.mp4_preview || item.urls.mp4,
      authorUrl: creator?.url || sourceUrl, license: 'Coverr License · 免费 API 需署名', licenseUrl: 'https://coverr.co/license',
      width: Number(item.max_width) || 0, height: Number(item.max_height) || 0,
      duration: Number(item.duration) || 0, bytes: 0, kind: 'video',
    });
  });
}

const selections = new Set();
export async function trackSelection(asset, projectId, config, signal) {
  signal?.throwIfAborted();
  if (asset?.provider !== 'coverr') return;
  const key = `${projectId}:${asset.id}`;
  if (selections.has(key)) return;
  if (!config.coverrKey) throw new Error('Coverr 选用回传需要 API key，请在设置中重新连接');
  const response = await fetch(`https://api.coverr.co/videos/${encodeURIComponent(asset.sourceId)}/stats/downloads`, {
    method: 'PATCH', headers: { 'x-api-key': config.coverrKey }, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(`Coverr 选用回传失败 (${response.status})，请稍后重试`);
  selections.add(key);
  if (selections.size > 1000) selections.delete(selections.values().next().value);
}

export const providers = { commons, archive, nasa, pexels, pixabay, coverr };

export async function ensureAnalysisPreview(asset, config) {
  if (asset.provider === 'nasa') {
    asset.url = asset.url?.replace(/^http:\/\/images-assets\.nasa\.gov\//i, 'https://images-assets.nasa.gov/');
    asset.analysisUrl = asset.analysisUrl?.replace(/^http:\/\/images-assets\.nasa\.gov\//i, 'https://images-assets.nasa.gov/');
  }
  if (asset.provider === 'commons' && asset.kind === 'video' && !asset.derivativesChecked) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'videoinfo', viprop: 'url|size|derivatives', pageids: asset.sourceId }).toString();
    const info = (await requestJSON(url)).query?.pages?.[asset.sourceId]?.videoinfo?.[0];
    if (info) applyCommonsDerivatives(asset, info);
  }
  if (asset.analysisUrl || asset.localPath) return asset;
  if (asset.provider === 'pixabay' && config.pixabayKey) {
    const url = new URL('https://pixabay.com/api/videos/');
    url.search = new URLSearchParams({ key: config.pixabayKey, id: asset.sourceId }).toString();
    const item = (await requestJSON(url)).hits?.[0];
    if (item) asset.analysisUrl = item.videos.small?.url || item.videos.tiny?.url;
  } else if (asset.provider === 'coverr' && config.coverrKey) {
    const item = await requestJSON(`https://api.coverr.co/videos/${encodeURIComponent(asset.sourceId)}`, { headers: { 'x-api-key': config.coverrKey } });
    asset.analysisUrl = item.urls?.mp4_preview;
  }
  return asset;
}

export function metadataRank(candidates, query, used = []) {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  return candidates.map((asset, index) => {
    const haystack = `${asset.title} ${asset.description}`.toLowerCase();
    const matched = tokens.filter((token) => haystack.includes(token)).length / Math.max(1, tokens.length);
    const quality = Math.min(1, asset.width / 1280);
    const score = Math.round(Math.min(95, Math.max(10, 42 + matched * 30 + quality * 10 + 8 / (index + 1) - (used.includes(asset.id) ? 28 : 0))));
    return { ...asset, score, reason: used.includes(asset.id) ? '其他镜头已使用，建议避免重复' : matched > 0.5 ? '标题或说明包含主要检索词；仍需确认画面' : '依据素材目录返回顺序与尺寸推荐；需预览确认', matchMethod: 'metadata' };
  }).sort((a, b) => b.score - a.score);
}

export async function searchSources(query, enabled, config, kind = 'video', used = []) {
  const unique = [...new Set(enabled)].filter((key) => providers[key] && (key !== 'archive' || kind !== 'image'));
  if (!unique.length) throw new Error('请至少选择一个可用素材来源');
  const outcomes = await Promise.allSettled(unique.map(async (key) => {
    const cacheKey = `${key}:${kind}:${config.outputFormat || 'any'}:${query.toLowerCase().trim()}`;
    const saved = cache.get(cacheKey);
    if (saved && Date.now() - saved.at < 86400000) return { provider: key, results: saved.results, cached: true };
    const results = await providers[key](query, config, kind);
    cache.set(cacheKey, { results, at: Date.now() });
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return { provider: key, results, cached: false };
  }));
  const warnings = outcomes.flatMap((result, index) => result.status === 'rejected' ? [`${unique[index]}：${result.reason.message}`] : []);
  const successful = outcomes.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (!successful.length) throw new Error(warnings.join('；'));
  return {
    // Still assets are elements of a composed layout. Their actual decoded
    // resolution and placement are checked by the image compositor; imposing
    // source-video orientation here would discard useful photos and diagrams.
    assets: metadataRank(successful.flatMap((result) => result.results).filter((a) => a.kind === kind && (kind === 'image' || !config.outputFormat || !mediaQualityError(a.width, a.height, config.outputFormat, true))), query, used),
    warnings, queriedSources: unique, cached: successful.every((result) => result.cached),
  };
}
