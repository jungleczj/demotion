import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { visualSequence } from './visual-director.mjs';

const config = { visionEnabled: true, visionProvider: 'gemini', visionKey: 'offline-only', visionModel: 'offline-model', visionBase: 'https://narration.invalid' };
const fixture = () => {
  const text = `配音失败不能重新启动找素材 ${randomUUID()}。`;
  return { id: randomUUID(), script: text, voice: 'gemini:Kore', language: 'zh-CN', format: 'landscape',
    scenes: [{ id: 'one', text, searchMethod: 'ai-metadata', candidates: [] }] };
};
const jobFixture = () => ({ id: randomUUID(), events: [], controller: new AbortController(), mediaIndex: 0 });
const textResponse = (value) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });

test('a rejected narration request does not trigger footage-recovery rounds', async (t) => {
  const project = fixture(), job = jobFixture(), work = await mkdtemp(path.join(os.tmpdir(), 'director-narration-failure-'));
  let narrationRequests = 0, searchRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'), 'no real provider may be called');
    const payload = JSON.parse(options.body);
    if (payload.generationConfig.responseModalities?.includes('AUDIO')) {
      narrationRequests++;
      return Response.json({ error: { message: 'Narration input rejected' } }, { status: 400 });
    }
    searchRequests++;
    return textResponse({ queries: [], scenes: [] });
  });
  try {
    await visualSequence(job, project, work, config, []);
    assert.equal(job.status, 'error');
    assert.equal(narrationRequests, 1, 'changing the footage query cannot fix a rejected narration request');
    assert.equal(searchRequests, 0, 'a voice failure must not start new semantic searches');
    assert.equal(job.retry, 0);
    const failure = job.events.find((event) => event.stage === 'narration-timing' && event.status === 'failed');
    assert.equal(failure?.errorCode, 'TTS_PROVIDER_ERROR');
    assert.equal(failure?.httpStatus, 400);
    assert.ok(Number.isFinite(failure?.durationMs));
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('an exhausted narration timeout budget is not restarted by footage recovery', { timeout: 3000 }, async (t) => {
  const project = fixture(), job = jobFixture(), work = await mkdtemp(path.join(os.tmpdir(), 'director-narration-timeout-'));
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  // Shorten only the clock for this offline replay. The complete real request,
  // narration timeline and director orchestration still execute.
  t.mock.method(AbortSignal, 'timeout', (ms) => timeout(Math.min(ms, 20)));
  let narrationRequests = 0, searchRequests = 0;
  const keepAlive = setInterval(() => {}, 1000);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'), 'no real provider may be called');
    if (JSON.parse(options.body).generationConfig.responseModalities?.includes('AUDIO')) {
      narrationRequests++;
      return new Promise(() => {});
    }
    searchRequests++;
    return textResponse({ queries: [], scenes: [] });
  });
  try {
    await visualSequence(job, project, work, config, []);
    assert.equal(job.status, 'error');
    assert.equal(narrationRequests, 1, 'the exhausted voice budget must remain bounded across outer recovery rounds');
    assert.equal(searchRequests, 0);
    assert.equal(job.retry, 0);
    assert.match(job.error, /配音请求超时/);
    assert.equal(job.events.find((event) => event.stage === 'narration-timing' && event.status === 'failed')?.errorCode, 'TTS_TIMEOUT');
  } finally { clearInterval(keepAlive); await rm(work, { recursive: true, force: true }); }
});
