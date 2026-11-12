import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNarration } from './narration-request.mjs';

const config = { visionBase: 'https://tts.example.invalid/v1beta/', visionKey: 'test-secret-key-123' };
const payload = { contents: [{ parts: [{ text: 'Read exactly.\n\nNARRATION:\n原文不改。' }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } };
const audio = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AQID' } }] } }] };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const limited = () => json(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_requests_per_model', quotaId: 'GenerateRequestsPerMinutePerProjectPerModel', quotaValue: '10' }] }] } });

test('successful TTS keeps model, voice, narration and request credentials unchanged', async () => {
  const delays = [];
  const result = await requestNarration(config, 'gemini-2.5-flash-preview-tts', payload, undefined, {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://tts.example.invalid/v1beta/models/gemini-2.5-flash-preview-tts:generateContent');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['x-goog-api-key'], 'test-secret-key-123');
      assert.deepEqual(JSON.parse(options.body), payload);
      assert.ok(options.signal instanceof AbortSignal);
      return json(200, audio);
    },
    sleepImpl: async (ms) => delays.push(ms),
  });
  assert.deepEqual(result, audio);
  assert.deepEqual(delays, []);
});

test('a per-minute 429 retries and can recover without treating generic billing advice as a permanent quota', async () => {
  let calls = 0;
  const delays = [];
  const result = await requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => ++calls === 1 ? limited() : json(200, audio),
    sleepImpl: async (ms) => delays.push(ms),
  });
  assert.deepEqual(result, audio);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test('a daily quota violation stops immediately even when the top-level error is generic', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => {
      calls++;
      return json(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [{ violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_requests_per_model_per_day', quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }] } });
    },
    sleepImpl: async (ms) => delays.push(ms),
  }), (error) => error.status === 429 && error.quotaKind === 'daily');
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('authentication, payment, explicit billing and insufficient-quota failures do not retry', async (t) => {
  for (const [status, error] of [[401, { message: 'Invalid key' }], [403, { message: 'Access denied' }], [402, { message: 'Payment required' }], [429, { code: 'billing_disabled', message: 'Billing account disabled' }], [429, { code: 'insufficient_quota', message: 'Insufficient quota' }]]) {
    await t.test(`${status} ${error.code || error.message}`, async () => {
      let calls = 0;
      const delays = [];
      await assert.rejects(requestNarration(config, 'model', payload, undefined, {
        fetchImpl: async () => { calls++; return json(status, { error }); },
        sleepImpl: async (ms) => delays.push(ms),
      }), (error) => error.status === status);
      assert.equal(calls, 1);
      assert.deepEqual(delays, []);
    });
  }
});

test('unknown 429 stops after three total attempts and preserves HTTP 429', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => { calls++; return limited(); },
    sleepImpl: async (ms) => delays.push(ms),
  }), (error) => error.status === 429 && error.quotaKind === 'unknown' && !error.message.includes('额度不足'));
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test('Retry-After seconds and dates override exponential delay and are capped at ten seconds', async (t) => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  for (const [header, want] of [['3', 3000], ['0', 0], ['999', 10000], ['Wed, 11 Nov 2026 00:00:07 GMT', 7000], ['bad-date', 2000], ['-1', 2000]]) {
    await t.test(header, async () => {
      let calls = 0;
      const delays = [];
      await requestNarration(config, 'model', payload, undefined, {
        fetchImpl: async () => ++calls === 1 ? json(503, { error: { message: 'Temporarily overloaded' } }, { 'Retry-After': header }) : json(200, audio),
        sleepImpl: async (ms) => delays.push(ms), now: () => now,
      });
      assert.deepEqual(delays, [want]);
    });
  }
});

