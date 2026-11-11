import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, rm, readdir, rename, utimes, open } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { workDirectory } from './runtime.mjs';
import { assets, ensureAnalysisPreview } from './sources.mjs';
import { run, probe } from './process.mjs';
import { mediaQualityError, outputProfile } from './media-quality.mjs';
import { contentCrop } from './framing.mjs';
import { sharedOperations } from './shared-operation.mjs';

const folder = path.join(workDirectory, 'playback');
const FILE_LIMIT = 24 * 1024 * 1024;
const SOURCE_LIMIT = 48 * 1024 * 1024;
const CACHE_LIMIT = 256 * 1024 * 1024;
const requestPlayback = sharedOperations();
const failures = new Map();
const warm = new Map();
const fileInfo = new Map();
const roundedMs = (value) => Math.round(value * 1000) / 1000;
const newTimings = () => ({ cacheHit: false, metadataMs: 0, queueMs: 0, downloadMs: 0, downloadBytes: 0, sourceProbeMs: 0,
  cropMs: 0, transcodeMs: 0, outputProbeMs: 0, commitMs: 0, thumbnailMs: 0, cacheProbeMs: 0, totalMs: 0 });
async function measure(timings, name, action) {
  const started = performance.now();
  try { return await action(); } finally { timings[name] = roundedMs(timings[name] + performance.now() - started); }
}
let commits = Promise.resolve();
async function commit(action) {
  const previous = commits; let finish; commits = new Promise((resolve) => { finish = resolve; });
  await previous; try { return await action(); } finally { finish(); }
}
const waiting = [];
let active = 0;
async function slot(signal) {
  signal?.throwIfAborted();
  if (active < 4) active++;
  else await new Promise((resolve, reject) => {
    const wake = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const abort = () => { const index = waiting.indexOf(wake); if (index >= 0) waiting.splice(index, 1); reject(signal.reason); };
    waiting.push(wake); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next(); else active--;
  };
  if (signal?.aborted) { release(); throw signal.reason; }
  return release;
}
function previewSpan(asset, config = {}) {
  const sourceDuration = Number(asset.sourceDuration || asset.duration) || 90;
  const requested = Number(config.playbackPreviewSeconds) || Number(asset.playbackSeconds) || (sourceDuration > 300 ? 90 : sourceDuration);
  return Math.min(300, Math.max(Number(asset.playbackSeconds) || 0, Math.ceil(Math.max(2, requested) / 30) * 30));
}
export const playbackKey = (asset, seconds = previewSpan(asset)) => createHash('sha256').update(`${asset.id}:h264-hd720-v5:${asset.localPath || asset.url}:${seconds}`).digest('hex');
export const playbackPath = (key) => path.join(folder, `${key}.mp4`);
const playbackAliases = (asset, key) => [...new Set([...(asset.playbackAliases || []), ...(asset.playbackKey && asset.playbackKey !== key ? [asset.playbackKey] : [])])].slice(-8);

async function prune(reserve = 0) {
  const files = await Promise.all((await readdir(folder)).filter((n) => /^[a-f0-9]{64}\.mp4$/.test(n)).map(async (n) => ({ file: path.join(folder, n), info: await stat(path.join(folder, n)) })));
  let bytes = files.reduce((sum, f) => sum + f.info.size, 0);
  for (const f of files.sort((a, b) => a.info.mtimeMs - b.info.mtimeMs)) {
    if (bytes + reserve <= CACHE_LIMIT && Date.now() - f.info.mtimeMs < 24 * 3600_000) break;
    if (Date.now() < (warm.get(path.basename(f.file, '.mp4')) || 0)) continue;
    await Promise.all([f.file, f.file.replace(/\.mp4$/, '.jpg')].map((file) => rm(file, { force: true }))); bytes -= f.info.size;
  }
  if (bytes + reserve > CACHE_LIMIT) throw new Error('视频缓存正在被使用，请稍后再载入更多候选');
}

async function createPlayback(asset, key, config, timings, started, operationSignal) {
  const timeout = AbortSignal.timeout(config.playbackTimeoutMs || 150000);
  const signal = AbortSignal.any([operationSignal, timeout]);
  const release = await measure(timings, 'queueMs', () => slot(signal));
  const source = path.join(folder, `${key}-${randomUUID()}.source`);
  const partial = `${source}.mp4`;
  try {
    let input = asset.localPath;
    if (!input) {
      await measure(timings, 'downloadMs', async () => {
        const url = asset.url;
        if (!/^https:\/\//.test(url || '')) throw new Error('素材缺少有效视频地址');
        const response = await fetch(url, { signal, headers: { 'User-Agent': 'GoMotionLocalMVP/0.1' } });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new Error(`来源${response.status === 429 ? '限流' : response.status === 403 ? '拒绝访问' : '下载失败'}（HTTP ${response.status}）`);
        }
        if (Number(response.headers.get('content-length')) > SOURCE_LIMIT) { await response.body.cancel(); throw new Error('高清原片超过本次 48MB 下载上限，自动寻找其他高清素材'); }
        const limiter = new Transform({ transform(chunk, encoding, callback) { timings.downloadBytes += chunk.length; callback(timings.downloadBytes > SOURCE_LIMIT ? new Error('高清原片超过单文件 48MB 下载上限') : null, chunk); } });
        await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(source), { signal });
      });
      input = source;
    }
    const info = await measure(timings, 'sourceProbeMs', () => probe(input, signal));
    if (!info.width || info.duration < 2 || info.duration > 3600) throw new Error('素材没有可用的视频轨道或超过本次读取范围');
    const format = config.outputFormat || (info.width > info.height ? 'landscape' : 'portrait');
    const qualityError = mediaQualityError(info.width, info.height, format);
    if (qualityError) throw new Error(qualityError);
    const target = outputProfile(format);
    const previewSeconds = Math.min(info.duration, config.playbackPreviewSeconds || (info.duration > 300 ? 90 : info.duration));
    const crop = await measure(timings, 'cropMs', () => contentCrop(input, info, 0, Math.min(3, previewSeconds), signal));
    const actual = /^crop=(\d+):(\d+):/.exec(crop);
    const contentError = actual && mediaQualityError(Number(actual[1]), Number(actual[2]), format);
    if (contentError) throw new Error(contentError);
    // Decode the full bounded preview, including up to 90s of a longer archival source. Browser and export share this exact clip.
    const scale = `${crop}scale=${target.width}:${target.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${target.width}:${target.height}`;
    await measure(timings, 'transcodeMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '1', '-filter_threads', '1', '-i', input, '-t', String(previewSeconds), '-map', '0:v:0', '-an', '-vf', `${scale},setsar=1,fps=${target.fps},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '3000k', '-bufsize', '6000k', '-threads', '2', '-movflags', '+faststart', partial], signal));
    const size = (await stat(partial)).size;
    if (size > FILE_LIMIT) throw new Error('兼容视频超过 24MB，已自动跳过');
    const output = await measure(timings, 'outputProbeMs', () => probe(partial, signal));
    const outputError = mediaQualityError(output.width, output.height, format);
    if (outputError) throw new Error(outputError);
    if (output.width !== target.width || output.height !== target.height) throw new Error('视频输出画幅与项目不一致，已自动排除');
    if (Math.abs(output.duration - previewSeconds) > .5) throw new Error('视频未完整解码，已自动跳过');
    await measure(timings, 'commitMs', () => commit(async () => { signal.throwIfAborted(); await prune(size); signal.throwIfAborted(); await rename(partial, playbackPath(key)); warm.set(key, Date.now() + 5 * 60000); }));
    await measure(timings, 'thumbnailMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', playbackPath(key), '-frames:v', '1', '-vf', 'scale=480:-2', playbackPath(key).replace(/\.mp4$/, '.jpg')], signal));
    const checked = { playbackChecked: true, playbackKey: key, playbackAliases: playbackAliases(asset, key), playbackSeconds: config.playbackPreviewSeconds, sourceDuration: info.duration, playbackWidth: output.width, playbackHeight: output.height, duration: output.duration };
    fileInfo.set(key, { size, info: output });
    Object.assign(asset, checked); if (assets.has(asset.id)) Object.assign(assets.get(asset.id), checked);
    return { key, file: playbackPath(key), duration: output.duration, width: output.width, height: output.height, timings };
  } catch (error) {
    // An explicit subscriber cancellation must not poison a fresh retry with a
    // one-minute failure entry. Timeout/source failures retain the normal cache.
    if (operationSignal.aborted) throw operationSignal.reason;
    const message = signal.aborted ? '素材准备超时，来源响应或解码速度过慢' : error.message.startsWith('ffmpeg') || error.message.startsWith('ffprobe') ? '视频无法完整解码，已自动排除' : error.message;
    failures.set(key, { at: Date.now(), error: message });
    if (failures.size > 200) failures.delete(failures.keys().next().value);
    const failure = new Error(message); failure.playbackTimings = timings;
    throw failure;
  } finally {
    await Promise.all([source, partial].map((file) => rm(file, { force: true })));
    release();
    timings.totalMs = roundedMs(performance.now() - started);
  }
}

