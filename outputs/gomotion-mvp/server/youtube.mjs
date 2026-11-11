import { createHash } from 'node:crypto';
import { sharedOperations } from './shared-operation.mjs';

const DAY = 24 * 60 * 60 * 1000;
const validId = (id) => typeof id === 'string' && /^[\w-]{11}$/.test(id);
const failure = (message, status = 502, code = 'youtube-unavailable') => Object.assign(new Error(message), { status, code });
function durationSeconds(value) {
  const parts = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value || ''));
  return parts ? Number(parts[1] || 0) * 86400 + Number(parts[2] || 0) * 3600 + Number(parts[3] || 0) * 60 + Number(parts[4] || 0) : 0;
}
function thumbnail(snippet) {
  for (const item of [snippet.thumbnails?.high, snippet.thumbnails?.medium, snippet.thumbnails?.default]) {
    try { const url = new URL(item?.url); if (url.protocol === 'https:' && url.hostname === 'i.ytimg.com') return url.href; } catch {}
  }
  return '';
}

// Metadata only. A YouTube watch/embed URL must never masquerade as an editable
// MP4 or enter the playable/downloadable asset registry.
export function createYouTubeClient({ fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const shared = sharedOperations();
  async function request(endpoint, params, key, signal) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    let response;
    try {
      response = await fetcher(url, { headers: { 'X-Goog-Api-Key': key, Accept: 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    } catch {
      signal.throwIfAborted();
      throw failure('YouTube 搜索暂时无法连接，请稍后再试');
    }
    let data;
    try { data = await response.json(); } catch { throw failure('YouTube 返回了无法读取的搜索结果'); }
    if (!response.ok) {
      const reasons = (data?.error?.errors || []).map((item) => item.reason);
      if (response.status === 429 || reasons.some((reason) => ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason))) throw failure('YouTube 搜索额度已用完，请稍后重试', 429, 'youtube-quota');
      if ([400, 401, 403].includes(response.status)) throw failure('YouTube 连接未通过，请检查密钥、API 启用状态与应用限制', response.status, 'youtube-credentials');
      throw failure('YouTube 搜索暂不可用，请稍后再试');
    }
    if (!Array.isArray(data?.items)) throw failure('YouTube 返回的搜索结果格式不完整');
    return data.items;
  }
  return {
    async search(query, config = {}, { signal, license = 'creativeCommon', language = '', maxResults = 24 } = {}) {
      signal?.throwIfAborted();
      const key = String(config.youtubeKey || '').trim();
      if (!key) throw failure('请先连接 YouTube 搜索服务', 400, 'youtube-not-configured');
      if (typeof query !== 'string' || query.trim().length < 2 || query.length > 240) throw failure('请输入 2–240 字符的 YouTube 检索词', 400, 'youtube-query');
      if (!['creativeCommon', 'any'].includes(license) || (language && !/^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(language))) throw failure('YouTube 搜索条件无效', 400, 'youtube-query');
      const count = Number.isFinite(Number(maxResults)) ? Math.min(24, Math.max(1, Math.floor(Number(maxResults)))) : 24;
      const fingerprint = createHash('sha256').update(key).digest('hex');
      const cacheKey = JSON.stringify([fingerprint, query.trim(), license, language, count]);
      for (const [id, entry] of cache) if (entry.expiresAt <= now()) cache.delete(id);
      const existing = cache.get(cacheKey);
      if (existing) return { ...structuredClone(existing.result), cacheHit: true };
      return shared(cacheKey, signal, async (operationSignal) => {
        const params = { part: 'snippet', type: 'video', q: query.trim(), maxResults: count, safeSearch: 'strict', videoEmbeddable: 'true', videoLicense: license };
        if (language) params.relevanceLanguage = language;
        const found = await request('search', params, key, operationSignal);
        const ids = [...new Set(found.map((item) => item.id?.videoId).filter(validId))].slice(0, count);
        const details = ids.length ? await request('videos', { part: 'snippet,contentDetails,status', id: ids.join(',') }, key, operationSignal) : [];
        operationSignal.throwIfAborted();
        const byId = new Map(details.map((item) => [item.id, item]));
        const checkedAt = new Date(now()).toISOString();
        const references = ids.flatMap((id) => {
          const item = byId.get(id), snippet = item?.snippet, status = item?.status;
          const duration = durationSeconds(item?.contentDetails?.duration);
          if (!snippet || status?.privacyStatus !== 'public' || status?.embeddable !== true || status?.uploadStatus !== 'processed' || snippet.liveBroadcastContent !== 'none' || duration <= 0) return [];
          if (!['creativeCommon', 'youtube'].includes(status.license) || (license === 'creativeCommon' && status.license !== 'creativeCommon')) return [];
          return [{ videoId: id, title: String(snippet.title || '').slice(0, 240), description: String(snippet.description || '').slice(0, 4000), channelId: String(snippet.channelId || ''), channelTitle: String(snippet.channelTitle || '').slice(0, 240), publishedAt: String(snippet.publishedAt || ''), duration, thumbnail: thumbnail(snippet), watchUrl: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube.com/embed/${id}`, license: status.license, checkedAt, needsOriginal: true }];
        });
        const result = { references, cacheHit: false, checkedAt, notice: '搜索结果是来源参考；取得可用原文件并通过检查后，才能用于剪辑。' };
        while (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { result: structuredClone(result), expiresAt: now() + DAY });
        return structuredClone(result);
      }).then((result) => structuredClone(result));
    },
  };
}

const client = createYouTubeClient();
export const searchYouTubeReferences = (...args) => client.search(...args);
