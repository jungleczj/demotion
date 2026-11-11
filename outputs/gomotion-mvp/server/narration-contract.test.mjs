import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { narrationAudio, normalizeNarration, TTS_MODEL } from './narration.mjs';
import { fixturePCM, fixtureWAV, fixtureAudioResponse } from './narration-fixture-utils.mjs';
import voices from '../shared/voices.json' with { type: 'json' };
import languages from '../shared/languages.json' with { type: 'json' };
import { createPlan } from '../scripts/verify-voices.mjs';

const config = { visionProvider: 'gemini', visionKey: 'offline-fixture-only', visionBase: 'https://narration.invalid' };
const marker = randomUUID(), contractFiles = new Set(), contractKeys = new Set();
after(async () => { await Promise.all([...contractFiles].map((file) => rm(file, { force: true }))); });

// Each real normalize/probe/cache cycle has its own cancellable context. A slow
// host must not exhaust one shared deadline and leave a 44-item loop running
// against the next test's fetch fixture.
for (const task of createPlan(voices, languages)) test(`offline TTS contract: ${task.voiceKey} / ${task.language}`, { timeout: 30000 }, async (t) => {
  const expected = { voiceKey: task.voiceKey, speech: languages.find((language) => language.code === task.language).speech, text: `${task.request.text}\n[offline fixture ${marker}]` };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'), 'no real provider or loopback request is allowed');
    calls++;
    const payload = JSON.parse(options.body), prompt = payload.contents[0].parts[0].text;
    assert.equal(payload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, expected.voiceKey);
    assert.ok(prompt.includes(`Speak fluent native ${expected.speech}.`));
    assert.ok(prompt.endsWith(`NARRATION:\n${expected.text}`));
    return fixtureAudioResponse();
  });
  const result = await narrationAudio({ text: expected.text }, { ...task.request }, config, t.signal);
  contractFiles.add(result.file);
  assert.equal(contractKeys.has(result.key), false, 'a different voice/language choice must not reuse an earlier recording');
  contractKeys.add(result.key);
  assert.equal(result.model, TTS_MODEL); assert.ok(result.duration >= .9);
  const cached = await narrationAudio({ text: expected.text }, { ...task.request }, config, t.signal);
  assert.equal(cached.key, result.key); assert.equal(cached.duration, result.duration);
  assert.equal(calls, 1, 'the exact same choice must reuse the checked recording');
});

test('delivery styles have separate cached recordings while returning to a style reuses its recording', async (t) => {
  const files = new Set(), keys = new Set(), prompts = new Set();
  const scene = { text: `离线讲述方式检查 ${randomUUID()}。` }, project = { voice: 'gemini:Kore', language: 'zh-CN' };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls++; prompts.add(JSON.parse(options.body).contents[0].parts[0].text); return fixtureAudioResponse(); });
  try {
    for (const voiceStyle of ['documentary', 'story', 'conversation', 'explainer', 'gentle', 'documentary']) {
      t.signal.throwIfAborted();
      const result = await narrationAudio(scene, { ...project, voiceStyle }, config, t.signal);
      files.add(result.file); keys.add(result.key);
    }
    assert.equal(calls, 5); assert.equal(prompts.size, 5); assert.equal(keys.size, 5);
  } finally { await Promise.all([...files].map((file) => rm(file, { force: true }))); }
});

test('normalization preserves a natural subsecond pause while shortening detected long silence (offline signal timing)', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-pauses-fixture-'));
  try {
    const normal = path.join(directory, 'normal.wav'), long = path.join(directory, 'long.wav');
    await writeFile(normal, fixtureWAV(fixturePCM([{ tone: .9 }, { silence: .8 }, { tone: .9 }])));
    await writeFile(long, fixtureWAV(fixturePCM([{ tone: .9 }, { silence: 3.2 }, { tone: .9 }])));
    const normalResult = await normalizeNarration(normal, path.join(directory, 'normal-out.wav'), t.signal);
    const longResult = await normalizeNarration(long, path.join(directory, 'long-out.wav'), t.signal);
    assert.ok(normalResult.duration >= 2.5 && normalResult.duration <= 2.7, 'a natural 0.8s pause must survive');
    assert.ok(longResult.duration > normalResult.duration && longResult.duration < 4.5, 'the 3.2s silence should shorten while retaining more pause than the 0.8s fixture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
