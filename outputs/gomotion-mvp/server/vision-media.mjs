import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { assets } from './sources.mjs';
import { run, probe } from './process.mjs';
import { ensurePlayback } from './playback.mjs';
import { prepareNarrationTimeline } from './narration-timeline.mjs';

export const MAX_ANALYSIS_SECONDS = 60;
const JOB_LIMIT = 96 * 1024 * 1024;

export async function prepareMedia(assetId, directory, job, config, localAsset) {
  const started = performance.now();
  const timings = { playbackMs: null, statMs: 0, probeMs: 0, ffmpegMs: 0, frameReadMs: 0, videoReadMs: 0,
    queueMs: null, downloadMs: null, playbackPhases: null, ffmpegInvocations: 0, playbackBypassed: Boolean(localAsset?.localPath) };
  const event = { stage: 'prepare-media-phases', engine: 'media-reader', assetId, status: 'running', at: new Date().toISOString(), timings,
    timingScope: 'playbackMs measures this caller waiting for ensurePlayback; playbackPhases measures its shared preparation operation, including queue, download, validation and normalization. Local-file analysis bypasses playback, leaving queue/download null.' };
  (job.events ||= []).push(event);
  const measure = async (field, action) => {
    const phaseStarted = performance.now();
    try { return await action(); } finally { timings[field] = Math.round(((timings[field] || 0) + performance.now() - phaseStarted) * 1000) / 1000; }
  };
  try {
    const asset = localAsset || assets.get(assetId);
    if (!asset) throw new Error('素材目录已失效');
    const signal = job.controller.signal;
    const prefix = path.join(directory, `asset-${job.mediaIndex++}`);
    // Analysis, browser playback and export share a fully decoded compatible file.
    const ready = localAsset?.localPath ? null : await measure('playbackMs', () => ensurePlayback(asset, { ...config, playbackTimeoutMs: 45000, playbackPreviewSeconds: Math.min(300, Math.max(30, (Number(asset.preferredStart) || 0) + (Number(config.analysisSeconds) || 8) * 1.8 + 2)) }, false, signal));
    const source = localAsset?.localPath || ready.file;
    if (ready?.timings) {
      timings.playbackPhases = ready.timings;
      timings.queueMs = ready.timings.queueMs;
      timings.downloadMs = ready.timings.downloadMs;
    }
    const bytes = (await measure('statMs', () => stat(source))).size;
    if (!localAsset) {
      job.bytes += bytes;
      if (job.bytes > JOB_LIMIT) throw new Error('候选画面累计读取达到 96MB 上限');
    }
    // ensurePlayback has already probed this exact output, including cache reads.
    const info = ready || await measure('probeMs', () => probe(source, signal));
    const offset = Math.max(0, Math.min(info.duration - .05, Number(localAsset?.analysisStart ?? asset.preferredStart) || 0));
    const required = Math.max(2, Number(config.analysisSeconds) || 8);
    const window = localAsset?.includeAudio ? Math.min(MAX_ANALYSIS_SECONDS, Math.max(.05, Number(localAsset.analysisDuration) || MAX_ANALYSIS_SECONDS)) : Math.min(300, Math.max(8, required * 1.8 + 2));
    const duration = asset.kind === 'image' ? 0 : Math.min(window, info.duration - offset);
    if (asset.kind === 'video' && duration < (localAsset?.includeAudio ? .05 : 2)) throw new Error('无法读取素材的有效视频时长');
    const frames = [];
    const count = localAsset?.includeAudio && config.visionProvider === 'gemini' ? 0 : asset.kind === 'image' ? 1 : 10;
    // Frames cover the measured interval, with original source timestamps.
    const imagePattern = `${prefix}-%02d.jpg`;
    const frameStep = count <= 1 ? 1 : duration / count;
    const wantsVideo = config.visionProvider === 'gemini' && asset.kind === 'video';
    const videoFile = `${prefix}.mp4`;
    const frameFilter = `${count > 1 ? `fps=${1 / frameStep}:start_time=0:round=near,` : ''}scale=512:-2`;
    const videoFilter = duration > 60 && !localAsset?.includeAudio ? 'scale=320:-2,fps=4' : 'scale=480:-2,fps=8';
    const videoOutput = ['-t', duration.toFixed(3), ...(localAsset?.includeAudio ? ['-c:a', 'aac', '-b:a', '64k', '-ar', '24000', '-ac', '1'] : ['-an']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', duration > 60 ? '36' : '32', ...(duration > 60 ? ['-maxrate', '100k', '-bufsize', '200k'] : []), '-threads', '1', '-movflags', '+faststart', videoFile];
    if (count && wantsVideo) {
      // One decoder feeds both unchanged sampling grids. Limit filter concurrency so
      // independent scene workers do not each create a machine-sized filter pool.
      const filters = `[0:v:0]split=2[stills][proxy];[stills]${frameFilter}[frames];[proxy]${videoFilter}[video]`;
      timings.ffmpegInvocations++;
      await measure('ffmpegMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', String(offset), '-t', String(duration), '-i', source,
        '-filter_complex_threads', '1', '-filter_complex', filters,
        '-map', '[frames]', '-frames:v', String(count), '-q:v', '5', '-start_number', '0', imagePattern,
        '-map', '[video]', ...videoOutput], signal));
    } else if (count) {
      timings.ffmpegInvocations++;
      await measure('ffmpegMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', ...(asset.kind === 'video' ? ['-ss', String(offset), '-t', String(duration)] : []), '-i', source, '-frames:v', String(count), '-vf', frameFilter, '-q:v', '5', '-start_number', '0', imagePattern], signal));
    } else if (wantsVideo) {
      timings.ffmpegInvocations++;
      await measure('ffmpegMs', () => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', String(offset), '-i', source, '-vf', videoFilter, ...videoOutput], signal));
    }
    await measure('frameReadMs', async () => {
      for (let i = 0; i < count; i++) {
        signal.throwIfAborted();
        const timestamp = offset + i * frameStep;
        const file = `${prefix}-${String(i).padStart(2, '0')}.jpg`;
        try { frames.push({ timestamp, mime: 'image/jpeg', data: (await readFile(file)).toString('base64') }); } catch (error) { if (error.code === 'ENOENT' && frames.length) break; throw error; }
      }
    });
    let video = null;
    if (wantsVideo) {
      await measure('videoReadMs', async () => {
        if ((await stat(videoFile)).size > 5 * 1024 * 1024) throw new Error('低清片段超过模型输入上限');
        video = { mime: 'video/mp4', data: (await readFile(videoFile)).toString('base64') };
      });
    }
    event.status = 'completed';
    return { asset, source, duration, offset, audioIncluded: Boolean(localAsset?.includeAudio), sourceDuration: info.duration, width: info.width, height: info.height, frames, video, timings };
  } catch (error) {
    if (error.playbackTimings) {
      timings.playbackPhases = error.playbackTimings;
      timings.queueMs = error.playbackTimings.queueMs;
      timings.downloadMs = error.playbackTimings.downloadMs;
    }
    event.status = 'failed'; event.detail = error.message;
    throw error;
  } finally {
    event.durationMs = Math.round((performance.now() - started) * 1000) / 1000;
  }
}

export function mediaParts(media) {
  const header = { text: JSON.stringify({ assetId: media.asset.id, catalogTitle: media.asset.title, catalogDescription: media.asset.description, catalogIsUntrusted: true, sourceStart: media.offset || 0, analyzedUntil: (media.offset || 0) + media.duration, sourceDuration: media.sourceDuration, kind: media.asset.kind, note: media.video ? `The video begins at source time ${media.offset || 0}. Only this provided interval was inspected. Audio included: ${media.audioIncluded}.` : 'Sparse sampled frames only. Do not claim continuous motion or unseen identity. Times are original source seconds.' }) };
  if (media.video) return [header, media.video];
  return [header, ...media.frames.flatMap((frame) => [{ text: `asset ${media.asset.id} / source timestamp ${frame.timestamp.toFixed(3)} seconds` }, { mime: frame.mime, data: frame.data }])];
}

export async function measureNarration(project, directory, job, config) {
  const narration = await prepareNarrationTimeline(project, config, job, directory);
  job.narrationTrack = narration.track;
  return narration.scenes;
}
