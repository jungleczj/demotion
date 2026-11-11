import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { trackSelection } from './sources.mjs';

test('a cancelled source selection does not start a tracking request', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{}'); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(trackSelection({ id: randomUUID(), provider: 'coverr', sourceId: 'offline' }, randomUUID(), { coverrKey: 'offline' }, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('stopping render preparation interrupts its pending source tracking request', async (t) => {
  const controller = new AbortController();
  let started, release;
  const begun = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((resolve, reject) => {
    release = () => reject(new DOMException('fixture cleanup', 'AbortError'));
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    started();
  }));
  const pending = trackSelection({ id: randomUUID(), provider: 'coverr', sourceId: 'offline' }, randomUUID(), { coverrKey: 'offline' }, controller.signal);
  let settled = false; const completion = pending.catch(() => { settled = true; });
  try {
    await begun; controller.abort(); await new Promise(setImmediate);
    assert.equal(settled, true, 'source tracking must observe the render cancellation signal');
  } finally { release(); await completion; }
});