export async function ensurePlayback(asset, config, retry = false, signal) {
  signal?.throwIfAborted();
  const identity = `${asset.id}:${config.outputFormat || 'auto'}:${previewSpan(asset, config)}`;
  return requestPlayback(identity, signal, async (operationSignal) => {
  const started = performance.now(), timings = newTimings();
  if (asset.kind !== 'video') throw new Error('当前成片只允许动态视频素材');
  const qualityError = config.outputFormat && mediaQualityError(asset.width, asset.height, config.outputFormat, true);
  if (qualityError) throw new Error(qualityError);
  await mkdir(folder, { recursive: true });
  await measure(timings, 'metadataMs', () => ensureAnalysisPreview(asset, config, operationSignal));
  operationSignal.throwIfAborted();
  const seconds = previewSpan(asset, config), key = playbackKey(asset, seconds), file = playbackPath(key);
  if (retry) { fileInfo.delete(key); await Promise.all([file, file.replace(/\.mp4$/, '.jpg')].map((f) => rm(f, { force: true }))); }
  try {
    const size = (await stat(file)).size;
    if (size > 0) {
      await utimes(file, new Date(), new Date());
      warm.set(key, Date.now() + 5 * 60000);
      const cached = fileInfo.get(key);
      const info = cached?.size === size ? cached.info : await measure(timings, 'cacheProbeMs', () => probe(file, operationSignal));
      fileInfo.set(key, { size, info }); if (fileInfo.size > 200) fileInfo.delete(fileInfo.keys().next().value);
      const qualityError = mediaQualityError(info.width, info.height, config.outputFormat || (info.width > info.height ? 'landscape' : 'portrait'));
      if (qualityError) throw new Error(qualityError);
      const thumbnail = file.replace(/\.mp4$/, '.jpg');
      try { await stat(thumbnail); } catch {
        await measure(timings, 'thumbnailMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', thumbnail], operationSignal));
      }
      const checked = { playbackChecked: true, playbackKey: key, playbackAliases: playbackAliases(asset, key), playbackSeconds: seconds, playbackWidth: info.width, playbackHeight: info.height, duration: info.duration };
      operationSignal.throwIfAborted();
      Object.assign(asset, checked); if (assets.has(asset.id)) Object.assign(assets.get(asset.id), checked);
      timings.cacheHit = true; timings.totalMs = roundedMs(performance.now() - started);
      return { key, file, duration: asset.duration, width: asset.playbackWidth, height: asset.playbackHeight, timings };
    }
  } catch { operationSignal.throwIfAborted(); }
  const failure = failures.get(key);
  if (failure && !retry && Date.now() - failure.at < 60000) throw new Error(failure.error);
  return createPlayback(asset, key, { ...config, playbackPreviewSeconds: seconds }, timings, started, operationSignal);
  });
}

