import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensurePlayback, verifiedAsset, playbackKey, playbackPath } from './playback.mjs';
import { run } from './process.mjs';

let folder, fixture;
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
const asset = () => ({ id: `fixture:${randomUUID()}`, provider: 'fixture', kind: 'video', width: 1280, height: 720,
  duration: 2.4, url: 'https://playback.invalid/local-fixture.mp4', analysisUrl: 'https://playback.invalid/unused-preview.mp4' });
const clean = async (item) => {
  const file = playbackPath(playbackKey(item, 30));
  await Promise.all([file, file.replace(/\.mp4$/, '.jpg')].map((name) => rm(name, { force: true })));
};
before(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'playback-cancel-'));
  const file = path.join(folder, 'fixture.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30:d=2.4', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', file]);
  fixture = await readFile(file);
});
after(async () => { await rm(folder, { recursive: true, force: true }); });

test('cancelling one playback subscriber leaves the other caller and its download usable', async () => {
  const originalFetch = globalThis.fetch, firstController = new AbortController(), secondController = new AbortController();
  const item = asset(); let finish, started, upstreamSignal, first, second, outcome, calls = 0;
  const requested = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (url, { signal }) => {
    assert.equal(url, item.url); calls++; upstreamSignal = signal; started();
    return new Promise((resolve, reject) => {
      finish = () => resolve(new Response(fixture));
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  try {
    first = ensurePlayback(item, { outputFormat: 'landscape' }, false, firstController.signal);
    first.then((value) => { outcome = { value }; }, (error) => { outcome = { error }; });
    await requested;
    second = ensurePlayback(item, { outputFormat: 'landscape' }, false, secondController.signal); second.catch(() => {});
    await pause(); firstController.abort(new Error('first playback stopped')); await pause();
    assert.match(outcome?.error?.message || '', /first playback stopped/);
    assert.equal(upstreamSignal.aborted, false);
    finish(); const ready = await second;
    assert.equal(calls, 1);
    assert.deepEqual([ready.width, ready.height], [1280, 720]);
  } finally {
    finish?.(); await Promise.allSettled([first, second]);
    firstController.abort(); secondController.abort(); globalThis.fetch = originalFetch; await clean(item);
  }
});

test('the last subscriber stops the upstream download and an immediate retry starts new work', async () => {
  const originalFetch = globalThis.fetch, controller = new AbortController();
  const item = asset(); let finish, started, upstreamSignal, first, retry, outcome, calls = 0;
  const requested = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, { signal }) => {
    if (++calls > 1) return new Response(fixture);
    upstreamSignal = signal; started();
    return new Promise((resolve, reject) => {
      finish = () => resolve(new Response(fixture));
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  try {
    first = verifiedAsset(item, { outputFormat: 'landscape' }, controller.signal);
    first.then((value) => { outcome = { value }; }, (error) => { outcome = { error }; });
    await requested; controller.abort(new Error('all playback stopped')); await pause();
    assert.match(outcome?.error?.message || '', /all playback stopped/);
    assert.equal(upstreamSignal.aborted, true);
    retry = verifiedAsset(item, { outputFormat: 'landscape' }, new AbortController().signal);
    const ready = await retry;
    assert.equal(calls, 2);
    assert.equal(ready.downloadChecked, true);
  } finally {
    finish?.(); await Promise.allSettled([first, retry]);
    controller.abort(); globalThis.fetch = originalFetch; await clean(item);
  }
});

test('a pre-cancelled playback request performs no download', async () => {
  const originalFetch = globalThis.fetch, controller = new AbortController();
  const item = asset(); let calls = 0;
  controller.abort(new Error('already stopped'));
  globalThis.fetch = async () => { calls++; return new Response(fixture); };
  try {
    await assert.rejects(ensurePlayback(item, { outputFormat: 'landscape' }, false, controller.signal), /already stopped/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; await clean(item); }
});
