import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { ensurePlayback, playbackKey, playbackPath } from './playback.mjs';
import { run, probe } from './process.mjs';

for (const fixture of [
  { format: 'landscape', source: '1600x720', expected: [1280, 720] },
  { format: 'portrait', source: '720x1600', expected: [720, 1280] },
]) {
  test(`normalization crops a genuine ${fixture.format} source to the exact shared HD canvas`, async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'playback-exact-canvas-'));
    const asset = { id: `upload:${randomUUID()}`, provider: 'upload', kind: 'video', localPath: path.join(folder, 'source.mp4') };
    let ready;
    try {
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${fixture.source}:rate=30:duration=3`, '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', asset.localPath]);
      ready = await ensurePlayback(asset, { outputFormat: fixture.format });
      const actual = await probe(ready.file);
      assert.deepEqual([actual.width, actual.height], fixture.expected);
      const metadata = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,avg_frame_rate', '-of', 'json', ready.file]));
      assert.deepEqual(metadata.streams.map(({ codec_name, pix_fmt, avg_frame_rate }) => [codec_name, pix_fmt, avg_frame_rate]), [['h264', 'yuv420p', '30/1']]);
      await run('ffmpeg', ['-v', 'error', '-xerror', '-i', ready.file, '-f', 'null', '-']);
    } finally {
      await rm(folder, { recursive: true, force: true });
      if (ready) await Promise.all([ready.file, ready.file.replace(/\.mp4$/, '.jpg')].map((file) => rm(file, { force: true })));
    }
  });
}

test('playback phases distinguish actual local normalization from a later cache hit', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'playback-phase-evidence-'));
  const asset = { id: `upload:${randomUUID()}`, provider: 'upload', kind: 'video', localPath: path.join(folder, 'source.mp4') };
  let ready;
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', asset.localPath]);
    ready = await ensurePlayback(asset, { outputFormat: 'landscape' });
    assert.ok(ready.timings, 'a preparation result must retain measured phases');
    assert.equal(ready.timings.cacheHit, false);
    assert.equal(ready.timings.downloadMs, 0);
    assert.equal(ready.timings.downloadBytes, 0);
    for (const name of ['sourceProbeMs', 'cropMs', 'transcodeMs', 'outputProbeMs', 'thumbnailMs']) assert.ok(ready.timings[name] > 0, `${name} must measure work that actually ran`);
    assert.ok(ready.timings.queueMs >= 0);
    assert.ok(ready.timings.totalMs >= ready.timings.transcodeMs);
    const cached = await ensurePlayback(asset, { outputFormat: 'landscape' });
    assert.equal(cached.key, ready.key);
    assert.equal(cached.timings.cacheHit, true);
    assert.equal(cached.timings.transcodeMs, 0);
    assert.equal(cached.timings.downloadBytes, 0);
    assert.ok(cached.timings.totalMs > 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
    if (ready) await Promise.all([ready.file, ready.file.replace(/\.mp4$/, '.jpg')].map((file) => rm(file, { force: true })));
  }
});

test('a portrait picture baked inside a landscape file cannot pass as landscape footage', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'baked-orientation-'));
  const asset = { id: `upload:${randomUUID()}`, provider: 'upload', kind: 'video', width: 1280, height: 720, localPath: path.join(folder, 'pillarbox.mp4') };
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=400x720:rate=30:duration=3', '-vf', 'pad=1280:720:440:0:black', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', asset.localPath]);
    await assert.rejects(ensurePlayback(asset, { outputFormat: 'landscape' }), /横屏原片|清晰度不足/);
  } finally {
    const file = playbackPath(playbackKey(asset));
    await Promise.all([rm(folder, { recursive: true, force: true }), rm(file, { force: true }), rm(file.replace(/\.mp4$/, '.jpg'), { force: true })]);
  }
});

test('a later longer analysis request extends an earlier preview without replacing its URL', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'playback-span-'));
  const asset = { id: `upload:${randomUUID()}`, provider: 'upload', kind: 'video', width: 1280, height: 720, duration: 36, localPath: path.join(folder, 'source.mp4') };
  const files = [];
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30:d=36', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', asset.localPath]);
    const first = await ensurePlayback(asset, { outputFormat: 'landscape', playbackPreviewSeconds: 10 }); files.push(first.file);
    const longer = await ensurePlayback(asset, { outputFormat: 'landscape', playbackPreviewSeconds: 35 }); files.push(longer.file);
    assert.ok(first.duration <= 30.1);
    assert.ok(longer.duration >= 35, 'a short cached preview must not silently cap a later longer request');
    assert.notEqual(first.key, longer.key, 'existing browser URLs stay immutable');
    const reused = await ensurePlayback(asset, { outputFormat: 'landscape' });
    assert.equal(reused.key, longer.key);
    assert.ok(asset.playbackAliases.includes(first.key), 'expired old URLs can be resolved after a new preview is prepared');
  } finally {
    await rm(folder, { recursive: true, force: true });
    await Promise.all(files.flatMap((file) => [file, file.replace(/\.mp4$/, '.jpg')]).map((file) => rm(file, { force: true })));
  }
});
