import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { searchOpenverse } from './source-adapters/openverse.mjs';
import { searchScottBuckley } from './source-adapters/scottbuckley.mjs';
import { sharedOperations } from './shared-operation.mjs';
import { run, probe } from './process.mjs';

export const musicAssets = new Map();
const cache = new Map(), shared = sharedOperations(), MAX_BYTES = 48 * 1024 * 1024;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const allowedURL = (value) => {
  try { const u = new URL(value), host = u.hostname.replace(/^\[|\]$/g, ''); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && !isIP(host) && host.includes('.') && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ? u.href : ''; } catch { return ''; }
};
async function response(url, { signal, fetch: fetcher = globalThis.fetch } = {}) {
  let next = allowedURL(url);
  if (!next) throw new Error('音乐来源必须是公开 HTTPS 地址');
  for (let redirects = 0; redirects <= 3; redirects++) {
    const r = await fetcher(next, { signal, redirect: 'manual', headers: { 'User-Agent': 'GoMotionLocalMVP/0.1', 'Accept-Encoding': 'identity' } });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location = r.headers.get('location'); await r.body?.cancel();
      next = location && allowedURL(new URL(location, next).href);
      if (!next) throw new Error('音乐来源重定向到不允许的地址');
      continue;
    }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`音乐来源请求失败（HTTP ${r.status}）`); }
    return r;
  }
  throw new Error('音乐来源重定向过多');
}
async function limitedText(url, options = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  const r = await response(url, { ...options, signal });
  if (!r.body || Number(r.headers.get('content-length')) > 1024 * 1024) { await r.body?.cancel(); throw new Error('音乐目录响应过大'); }
  const chunks = []; let bytes = 0;
  for await (const chunk of r.body) { bytes += chunk.length; if (bytes > 1024 * 1024) { await r.body.cancel().catch(() => {}); throw new Error('音乐目录响应过大'); } chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
export function musicLicenseError(asset) {
  if (!asset || asset.kind !== 'audio' || !allowedURL(asset.url) || !allowedURL(asset.sourceUrl) || !asset.author || !asset.attribution) return '音乐来源与署名记录不完整';
  if (!/^(?:CC BY \d\.\d|CC0(?: 1\.0)?|Public domain mark(?: 1\.0)?)$/.test(asset.license)) return '音乐尚未明确允许商业同步与改编';
  let u; try { u = new URL(asset.licenseUrl); } catch { return '音乐许可链接无效'; }
  if (u.protocol !== 'https:' || u.hostname !== 'creativecommons.org' || !/^\/(?:licenses\/by\/\d\.\d|publicdomain\/(?:zero|mark)\/1\.0)\/$/.test(u.pathname)) return '音乐许可链接无效';
  if ((asset.license.startsWith('CC BY ') && u.pathname !== `/licenses/by/${asset.license.slice(6)}/`) || (asset.license.startsWith('CC0') && u.pathname !== '/publicdomain/zero/1.0/') || (asset.license.startsWith('Public domain mark') && u.pathname !== '/publicdomain/mark/1.0/')) return '音乐许可名称与链接不一致';
  return '';
}
export async function searchMusicSources(query = '', config = {}, { providers = ['scottbuckley', 'openverse'], signal, fetch: fetcher = globalThis.fetch } = {}) {
  if (typeof query !== 'string' || query.length > 200) throw new Error('音乐检索词不能超过 200 字符');
  const enabled = [...new Set(providers)].filter((p) => ['scottbuckley', 'openverse'].includes(p));
  if (!enabled.length) throw new Error('没有可用音乐来源');
  const outcomes = await Promise.allSettled(enabled.map(async (provider) => {
    const key = `${provider}:${query.toLowerCase().trim()}`, saved = cache.get(key);
    if (saved && Date.now() - saved.at < 86400000) { for (const a of saved.assets) musicAssets.set(a.id, structuredClone(a)); return { provider, assets: structuredClone(saved.assets), cached: true }; }
    return shared(key, signal, async (operationSignal) => {
      const requestText = (url, options) => limitedText(url, { ...options, fetch: fetcher });
      const found = provider === 'scottbuckley' ? await searchScottBuckley(query, { requestText, signal: operationSignal }) : await searchOpenverse(query, 'audio', { requestJSON: async (url, options) => JSON.parse(await requestText(url, options)), signal: operationSignal });
      const assets = found.filter((a) => !musicLicenseError(a)).map((a) => ({ ...a, id: `${a.provider}:${a.sourceId}` }));
      for (const a of assets) { musicAssets.set(a.id, a); if (musicAssets.size > 500) musicAssets.delete(musicAssets.keys().next().value); }
      cache.set(key, { assets: structuredClone(assets), at: Date.now() }); if (cache.size > 100) cache.delete(cache.keys().next().value);
      return { provider, assets, cached: false };
    });
  }));
  signal?.throwIfAborted();
  const good = outcomes.filter((o) => o.status === 'fulfilled').map((o) => o.value);
  const warnings = outcomes.flatMap((o, i) => o.status === 'rejected' ? [`${enabled[i]}：${o.reason.message}`] : []);
  if (!good.length) throw new Error(warnings.join('；'));
  return { assets: good.flatMap((o) => o.assets), warnings, queriedSources: enabled, cached: good.every((o) => o.cached), notice: '音乐只在选用时下载；须将署名随视频发布。目录命中不代表已经混音或试听。' };
}

async function validateFile(file, signal) {
  const info = await stat(file);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) throw new Error('音乐文件大小无效');
  const metadata = await probe(file, signal);
  const streams = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:stream_disposition=attached_pic', '-of', 'json', file], signal)).streams || [];
  // MP3/FLAC cover art is valid; reject actual moving-picture tracks.
  if (!metadata.hasAudio || streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1) || metadata.duration <= 0 || metadata.duration > 1800) throw new Error('来源文件不是有效的独立音频');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-i', file, '-map', '0:a:0', '-f', 'null', '-'], signal);
  return { ...metadata, bytes: info.size, sha256: hash(await readFile(file)) };
}