test('502, 503 and 504 recover but unrelated HTTP failures do not retry', async (t) => {
  for (const status of [400, 408, 500, 502, 503, 504]) {
    await t.test(String(status), async () => {
      let calls = 0;
      const delays = [];
      const operation = requestNarration(config, 'model', payload, undefined, {
        fetchImpl: async () => ++calls === 1 ? json(status, { error: { message: 'Service failure' } }) : json(200, audio),
        sleepImpl: async (ms) => delays.push(ms),
      });
      if ([502, 503, 504].includes(status)) {
        assert.deepEqual(await operation, audio);
        assert.equal(calls, 2);
        assert.deepEqual(delays, [2000]);
      } else {
        await assert.rejects(operation, (error) => error.status === status);
        assert.equal(calls, 1);
        assert.deepEqual(delays, []);
      }
    });
  }
});

test('temporary network failures are bounded and end with safe HTTP 502', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => { calls++; throw new TypeError(`fetch failed for https://private.invalid/?key=${config.visionKey}`, { cause: { code: 'ECONNRESET' } }); },
    sleepImpl: async (ms) => delays.push(ms),
  }), (error) => error.status === 502 && !error.message.includes(config.visionKey) && !error.message.includes('https://') && error.cause === undefined);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test('a temporary connection failure can recover on the next attempt', async () => {
  let calls = 0;
  const delays = [];
  const result = await requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => {
      if (++calls === 1) throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
      return json(200, audio);
    },
    sleepImpl: async (ms) => delays.push(ms),
  });
  assert.deepEqual(result, audio);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test('provider error JSON is readable while API keys, bearer tokens and URLs are redacted', async () => {
  await assert.rejects(requestNarration(config, 'model', payload, undefined, {
    fetchImpl: async () => json(403, { error: { message: `Permission denied: key=${config.visionKey}, Bearer bearer-secret-456 at https://private.invalid/secret?key=url-secret-789` } }),
    sleepImpl: async () => assert.fail('permission denial must not wait'),
  }), (error) => error.status === 403 && /Permission denied/.test(error.message) && !/test-secret|bearer-secret|url-secret|https:\/\//.test(error.message));
});

test('cancelling during backoff stops promptly even if injected sleep never settles', { timeout: 500 }, async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestNarration(config, 'model', payload, controller.signal, {
    fetchImpl: async () => { calls++; return limited(); },
    sleepImpl: async (_ms, signal) => {
      assert.ok(signal instanceof AbortSignal);
      queueMicrotask(() => controller.abort());
      return new Promise(() => {});
    },
  }), (error) => error.name === 'AbortError');
  assert.equal(calls, 1);
});

test('an already cancelled request never starts TTS', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestNarration(config, 'model', payload, controller.signal, {
    fetchImpl: async () => assert.fail('cancelled request must not reach provider'),
    sleepImpl: async () => assert.fail('cancelled request must not wait'),
  }), (error) => error.name === 'AbortError');
});

test('a stalled attempt can retry within the original narration timeout budget', { timeout: 1000 }, async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', (ms) => timeout(ms === 120000 ? 180 : 20));
  const keepAlive = setInterval(() => {}, 1000);
  let calls = 0;
  const delays = [];
  try {
    const result = await requestNarration(config, 'model', payload, undefined, {
      fetchImpl: async () => ++calls === 1 ? new Promise(() => {}) : json(200, audio),
      sleepImpl: async (ms) => delays.push(ms),
    });
    assert.deepEqual(result, audio);
    assert.equal(calls, 2, 'a stalled transport must not consume the entire budget before retrying');
    assert.deepEqual(delays, [2000]);
  } finally { clearInterval(keepAlive); }
});

test('three stalled attempts stop with a timeout without renewing the total budget', { timeout: 1000 }, async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', (ms) => timeout(ms === 120000 ? 180 : 20));
  const keepAlive = setInterval(() => {}, 1000);
  let calls = 0;
  const delays = [];
  try {
    await assert.rejects(requestNarration(config, 'model', payload, undefined, {
      fetchImpl: async () => { calls++; return new Promise(() => {}); },
      sleepImpl: async (ms) => delays.push(ms),
    }), (error) => error.code === 'TTS_TIMEOUT' && error.attempts === 3);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [2000, 4000]);
  } finally { clearInterval(keepAlive); }
});
