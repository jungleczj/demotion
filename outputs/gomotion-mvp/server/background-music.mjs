import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm } from 'node:fs/promises';
import { acquireDefaultMusic, musicLicenseError } from './music-sources.mjs';
import { run, probe } from './process.mjs';

export async function prepareBackgroundMusic(cacheDirectory, { signal, fetch: fetcher = globalThis.fetch, enabled = true, budgetMs = 20000 } = {}) {
  if (!enabled) return { status: 'disabled', mixed: false, narrationPreserved: true };
  const deadline = AbortSignal.timeout(Math.max(1, Math.min(20000, Number(budgetMs) || 20000)));
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const source = await acquireDefaultMusic(cacheDirectory, { signal: bounded, fetch: fetcher });
    return { status: 'ready', mixed: false, source };
  } catch (error) {
    return { status: 'unavailable', mixed: false, narrationPreserved: true, reason: String(error.message || '背景音乐暂不可用').slice(0, 500) };
  }
}

export async function mixBackgroundMusic(video, music, output, { duration, signal } = {}) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('配乐需要有效的整片时长');
  const licenseError = musicLicenseError(music);
  if (licenseError || music.fullDecode !== true || !music.localPath || !/^[a-f0-9]{64}$/.test(music.sha256 || '')) throw new Error(licenseError || '配乐原件未通过完整解码和来源校验');
  if (createHash('sha256').update(await readFile(music.localPath)).digest('hex') !== music.sha256) throw new Error('配乐原件散列已变化');
  const audio = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'json', video], signal)).streams?.[0];
  if (!audio) throw new Error('配乐前必须存在整片旁白');
  // Measure the existing narration without changing its samples or gain. A
  // fixed bed level can mask a softly recorded narrator even with ducking.
  const analysis = await run('ffmpeg', ['-hide_banner', '-i', video, '-map', '0:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], signal, true);
  const measured = analysis.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  const narrationLufs = measured ? Number(JSON.parse(measured).input_i) : NaN;
  if (!Number.isFinite(narrationLufs)) throw new Error('无法测得旁白响度，已保留原有声音');
  const targetMusicLufs = Math.min(-30, narrationLufs - 14), normaliseTarget = Math.max(-70, targetMusicLufs);
  const extraGain = Math.pow(10, (targetMusicLufs - normaliseTarget) / 20);
  const length = duration.toFixed(6), fadeIn = Math.min(.8, duration / 4), fadeOut = Math.min(2, duration / 3);
  const stereo = audio.channels === 1 ? 'pan=stereo|c0=c0|c1=c0' : 'aformat=channel_layouts=stereo';
  const graph = [
    `[0:a:0]aresample=48000,${stereo},apad,atrim=duration=${length},asetpts=PTS-STARTPTS,asplit=2[voice][sidechain]`,
    `[1:a:0]atrim=duration=${length},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,loudnorm=I=${normaliseTarget.toFixed(2)}:LRA=7:TP=-8,aresample=48000,volume=${extraGain.toFixed(8)},afade=t=in:d=${fadeIn.toFixed(6)},afade=t=out:st=${(duration - fadeOut).toFixed(6)}:d=${fadeOut.toFixed(6)}[bed]`,
    '[bed][sidechain]sidechaincompress=threshold=0.015:ratio=6:attack=15:release=500:makeup=1[ducked]',
    '[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[aout]',
  ];
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1', '-i', video, '-stream_loop', '-1', '-i', music.localPath, '-filter_complex', graph.join(';'), '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', length, '-movflags', '+faststart', output], signal);
  const actual = await probe(output, signal);
  if (!actual.hasAudio || Math.abs(actual.duration - duration) > .15) throw new Error('配乐成片音轨或时长校验失败');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-i', output, '-map', '0:a:0', '-f', 'null', '-'], signal);
  return { status: 'mixed', mixed: true, narrationPreserved: true,
    source: { ...music, localPath: music.localPath },
    mix: { version: 1, continuous: true, start: 0, end: duration, sourceOffset: 0, looped: duration > music.duration, narrationLufs, targetMusicLufs, narrationGain: 1,
      ducking: { threshold: .015, ratio: 6, attackMs: 15, releaseMs: 500 }, fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut,
      changes: 'Music trimmed or looped continuously, loudness adjusted, ducked beneath narration, faded at film boundaries.' } };
}

// Atomic replacement keeps the completed narration video available if a music
// source, decoder or mixer fails. Cancellation still cancels the export.
export async function addBackgroundMusic(video, cacheDirectory, { duration, signal, fetch: fetcher = globalThis.fetch, enabled = true, preparation } = {}) {
  if (!enabled) return { status: 'disabled', mixed: false, narrationPreserved: true };
  const temporary = `${video}.${randomUUID()}.music.mp4`;
  try {
    signal?.throwIfAborted();
    const prepared = await (preparation || prepareBackgroundMusic(cacheDirectory, { signal, fetch: fetcher }));
    signal?.throwIfAborted();
    if (prepared.status !== 'ready') return prepared;
    const result = await mixBackgroundMusic(video, prepared.source, temporary, { duration, signal });
    signal?.throwIfAborted();
    await rename(temporary, video);
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    return { status: 'unavailable', mixed: false, narrationPreserved: true, reason: String(error.message || '背景音乐暂不可用').slice(0, 500) };
  } finally { await rm(temporary, { force: true }); }
}
