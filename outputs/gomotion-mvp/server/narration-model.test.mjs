import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { narrationAudio } from './narration.mjs';
import { aiConfigFromEnv } from './ai-services.mjs';
import { fixtureAudioResponse } from './narration-fixture-utils.mjs';

const project = { voice: 'gemini:Kore', voiceStyle: 'documentary', language: 'zh-CN' };
const configured = (model) => aiConfigFromEnv({ GEMINI_API_KEY: 'offline-key', NARRATION_BASE_URL: 'https://tts.invalid', TTS_MODEL: model });
async function removeRecording(result) {
  await rm(result.file, { force: true });
  await rm(result.file.replace(/\.wav$/, '.json'), { force: true });
  await rm(path.join(path.dirname(result.file), 'chunks', result.key), { recursive: true, force: true });
}

test('configured production TTS model controls the request and separates recording caches', async (t) => {
  const scene = { text: `配音模型配置检查 ${randomUUID()}。` };
  const requests = [], results = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.startsWith('https://tts.invalid/'), 'no external provider request');
    requests.push(url); return fixtureAudioResponse();
  });
  try {
    const pro = await narrationAudio(scene, project, configured('offline-paid-pro'), t.signal); results.push(pro);
    const other = await narrationAudio(scene, project, configured('offline-other-model'), t.signal); results.push(other);
    const reused = await narrationAudio(scene, project, configured('offline-paid-pro'), t.signal);
    assert.equal(pro.model, 'offline-paid-pro');
    assert.equal(other.model, 'offline-other-model');
    assert.notEqual(pro.key, other.key, 'a changed model must never reuse the previous model recording');
    assert.equal(reused.key, pro.key);
    assert.deepEqual(requests, ['https://tts.invalid/models/offline-paid-pro:generateContent', 'https://tts.invalid/models/offline-other-model:generateContent']);
  } finally { await Promise.all(results.map(removeRecording)); }
});

test('every chunk of long narration uses one configured TTS model and voice', async (t) => {
  const scene = { text: `长旁白配置 ${randomUUID()}。` + '海浪不断涌向海岸。'.repeat(70) };
  const requests = []; let result;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://tts.invalid/'), 'no external provider request');
    requests.push({ url, voice: JSON.parse(options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName });
    return fixtureAudioResponse();
  });
  try {
    result = await narrationAudio(scene, project, configured('offline-paid-pro'), t.signal);
    assert.ok(requests.length > 1, 'the long text must exercise actual chunk assembly');
    assert.equal(result.model, 'offline-paid-pro');
    assert.ok(requests.every(r => r.url === 'https://tts.invalid/models/offline-paid-pro:generateContent' && r.voice === 'Kore'));
  } finally { if (result) await removeRecording(result); }
});
