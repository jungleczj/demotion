import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareMedia, mediaParts } from './vision-media.mjs';
import { run, probe } from './process.mjs';
import { assets } from './sources.mjs';
import { playbackPath } from './playback.mjs';

// Opt-in, local-only integration fixture: no API keys, fetches or service restarts.
const fixture = process.env.GOMOTION_MEDIA_FIXTURE;
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const makeJob = () => ({ controller: new AbortController(), mediaIndex: 0, bytes: 0, events: [] });

test('catalog media reuses verified playback dimensions and retains its measured preparation phases', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vision-playback-phases-'));
  const asset = { id: `local:playback-phases-${path.basename(folder)}`, provider: 'upload', kind: 'video', localPath: path.join(folder, 'source.mp4') };
  assets.set(asset.id, asset);
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', asset.localPath]);
    const job = makeJob();
    const media = await prepareMedia(asset.id, folder, job, { outputFormat: 'landscape', visionProvider: 'gemini', analysisSeconds: 2 });
    assert.deepEqual([media.width, media.height], [1280, 720]);
    assert.equal(media.timings.probeMs, 0, 'verified playback metadata should prevent a duplicate ffprobe process');
    assert.ok(media.timings.playbackPhases, 'catalog preparation must retain measured normalization phases');
    assert.equal(media.timings.playbackPhases.cacheHit, false);
    assert.ok(media.timings.playbackPhases.transcodeMs > 0);
    assert.ok(media.timings.queueMs >= 0);
    assert.equal(media.timings.downloadMs, 0);
    assert.equal(media.timings.playbackBypassed, false);
    assert.equal(job.events[0].timings.playbackPhases, media.timings.playbackPhases);
    assert.equal(media.frames.length, 10);
    await decodedHashes(path.join(folder, 'asset-0.mp4'));
  } finally {
    assets.delete(asset.id);
    await rm(folder, { recursive: true, force: true });
    if (asset.playbackKey) {
      const file = playbackPath(asset.playbackKey);
      await Promise.all([file, file.replace(/\.mp4$/, '.jpg')].map((name) => rm(name, { force: true })));
    }
  }
});

// The previous two-process recipe is intentionally retained as an independent
// comparison, including its input seek, frame grid and proxy encoding options.
async function legacyPrepare(asset, directory, config) {
  const started = performance.now(), info = await probe(asset.localPath);
  const offset = Math.max(0, Math.min(info.duration - .05, Number(asset.analysisStart) || 0));
  const required = Math.max(2, Number(config.analysisSeconds) || 8);
  const duration = Math.min(Math.min(300, Math.max(8, required * 1.8 + 2)), info.duration - offset);
  const prefix = path.join(directory, 'asset-0'), pattern = `${prefix}-%02d.jpg`, frameStep = duration / 10;
  const workStarted = performance.now();
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', String(offset), '-t', String(duration), '-i', asset.localPath, '-frames:v', '10', '-vf', `fps=${1 / frameStep}:start_time=0:round=near,scale=512:-2`, '-q:v', '5', '-start_number', '0', pattern]);
  const frames = [];
  for (let i = 0; i < 10; i++) frames.push({ timestamp: offset + i * frameStep, mime: 'image/jpeg', data: (await readFile(`${prefix}-${String(i).padStart(2, '0')}.jpg`)).toString('base64') });
  const file = `${prefix}.mp4`;
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-ss', String(offset), '-i', asset.localPath, '-t', duration.toFixed(3), '-an', '-vf', duration > 60 ? 'scale=320:-2,fps=4' : 'scale=480:-2,fps=8', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', duration > 60 ? '36' : '32', ...(duration > 60 ? ['-maxrate', '100k', '-bufsize', '200k'] : []), '-threads', '1', '-movflags', '+faststart', file]);
  return { duration, offset, frames, file, seconds: (performance.now() - started) / 1000, ffmpegAndFrameReadSeconds: (performance.now() - workStarted) / 1000 };
}

