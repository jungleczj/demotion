import { SCOTT_BUCKLEY_TRACKS } from './source-adapters/scottbuckley.mjs';
import { acquireCuratedMusic } from './music-sources.mjs';

const cues = {
  tension: ['danger', 'dangerous', 'survival', 'storm', 'threat', 'conflict', 'mystery', 'suspense', 'crime', 'disaster', 'predator', 'peril', 'war', 'missile', 'artillery', 'battle', 'weapon', '危险', '生存', '风暴', '危机', '冲突', '悬疑', '灾难', '捕食', '紧张', '战争', '导弹', '火炮', '战斗', '武器'],
  exploration: ['exploration', 'explore', 'expedition', 'discovery', 'journey', 'ocean', 'sea', 'wildlife', 'nature', 'space', 'planet', 'science', '探索', '探险', '发现', '旅程', '海洋', '大海', '野生', '自然', '太空', '宇宙', '星球', '科学'],
  reflective: ['reflection', 'memory', 'history', 'culture', 'philosophy', 'nostalgia', 'reflective', 'documentary', '回忆', '历史', '文化', '哲学', '思考', '沉思', '纪录片'],
};
function matches(text, word) {
  return /[^a-z]/i.test(word) ? text.includes(word) : new RegExp(`\\b${word}\\b`, 'i').test(text);
}
export function rankMusicForProject(project = {}) {
  // Only existing editorial text participates. No prompts, model requests,
  // source searches or credentials are needed for this decision.
  const script = String(project.script || '').trim();
  const narration = script || (project.scenes || []).slice(0, 100).map((scene) => String(scene.text || '').slice(0, 1000)).join(' ');
  const fields = [
    [String(project.title || '').slice(0, 500), 4], [String(project.topic || '').slice(0, 500), 4],
    [narration.slice(0, 20000), 1],
  ].map(([text, weight]) => [text.toLowerCase(), weight]);
  const scores = Object.fromEntries(Object.entries(cues).map(([mood, words]) => [mood, words.reduce((sum, word) => sum + fields.reduce((n, [text, weight]) => n + (matches(text, word) ? weight : 0), 0), 0)]));
  const mood = Object.keys(cues).sort((a, b) => scores[b] - scores[a])[0];
  const selectedMood = scores[mood] ? mood : 'reflective';
  const primary = SCOTT_BUCKLEY_TRACKS.find((track) => track.mood === selectedMood);
  const ranked = [primary, ...SCOTT_BUCKLEY_TRACKS.filter((track) => track !== primary)];
  return { version: 1, mood: selectedMood, requestedTrackId: `scottbuckley:${primary.slug}`,
    reason: scores[mood] ? `Existing title/topic/script cues: ${selectedMood}` : 'Conservative reflective documentary default',
    scores, rankedTrackIds: ranked.map((track) => `scottbuckley:${track.slug}`) };
}

export async function selectBackgroundMusic(directory, { project, signal, fetch: fetcher = globalThis.fetch } = {}) {
  const ranked = rankMusicForProject(project), attempts = [];
  const finish = (source) => ({ source, selection: { ...ranked, selectedTrackId: source.id, cachePreferred: source.cacheHit === true,
    fallback: source.id !== ranked.requestedTrackId, attempts } });
  // A verified relevant original wins immediately. If missing, a verified
  // conservative fallback preserves music without waiting on a cold network.
  for (const id of ranked.rankedTrackIds.slice(0, 2)) {
    try {
      const source = await acquireCuratedMusic(id, directory, { signal, fetch: fetcher, cacheOnly: true });
      attempts.push({ id, mode: 'cache', status: 'ready' }); return finish(source);
    } catch (error) { signal?.throwIfAborted(); attempts.push({ id, mode: 'cache', status: 'unavailable', reason: String(error.message).slice(0, 200) }); }
  }
  const coldIds = [...new Set([ranked.requestedTrackId, 'scottbuckley:undertow'])];
  // At most two candidates, started together. Each has its own 10s deadline
  // within the caller's overall 20s preparation budget; no library-wide retry.
  const results = await Promise.allSettled(coldIds.map(async (id) => {
    const timeout = AbortSignal.timeout(10000), bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
    return acquireCuratedMusic(id, directory, { signal: bounded, fetch: fetcher });
  }));
  results.forEach((result, index) => attempts.push({ id: coldIds[index], mode: 'cold', status: result.status === 'fulfilled' ? 'ready' : 'unavailable',
    ...(result.status === 'rejected' ? { reason: String(result.reason.message).slice(0, 200) } : {}) }));
  signal?.throwIfAborted();
  const ready = results.find((result) => result.status === 'fulfilled');
  if (ready) return finish(ready.value);
  throw new Error(attempts.filter((attempt) => attempt.mode === 'cold').map((attempt) => `${attempt.id}: ${attempt.reason}`).join('; ') || '背景音乐暂不可用');
}

export async function prewarmCuratedMusic(directory, { signal, fetch: fetcher = globalThis.fetch, cacheOnly = false, trackIds } = {}) {
  const ids = trackIds || SCOTT_BUCKLEY_TRACKS.map((track) => `scottbuckley:${track.slug}`);
  if (!Array.isArray(ids) || ids.length > SCOTT_BUCKLEY_TRACKS.length || new Set(ids).size !== ids.length || ids.some((id) => !SCOTT_BUCKLEY_TRACKS.some((track) => id === `scottbuckley:${track.slug}`))) throw new Error('音乐预热仅接受已核准的小曲库曲目');
  const results = new Array(ids.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, ids.length) }, async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      try { results[index] = { source: await acquireCuratedMusic(ids[index], directory, { signal, fetch: fetcher, cacheOnly }) }; }
      catch (error) { signal?.throwIfAborted(); results[index] = { error: `${ids[index]}: ${error.message}` }; }
    }
  }));
  const tracks = results.flatMap((result) => result.source ? [result.source] : []), warnings = results.flatMap((result) => result.error ? [result.error] : []);
  if (cacheOnly && warnings.length) throw new Error(`已验证的小曲库缓存不完整：${warnings.join('; ')}`);
  return { tracks, warnings, totalBytes: tracks.reduce((sum, track) => sum + track.bytes, 0), downloadedBytes: tracks.reduce((sum, track) => sum + track.downloadedBytes, 0) };
}
