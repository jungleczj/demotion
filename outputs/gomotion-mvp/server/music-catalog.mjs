import { SCOTT_BUCKLEY_TRACKS, verifyScottBuckleyTrack } from './source-adapters/scottbuckley.mjs';
import { MUSIC_UPLOAD_MAX_BYTES, MUSIC_UPLOAD_EXTENSIONS } from './music-upload-input.mjs';

export const MUSIC_GENRES = Object.freeze([
  { id: 'auto', label: '自动选择' }, { id: 'epic', label: '史诗' }, { id: 'documentary', label: '纪录片' },
  { id: 'tension', label: '紧张' }, { id: 'emotional', label: '情感' }, { id: 'chill', label: '轻松' }, { id: 'upbeat', label: '欢快' },
]);
// Durations measured from the three fully decoded, rights-verified originals.
// Categories describe those recordings; an empty category stays empty.
export const MUSIC_TRACK_DETAILS = Object.freeze({
  undertow: { duration: 249.930975, genres: ['documentary', 'emotional', 'chill'] },
  'the-great-sea': { duration: 281.911791, genres: ['epic', 'documentary', 'emotional'] },
  machina: { duration: 290.895737, genres: ['tension', 'documentary'] },
});
export function musicCatalog() {
  return { genres: MUSIC_GENRES.map((g) => ({ ...g })), tracks: SCOTT_BUCKLEY_TRACKS.map((track) => ({
    id: `scottbuckley:${track.slug}`, title: track.title, author: 'Scott Buckley', ...MUSIC_TRACK_DETAILS[track.slug], genres: [...MUSIC_TRACK_DETAILS[track.slug].genres],
    previewUrl: `/api/music/preview?id=${encodeURIComponent(`scottbuckley:${track.slug}`)}`,
  })), upload: { maxBytes: MUSIC_UPLOAD_MAX_BYTES, acceptedExtensions: [...MUSIC_UPLOAD_EXTENSIONS] } };
}

export function audioByteResponse(bytes, request, type = 'audio/mpeg') {
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' };
  const range = request.headers.get('range');
  let start = 0, end = bytes.length - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${bytes.length}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length || !match[1] && Number(match[2]) === 0) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${bytes.length}` } });
    status = 206; headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
  }
  headers['content-length'] = String(end - start + 1);
  return new Response(request.method === 'HEAD' ? null : bytes.subarray(start, end + 1), { status, headers });
}

const previewRights = new Map();
export async function curatedMusicPreviewRedirect(id, { signal, fetch: fetcher = globalThis.fetch } = {}) {
  const track = SCOTT_BUCKLEY_TRACKS.find((track) => id === `scottbuckley:${track.slug}`);
  if (!track) throw Object.assign(Error('曲目不存在'), { status: 404 });
  const previous = previewRights.get(id);
  if (!previous || Date.now() - previous > 86_400_000) {
    const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    await verifyScottBuckleyTrack(track, { signal: bounded, requestText: async (url) => {
      const response = await fetcher(url, { signal: bounded, redirect: 'error' });
      if (!response.ok || Number(response.headers.get('content-length')) > 1_000_000) throw Error('音乐许可页面暂不可用');
      const reader = response.body?.getReader(), chunks = []; let bytes = 0;
      if (!reader) throw Error('音乐许可页面无内容');
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1_000_000) { await reader.cancel(); throw Error('音乐许可页面过大'); } chunks.push(Buffer.from(chunk.value)); } }
      finally { reader.releaseLock(); }
      return Buffer.concat(chunks).toString('utf8');
    } });
    previewRights.set(id, Date.now());
  }
  // The original's 10–12MB response must bypass the Vercel Function payload
  // limit. A 307 retains the browser Range header at the fixed official URL.
  return new Response(null, { status: 307, headers: { location: track.url, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' } });
}
