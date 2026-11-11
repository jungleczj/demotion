import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedOperations } from './shared-operation.mjs';

test('cancelling the last subscriber before work starts prevents the action', async () => {
  const request = sharedOperations(), controller = new AbortController();
  let started = false;
  const result = request('one', controller.signal, async () => { started = true; return 'late'; });
  const rejected = assert.rejects(result, /stopped/);
  controller.abort(new Error('stopped'));
  await rejected;
  await new Promise(setImmediate);
  assert.equal(started, false);
});

test('shared failures reject every subscriber even when the action rejects without a reason', async () => {
  const request = sharedOperations();
  const results = await Promise.allSettled([
    request('one', undefined, async () => { throw undefined; }),
    request('one', undefined, async () => 'unexpected duplicate'),
  ]);
  assert.deepEqual(results, [{ status: 'rejected', reason: undefined }, { status: 'rejected', reason: undefined }]);
});

test('all subscribers must leave before shared work is aborted', async () => {
  const request = sharedOperations(), first = new AbortController(), second = new AbortController();
  let upstream;
  const action = (signal) => {
    upstream = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const one = request('one', first.signal, action), two = request('one', second.signal, action);
  const rejectedOne = assert.rejects(one, /first/), rejectedTwo = assert.rejects(two, /second/);
  await new Promise(setImmediate);
  first.abort(new Error('first'));
  await rejectedOne;
  assert.equal(upstream.aborted, false);
  second.abort(new Error('second'));
  await rejectedTwo;
  assert.equal(upstream.aborted, true);
});

test('settling abandoned work cannot evict its replacement or affect another key', async () => {
  const request = sharedOperations(), controller = new AbortController();
  let abandon, finish, replacements = 0;
  const old = request('one', controller.signal, () => new Promise((resolve) => { abandon = resolve; }));
  const rejected = assert.rejects(old, /stopped/);
  await new Promise(setImmediate);
  controller.abort(new Error('stopped')); await rejected;
  const replacement = request('one', undefined, () => { replacements++; return new Promise((resolve) => { finish = resolve; }); });
  await new Promise(setImmediate);
  abandon('obsolete'); await new Promise(setImmediate);
  const joined = request('one', undefined, () => { replacements++; return 'wrong'; });
  assert.equal(await request('two', undefined, async () => 'independent'), 'independent');
  finish('current');
  assert.deepEqual(await Promise.all([replacement, joined]), ['current', 'current']);
  assert.equal(replacements, 1);
  assert.equal(await request('one', undefined, async () => 'fresh'), 'fresh');
});
