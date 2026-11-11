import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateMedia, prepareCandidateBatch } from './candidate-media.mjs';

const tick = () => new Promise(setImmediate);
test('a pair of candidates starts together and keeps catalog order after completion', async () => {
  const started = [], resolvers = new Map();
  const operation = prepareCandidateBatch(['slow', 'fast'], { signal: new AbortController().signal,
    get: (id) => { started.push(id); return new Promise((resolve) => resolvers.set(id, resolve)); }, onError: () => assert.fail('unexpected failure') });
  await tick(); assert.deepEqual(started, ['slow', 'fast']);
  resolvers.get('fast')({ id: 'fast' }); resolvers.get('slow')({ id: 'slow' });
  assert.deepEqual((await operation).map((m) => m.id), ['slow', 'fast']);
});

test('one unreadable candidate does not discard its readable peer', async () => {
  const warnings = [];
  const items = await prepareCandidateBatch(['bad', 'good'], { signal: new AbortController().signal,
    get: async (id) => { if (id === 'bad') throw new Error('unreadable'); return { id }; }, onError: (id, error) => warnings.push([id, error.message]) });
  assert.deepEqual(items, [{ id: 'good' }]); assert.deepEqual(warnings, [['bad', 'unreadable']]);
});

test('concurrent scenes share prepared media and extend only when needed', async () => {
  const media = new Map(), starts = []; let finish;
  const get = candidateMedia(media, async (id, duration) => { starts.push([id, duration]); await new Promise((resolve) => { finish = resolve; }); return { asset: { id }, duration, sourceDuration: 60 }; });
  const a = get('same', 8), b = get('same', 8);
  await tick(); assert.equal(starts.length, 1); finish();
  assert.equal(await a, await b); assert.equal(await get('same', 5), await a);
  const c = get('same', 20); await tick(); assert.equal(starts.length, 2); finish(); assert.equal((await c).duration, 20);
});

test('a short in-flight preparation settles before extending the same source', async () => {
  const starts = [], resolvers = [];
  const get = candidateMedia(new Map(), async (id, duration) => { starts.push(duration); await new Promise((resolve) => resolvers.push(resolve)); return { asset: { id }, duration, sourceDuration: 60 }; });
  const short = get('same', 8), long = get('same', 20);
  await tick(); assert.deepEqual(starts, [8]); resolvers[0](); await short; await tick();
  assert.deepEqual(starts, [8, 20]); resolvers[1](); assert.equal((await long).duration, 20);
});

test('failed preparations do not poison later retries and cancellation still propagates', async () => {
  let calls = 0;
  const get = candidateMedia(new Map(), async (id, duration) => { if (++calls === 1) throw new Error('temporary'); return { asset: { id }, duration, sourceDuration: 60 }; });
  await assert.rejects(get('same', 8), /temporary/); assert.equal((await get('same', 8)).duration, 8);
  const controller = new AbortController(); let settled = false;
  const batch = prepareCandidateBatch(['cancel', 'other'], { signal: controller.signal,
    get: async (id) => { if (id === 'cancel') { await tick(); controller.abort(new Error('stop')); throw controller.signal.reason; } await tick(); settled = true; return { id }; }, onError: () => {} });
  await assert.rejects(batch, /stop/); assert.equal(settled, true, 'all preparation work settles before task cleanup');
});
