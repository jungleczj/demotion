import test from 'node:test';
import assert from 'node:assert/strict';
import { visionJSON } from './vision-client.mjs';
import { reviewWithRetry } from './review-ranges.mjs';

const config = { visionEnabled: true, visionProvider: 'gemini', visionBase: 'https://review.invalid', visionKey: 'offline-only-key', visionModel: 'offline-review' };
const job = () => ({ controller: new AbortController(), events: [] });
const audio = [{ mime: 'audio/mpeg', data: 'offline-audio' }];
const success = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"complete":true}' }] } }] });

test('audio alignment survives a temporary 503 without changing the supplied recording', async () => {
  const state = job(), bodies = [], signals = [];
  const result = await visionJSON(config, 'Align the recording.', audio, state, 'narration-alignment', {
    fetchImpl: async (_url, options) => {
      bodies.push(options.body); signals.push(options.signal);
      return bodies.length === 1 ? Response.json({ error: { message: 'temporarily busy' } }, { status: 503 }) : success();
    },
    sleepImpl: async () => {},
  });
  assert.deepEqual(result, { complete: true });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1], 'retry uses the exact same recording and instructions');
  assert.equal(signals[0], signals[1], 'retry does not renew the total deadline');
  assert.equal(state.events[0].transientRetries, 1);
  assert.equal(state.calls, 2, 'every dispatched request counts toward the film limit');
});

test('transient review failures stop after three requests and retain their status', async () => {
  const state = job(); let calls = 0;
  await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'busy' } }, { status: 503 }); },
    sleepImpl: async () => {},
  }), { status: 503 });
  assert.equal(calls, 3);
  assert.equal(state.calls, 3);
});

test('retry backoff respects cancellation and cannot dispatch another request', async () => {
  const state = job(); let calls = 0;
  await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'busy' } }, { status: 503 }); },
    sleepImpl: async () => { state.controller.abort(Error('explicit stop')); },
  }));
  assert.equal(calls, 1);
  assert.equal(state.events[0].detail, '已取消');
});

test('expired processing budget is reported as a request deadline, not a proxy failure', async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', () => timeout(15));
  const state = job(); let calls = 0;
  await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
    fetchImpl: async (_url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) => {
        const keepAlive = setTimeout(resolve, 100);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
      });
    },
    sleepImpl: async () => {},
  }), /请求处理超时/);
  assert.equal(calls, 1, 'expired total deadline must never be renewed');
  assert.doesNotMatch(state.events[0].detail, /代理/);
});

for (const status of [401, 402, 403, 400]) test(`HTTP ${status} is not retried`, async () => {
  const state = job(); let calls = 0;
  await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'unavailable' } }, { status }); },
    sleepImpl: async () => {},
  }), { status });
  assert.equal(calls, 1);
});

test('explicit billing and daily quota evidence on 429 are not retried', async () => {
  for (const message of ['Daily quota exceeded', 'insufficient credits']) {
    const state = job(); let calls = 0;
    await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
      fetchImpl: async () => { calls++; return Response.json({ error: { message } }, { status: 429 }); },
      sleepImpl: async () => {},
    }), { status: 429 });
    assert.equal(calls, 1);
  }
});

test('minute throttling with generic billing advice honors Google RetryInfo and succeeds', async () => {
  const state = job(), waits = [];
  const limited = { error: { message: 'You exceeded your current quota, please check your plan and billing details. Generate content requests per minute limit exceeded on Free Tier.', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20.45423988s' }] } };
  const result = await visionJSON(config, 'Rank candidates.', [], state, 'catalog-shortlist', {
    fetchImpl: async () => state.calls === 1 ? Response.json(limited, { status: 429 }) : success(),
    sleepImpl: async (ms) => { waits.push(ms); },
  });
  assert.deepEqual(result, { complete: true });
  assert.equal(state.calls, 2);
  assert.ok(waits[0] >= 20454, 'never truncate a provider cooldown to ten seconds');
  assert.equal(state.events[0].quotaKind, 'minute');
  assert.equal(state.events[0].transientRetries, 1);
});

test('structured daily quota is permanent even when its generic message suggests retrying', async () => {
  const state = job(); let calls = 0;
  await assert.rejects(visionJSON(config, 'Rank candidates.', [], state, 'catalog-shortlist', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'Please check your plan and billing details.', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }] } }, { status: 429 }); },
    sleepImpl: async () => assert.fail('daily quota must not wait and retry'),
  }), { status: 429 });
  assert.equal(calls, 1);
  assert.equal(state.events[0].quotaKind, 'daily');
});

test('a minute cooldown longer than the normal stage deadline can still recover', async () => {
  const state = job(), waits = [];
  const result = await visionJSON(config, 'Align split recording.', audio, state, 'narration-split-alignment', {
    fetchImpl: async () => state.calls === 1
      ? Response.json({ error: { message: 'Generate content requests per minute limit exceeded. Please retry in 58.238989837s.' } }, { status: 429 })
      : success(),
    sleepImpl: async (ms) => { waits.push(ms); },
  });
  assert.deepEqual(result, { complete: true });
  assert.deepEqual(waits, [58239]);
  assert.equal(state.calls, 2);
});

test('transport interruption can retry, while a disabled retry policy remains single-shot', async () => {
  for (const disabled of [false, true]) {
    const state = { ...job(), disableTransientRetries: disabled }; let calls = 0;
    const request = visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
      fetchImpl: async () => { if (++calls === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); return success(); },
      sleepImpl: async () => {},
    });
    if (disabled) await assert.rejects(request); else assert.deepEqual(await request, { complete: true });
    assert.equal(calls, disabled ? 1 : 2);
  }
});

test('whole-film review does not renew an exhausted inner request budget', async () => {
  const state = job(); let calls = 0;
  await assert.rejects(reviewWithRetry(() => visionJSON(config, 'Review film.', [{ mime: 'video/mp4', data: 'offline-film' }], state, 'rendered-audiovisual-review-0', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'busy' } }, { status: 503 }); },
    sleepImpl: async () => {},
  }), state.controller.signal), { status: 503 });
  assert.equal(calls, 3, 'outer review cannot multiply the three-request limit');
});

test('automatic retries stop at the remaining film call limit', async () => {
  const state = { ...job(), callLimit: 1 }; let calls = 0;
  await assert.rejects(visionJSON(config, 'Align.', audio, state, 'narration-alignment', {
    fetchImpl: async () => { calls++; return Response.json({ error: { message: 'busy' } }, { status: 503 }); },
    sleepImpl: async () => {},
  }), /达到上限/);
  assert.equal(calls, 1);
});