// This does not add music to the video asset registry or silently change a mix.
// Caller receives an original audio file plus a receipt for the export manifest.
export async function acquireMusicAsset(id, directory, { signal, fetch: fetcher = globalThis.fetch } = {}) {
  const asset = musicAssets.get(typeof id === 'string' ? id : id?.id);
  if (!asset) throw new Error('请先检索并选取有效音乐来源');
  const licenseError = musicLicenseError(asset); if (licenseError) throw new Error(licenseError);
  const key = hash(JSON.stringify([asset.url, asset.license, asset.licenseUrl])), folder = path.resolve(directory);
  return shared(`download:${folder}:${key}`, signal, async (operationSignal) => {
    const bounded = AbortSignal.any([operationSignal, AbortSignal.timeout(120000)]);
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${key}.audio`), receipt = `${file}.json`;
    try {
      const previous = JSON.parse(await readFile(receipt, 'utf8')), actual = await validateFile(file, bounded);
      if (actual.sha256 !== previous.sha256 || previous.sourceUrl !== asset.sourceUrl || previous.license !== asset.license) throw new Error('音乐缓存凭据不一致');
      return { ...asset, ...previous, ...actual, localPath: file, cacheHit: true, downloadedBytes: 0 };
    } catch (error) { bounded.throwIfAborted(); }
    const temporary = `${file}.${randomUUID()}.part`;
    try {
      let licenseEvidence = asset.licenseEvidence;
      if (asset.provider === 'openverse') {
        const html = await limitedText(asset.sourceUrl, { signal: bounded, fetch: fetcher });
        const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap((m) => { try { return [new URL(m[1].replaceAll('&amp;', '&'), asset.sourceUrl).href]; } catch { return []; } });
        if (!links.includes(asset.url) || !links.includes(asset.licenseUrl)) throw new Error('Openverse 原来源页未同时确认当前音频文件与许可，已暂停下载');
        licenseEvidence = { method: 'source-page-links', sourceUrl: asset.sourceUrl, sha256: hash(html), requiresSourceVerification: false, checkedAt: new Date().toISOString() };
      }
      const r = await response(asset.url, { signal: bounded, fetch: fetcher });
      if (r.status !== 200) { await r.body?.cancel(); throw new Error('音乐源未返回完整文件（需要 HTTP 200）'); }
      if (!r.body || Number(r.headers.get('content-length')) > MAX_BYTES) { await r.body?.cancel(); throw new Error('音乐文件超过 48MB 上限'); }
      let bytes = 0;
      const limiter = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; callback(bytes > MAX_BYTES ? new Error('音乐文件超过 48MB 上限') : null, chunk); } });
      await pipeline(Readable.fromWeb(r.body), limiter, createWriteStream(temporary, { flags: 'wx' }), { signal: bounded });
      if (r.headers.has('content-length') && bytes !== Number(r.headers.get('content-length'))) throw new Error('音乐文件传输不完整');
      const actual = await validateFile(temporary, bounded);
      const record = { ...asset, ...actual, licenseEvidence, acquiredAt: new Date().toISOString(), acquiredUrl: r.url || asset.url, fullDecode: true };
      await rename(temporary, file); await writeFile(receipt, JSON.stringify(record, null, 2));
      return { ...record, localPath: file, cacheHit: false, downloadedBytes: bytes };
    } finally { await rm(temporary, { force: true }); }
  });
}