async function decodedHashes(file) {
  const output = await run('ffmpeg', ['-v', 'error', '-xerror', '-threads', '1', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-']);
  return output.split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').map((part) => part.trim()));
}

async function assertSameMedia(old, current, currentFile) {
  assert.equal(current.duration, old.duration);
  assert.equal(current.offset, old.offset);
  assert.equal(current.frames.length, 10);
  assert.deepEqual(current.frames.map((frame) => frame.timestamp), old.frames.map((frame) => frame.timestamp));
  // Byte-identical JPEGs establish equality at all samples, including every
  // nearest-grid boundary frame used by the whole-film director.
  assert.deepEqual(current.frames.map((frame) => sha(Buffer.from(frame.data, 'base64'))), old.frames.map((frame) => sha(Buffer.from(frame.data, 'base64'))));
  for (const timestamp of [old.offset, old.offset + .333, old.offset + old.duration * .63, old.offset + old.duration - .15]) {
    const nearest = (frames) => frames.reduce((best, frame) => Math.abs(frame.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? frame : best);
    assert.deepEqual(nearest(current.frames), nearest(old.frames));
  }
  const oldInfo = await probe(old.file), newInfo = await probe(currentFile);
  assert.deepEqual(newInfo, oldInfo);
  // framemd5 fully decodes both outputs and compares timestamps and pixels.
  const before = await decodedHashes(old.file), after = await decodedHashes(currentFile);
  assert.deepEqual(after, before);
  assert.equal(newInfo.width, old.duration > 60 ? 320 : 480);
  const parts = mediaParts(current);
  assert.ok(parts.some((part) => part.mime === 'video/mp4'));
  assert.equal(parts.filter((part) => part.mime === 'image/jpeg').length, 0);
  return { duration: newInfo.duration, dimensions: [newInfo.width, newInfo.height], decodedFrames: after.length, sampleCount: current.frames.length, jpegHashesEqual: true, decodedFrameHashesEqual: true, boundaryFramesEqual: true };
}

test('one decode preserves actual-video input, ten sample positions, pixels and boundary frames', { skip: !fixture, timeout: 120000 }, async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vision-media-equivalence-'));
  try {
    // Copy the fixture so concurrent playback-cache pruning cannot affect it.
    const source = path.join(folder, 'fixture.mp4'); await copyFile(fixture, source);
    const sourceInfo = await probe(source);
    assert.ok(sourceInfo.width >= 1280 && sourceInfo.height >= 720 && sourceInfo.duration >= 12, 'use an existing HD video of at least 12 seconds');
    const asset = { id: 'local:hd-comparison', kind: 'video', localPath: source, analysisStart: 0 };
    const config = { visionProvider: 'gemini', analysisSeconds: 3.4 };
    const times = [];
    for (let round = 0; round < 3; round++) {
      const oldDirectory = path.join(folder, `old-${round}`), newDirectory = path.join(folder, `new-${round}`);
      await mkdir(oldDirectory); await mkdir(newDirectory);
      const job = makeJob(); let before, after, newSeconds;
      const oldRun = async () => { before = await legacyPrepare(asset, oldDirectory, config); };
      const newRun = async () => { const start = performance.now(); after = await prepareMedia(asset.id, newDirectory, job, config, asset); newSeconds = (performance.now() - start) / 1000; };
      // Alternate order; these are fresh-output and repeat local-file timings,
      // not claims of purged OS caches or cold remote-source performance.
      if (round % 2) { await newRun(); await oldRun(); } else { await oldRun(); await newRun(); }
      const evidence = await assertSameMedia(before, after, path.join(newDirectory, 'asset-0.mp4'));
      assert.equal(after.timings.ffmpegInvocations, 1);
      assert.equal(job.events.length, 1);
      assert.equal(job.events[0].stage, 'prepare-media-phases');
      assert.equal(job.events[0].status, 'completed');
      assert.equal(after.timings.queueMs, null);
      assert.equal(after.timings.downloadMs, null);
      assert.equal(after.timings.playbackMs, null);
      assert.equal(after.timings.playbackBypassed, true);
      assert.ok(after.timings.ffmpegMs > 0);
      times.push({ round, outputCache: round ? 'repeat-local-file/fresh-output' : 'first-local-file/fresh-output', oldSeconds: before.seconds, newSeconds, phases: after.timings, ...evidence });
    }
    // A non-grid seek exercises timestamps measured in original source seconds.
    asset.analysisStart = 2.173;
    const oldDirectory = path.join(folder, 'offset-old'), newDirectory = path.join(folder, 'offset-new');
    await mkdir(oldDirectory); await mkdir(newDirectory);
    const before = await legacyPrepare(asset, oldDirectory, config);
    const after = await prepareMedia(asset.id, newDirectory, makeJob(), config, asset);
    const offsetEvidence = await assertSameMedia(before, after, path.join(newDirectory, 'asset-0.mp4'));
    // Keep the pre-existing >60s 320p/4fps branch unchanged as well.
    const longSource = path.join(folder, 'long-local-fixture.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '5', '-i', source, '-t', '70', '-an', '-c:v', 'copy', longSource]);
    const longAsset = { ...asset, analysisStart: 0, localPath: longSource };
    const longConfig = { ...config, analysisSeconds: 36 };
    const longOldDirectory = path.join(folder, 'long-old'), longNewDirectory = path.join(folder, 'long-new');
    await mkdir(longOldDirectory); await mkdir(longNewDirectory);
    const longBefore = await legacyPrepare(longAsset, longOldDirectory, longConfig);
    const longAfter = await prepareMedia(longAsset.id, longNewDirectory, makeJob(), longConfig, longAsset);
    const longEvidence = await assertSameMedia(longBefore, longAfter, path.join(longNewDirectory, 'asset-0.mp4'));
    t.diagnostic(JSON.stringify({ fixture: { width: sourceInfo.width, height: sourceInfo.height, duration: sourceInfo.duration }, times, fractionalOffset: { offset: after.offset, ...offsetEvidence }, longWindow: longEvidence }));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('audio review honors a bounded analysisDuration and original source offset', { skip: !fixture, timeout: 120000 }, async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vision-media-window-'));
  try {
    const source = path.join(folder, 'fixture-with-audio.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', fixture, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', source]);
    const job = makeJob(), config = { visionProvider: 'gemini', analysisSeconds: 1 };
    const asset = { id: 'local:review-window', kind: 'video', localPath: source, includeAudio: true, analysisStart: 3.25, analysisDuration: 1.75 };
    const result = await prepareMedia(asset.id, folder, job, config, asset);
    assert.equal(result.offset, 3.25);
    assert.equal(result.duration, 1.75);
    assert.equal(result.frames.length, 0);
    assert.equal(result.timings.ffmpegInvocations, 1);
    const info = await probe(path.join(folder, 'asset-0.mp4'));
    assert.equal(info.hasAudio, true);
    assert.ok(Math.abs(info.duration - 1.75) < .13);
    await decodedHashes(path.join(folder, 'asset-0.mp4'));
    await run('ffmpeg', ['-v', 'error', '-xerror', '-i', path.join(folder, 'asset-0.mp4'), '-map', '0:a:0', '-f', 'null', '-']);
    asset.analysisDuration = -1;
    const minimum = await prepareMedia(asset.id, folder, job, config, asset);
    assert.equal(minimum.duration, .05);
    asset.analysisDuration = 0;
    const fallback = await prepareMedia(asset.id, folder, job, config, asset);
    const sourceInfo = await probe(source);
    assert.equal(fallback.duration, Math.min(60, sourceInfo.duration - asset.analysisStart));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('preparation failures retain measured phases without inventing download or queue durations', async () => {
  const job = makeJob();
  await assert.rejects(prepareMedia('local:missing', os.tmpdir(), job, { visionProvider: 'gemini' }, { id: 'local:missing', kind: 'video', localPath: '/missing-gomotion-media-fixture.mp4' }));
  const event = job.events[0];
  assert.equal(event.status, 'failed');
  assert.equal(event.timings.queueMs, null);
  assert.equal(event.timings.downloadMs, null);
  assert.ok(event.timings.statMs >= 0 && event.durationMs > 0);
});
