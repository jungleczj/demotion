import { run } from './process.mjs';
const cache = new Map();

// Remove only stable, centered baked-in letter/pillarboxing. Never infer a crop from a single dark frame.
export async function contentCrop(file, info, start, duration, signal) {
  const key = `${file}:${start.toFixed(2)}:${duration.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  let crop = '';
  try {
    const log = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-threads', '1', '-ss', String(start), '-t', String(Math.min(3, duration)), '-i', file, '-an', '-vf', 'fps=6,cropdetect=limit=24:round=2:reset=0', '-f', 'null', '-'], signal, true);
    const matches = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map((m) => m.slice(1).map(Number));
    const last = matches.at(-1);
    if (last && matches.length >= 5 && matches.slice(-5).every((v) => v.every((n, i) => Math.abs(n - last[i]) <= 2))) {
      const [w, h, x, y] = last;
      const centered = Math.abs(2 * x + w - info.width) <= 6 && Math.abs(2 * y + h - info.height) <= 6;
      const vertical = x > info.width * .035 && h >= info.height * .96 && y <= info.height * .02;
      const horizontal = y > info.height * .035 && w >= info.width * .96 && x <= info.width * .02;
      if (centered && (vertical || horizontal) && w * h >= info.width * info.height * .25) crop = `crop=${w}:${h}:${x}:${y},`;
    }
  } catch (error) { if (signal?.aborted) throw error; }
  cache.set(key, crop); if (cache.size > 100) cache.delete(cache.keys().next().value);
  return crop;
}
