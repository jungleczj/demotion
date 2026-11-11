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

test('last playback subscriber also cancels an in-flight source metadata request', async () => {
  const originalFetch = globalThis.fetch, controller = new AbortController();
  const item = { ...asset(), provider: 'commons', sourceId: 'metadata-fixture' };
  let started, upstreamSignal, finish;
  const ready = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, { signal }) => {
    upstreamSignal = signal; started();
    return new Promise((resolve, reject) => {
      finish = () => resolve(Response.json({ query: { pages: {} } }));
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  let pending;
  try {
    pending = ensurePlayback(item, { outputFormat: 'landscape' }, false, controller.signal);
    pending.catch(() => {});
    await ready;
    controller.abort(new Error('stop metadata'));
    await assert.rejects(pending, /stop metadata/);
    assert.equal(upstreamSignal.aborted, true);
  } finally { finish?.(); controller.abort(); globalThis.fetch = originalFetch; await Promise.allSettled([pending]); await clean(item); }
});

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
  const item = asset(); let finish, started, upstreamSignal, first, retry, calls = 0;
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
    first.catch(() => {});
    await requested; controller.abort(new Error('all playback stopped'));
    assert.equal(upstreamSignal.aborted, true);
    // Retry in the same turn, while the abandoned operation is still settling.
    retry = verifiedAsset(item, { outputFormat: 'landscape' }, new AbortController().signal);
    await assert.rejects(first, /all playback stopped/);
    const ready = await retry;
    assert.equal(calls, 2);
    assert.equal(ready.downloadChecked, true);
  } finally {
    finish?.(); await Promise.allSettled([first, retry]);
    controller.abort(); globalThis.fetch = originalFetch; await clean(item);
  }
});

test('cancelling a queued playback removes its waiter and preserves the next download slot', async () => {
  const originalFetch = globalThis.fetch;
  const items = Array.from({ length: 6 }, asset), controllers = items.map(() => new AbortController());
  const requests = [], calls = [];
  let fourStarted;
  const requested = new Promise((resolve) => { fourStarted = resolve; });
  globalThis.fetch = async (url, { signal }) => {
    calls.push(url);
    if (calls.length === 4) fourStarted();
    if (url === items[5].url) return new Response(fixture);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      if (signal.aborted) reject(signal.reason);
    });
  };
  // Separate URLs make it possible to detect a cancelled waiter starting later.
  items.forEach((item, index) => { item.url = `https://playback.invalid/queued-${index}.mp4`; });
  const request = (index) => {
    const result = ensurePlayback(items[index], { outputFormat: 'landscape' }, false, controllers[index].signal);
    result.catch(() => {}); requests.push(result); return result;
  };
  try {
    for (let index = 0; index < 4; index++) request(index);
    await requested;
    const queued = request(4);
    await pause(); controllers[4].abort(new Error('queued playback stopped'));
    await assert.rejects(queued, /queued playback stopped/);
    assert.equal(calls.length, 4, 'the cancelled waiter must never download');
    controllers[0].abort(new Error('release one playback slot'));
    await assert.rejects(requests[0], /release one playback slot/);
    const ready = await request(5);
    assert.deepEqual([ready.width, ready.height], [1280, 720]);
    assert.equal(calls.length, 5);
    assert.equal(calls.includes(items[4].url), false);
    assert.equal(calls.includes(items[5].url), true);
  } finally {
    controllers.forEach((controller) => controller.abort());
    await Promise.allSettled(requests);
    globalThis.fetch = originalFetch;
    await Promise.all(items.map(clean));
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