export async function playableResults(candidates, config, count = 6) {
  const accepted = [], warnings = [];
  // Small batches limit memory and disk use. A broken result never enters the selectable list.
  for (let i = 0; i < Math.min(12, candidates.length) && accepted.length < count; i += 2) {
    const batch = candidates.slice(i, i + 2).filter((a) => a.kind === 'video');
    const outcomes = await Promise.allSettled(batch.map((a) => verifiedAsset(a, config)));
    outcomes.forEach((result, j) => {
      if (result.status === 'fulfilled') accepted.push(result.value);
      else warnings.push(`${batch[j].id} 已排除：${result.reason.message}`);
    });
  }
  return { assets: accepted.slice(0, count), warnings };
}

export async function verifiedAsset(asset, config, signal) {
  const ready = await ensurePlayback(asset, config, false, signal);
  signal?.throwIfAborted();
  // A downloadable result must be a readable local file, not merely a catalog URL.
  const handle = await open(ready.file, 'r');
  let size;
  try {
    size = (await handle.stat()).size;
    const buffer = Buffer.alloc(32);
    const first = await handle.read(buffer, 0, buffer.length, 0);
    const last = await handle.read(buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    if (first.bytesRead !== buffer.length || last.bytesRead !== buffer.length) throw new Error('视频文件不完整或无法读取');
  } finally { await handle.close(); }
  signal?.throwIfAborted();
  const checked = { playbackChecked: true, downloadChecked: true, playbackKey: ready.key,
    playbackUrl: `/api/playback/${ready.key}.mp4`, downloadUrl: `/api/playback/${ready.key}.mp4?download=1`, downloadBytes: size };
  Object.assign(asset, checked);
  if (assets.has(asset.id)) Object.assign(assets.get(asset.id), checked);
  return asset;
}
