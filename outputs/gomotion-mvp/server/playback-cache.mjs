import path from 'node:path';
import { readdir, stat, rm } from 'node:fs/promises';
import { retainedMedia } from './media-retention.mjs';

export async function prunePlaybackCache(folder, { reserve = 0, limit = 256 * 1024 * 1024, warm = new Map() } = {}) {
  const files = await Promise.all((await readdir(folder)).filter((name) => /^[a-f0-9]{64}\.mp4$/.test(name)).map(async (name) => ({ file: path.join(folder, name), info: await stat(path.join(folder, name)) })));
  let bytes = files.reduce((sum, file) => sum + file.info.size, 0);
  for (const file of files.sort((a, b) => a.info.mtimeMs - b.info.mtimeMs)) {
    if (bytes + reserve <= limit && Date.now() - file.info.mtimeMs < 24 * 3600_000) break;
    const thumbnail = file.file.replace(/\.mp4$/, '.jpg');
    if (retainedMedia(file.file) || retainedMedia(thumbnail)) continue;
    if (Date.now() < (warm.get(path.basename(file.file, '.mp4')) || 0)) continue;
    await Promise.all([file.file, thumbnail].map((target) => rm(target, { force: true })));
    bytes -= file.info.size;
  }
  if (bytes + reserve > limit) throw new Error('视频缓存正在被使用，请稍后再载入更多候选');
}
