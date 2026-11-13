import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requestNarration } from './narration-request.mjs';
import { createVercelHandler } from './vercel-api.mjs';
import { visionJSON } from './vision-client.mjs';
import { createSandboxExecutor } from './cloud/executor.mjs';
import { prepareNarrationTimeline } from './narration-timeline.mjs';
import { reviewExport } from './visual-review.mjs';
import { fixtureAudioResponse } from './narration-fixture-utils.mjs';
import { aiConfigFromEnv, audioReviewConfig, narrationConfig, redactAISecrets } from './ai-services.mjs';
import { run } from './process.mjs';

const config = { visionEnabled: true, visionProvider: 'openai', visionBase: 'https://api.deepseek.com', visionKey: 'offline-primary-key', visionModel: 'deepseek-flash', narrationKey: 'offline-tts-key', narrationBase: 'https://tts.invalid', reviewProvider: 'gemini', reviewKey: 'offline-review-key', reviewBase: 'https://review.invalid', reviewModel: 'offline-audio-review' };
const env = { VISION_PROVIDER: 'openai', VISION_BASE_URL: config.visionBase, VISION_API_KEY: config.visionKey, VISION_MODEL: config.visionModel, NARRATION_API_KEY: config.narrationKey, NARRATION_BASE_URL: config.narrationBase, REVIEW_PROVIDER: config.reviewProvider, REVIEW_API_KEY: config.reviewKey, REVIEW_BASE_URL: config.reviewBase, REVIEW_MODEL: config.reviewModel };
const job = () => ({ controller: new AbortController(), events: [] });
const post = (route, body) => new Request(`https://studio.invalid/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('environment role resolution preserves legacy Gemini and does not reuse a primary image key for audio', () => {
  const legacy = aiConfigFromEnv({ VISION_API_KEY: 'offline-legacy', VISION_BASE_URL: 'https://legacy.invalid', VISION_MODEL: 'legacy-model' });
  assert.equal(narrationConfig(legacy).visionKey, 'offline-legacy');
  assert.equal(audioReviewConfig(legacy).visionModel, 'legacy-model');
  const isolated = aiConfigFromEnv({ VISION_PROVIDER: 'openai', VISION_API_KEY: config.visionKey });
  assert.equal(narrationConfig(isolated).visionKey, ''); assert.equal(audioReviewConfig(isolated).visionKey, '');
  const separated = aiConfigFromEnv({ VISION_PROVIDER: 'openai', VISION_API_KEY: config.visionKey, GEMINI_API_KEY: config.narrationKey });
  assert.equal(separated.visionBase, 'https://api.deepseek.com'); assert.equal(separated.visionModel, 'deepseek-flash');
  assert.equal(narrationConfig(separated).visionKey, config.narrationKey);
  assert.equal(audioReviewConfig(separated).visionKey, config.narrationKey);
});

test('all model role credentials are redacted together', () => {
  assert.equal(redactAISecrets([config.visionKey, config.narrationKey, config.reviewKey].join(' '), config), '[redacted] [redacted] [redacted]');
});

test('narration sends only the independent audio key to the audio endpoint', async () => {
  await requestNarration(config, 'offline-tts', {}, undefined, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://tts.invalid/models/offline-tts:generateContent');
    assert.equal(options.headers['x-goog-api-key'], config.narrationKey);
    return Response.json({ candidates: [] });
  } });
});

test('DeepSeek alone cannot be accidentally used as a TTS credential', async () => {
  let calls = 0;
  await assert.rejects(requestNarration({ visionProvider: 'openai', visionKey: config.visionKey, visionBase: config.visionBase }, 'offline', {}, undefined, { fetchImpl: async () => { calls++; return Response.json({}); } }), /声音服务|配音.*连接/);
  assert.equal(calls, 0);
});

test('native cloud writing uses the configured DeepSeek model and leaves audio previews on their own service', async () => {
  const calls = [];
  const handler = createVercelHandler({ env, cloudAPI: null, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body, headers: options.headers });
    return url.endsWith('/chat/completions') ? Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: '海岸', script: '海浪不断涌向海岸。' }) } }] }) : fixtureAudioResponse();
  } });
  const written = await handler(post('write', { topic: '海岸', language: 'zh-CN' }));
  assert.equal(written.status, 200); assert.equal((await written.json()).script, '海浪不断涌向海岸。');
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].body.model, 'deepseek-flash');
  assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
  assert.equal(calls[0].headers.Authorization, `Bearer ${config.visionKey}`);
  const preview = await handler(post('narration', { voice: 'gemini:Kore', language: 'zh-CN', text: '海浪不断涌向海岸。' }));
  assert.equal(preview.status, 200);
  assert.ok(calls[1].url.startsWith('https://tts.invalid/models/'));
  assert.equal(calls[1].headers['x-goog-api-key'], config.narrationKey);
  const publicConfig = await (await handler(new Request('https://studio.invalid/api/config'))).json();
  assert.equal(publicConfig.visionProvider, 'openai'); assert.equal(publicConfig.visionModel, 'deepseek-flash');
  assert.doesNotMatch(JSON.stringify(publicConfig), /offline-.*key/);
});

test('image selection sends DeepSeek image blocks with thinking disabled and never an audio payload', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body); assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.messages[1].content[1].type, 'image_url');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"observed":true}' } }] });
  };
  assert.deepEqual(await visionJSON(config, 'Return JSON from supplied images.', [{ text: 'Describe this frame.' }, { mime: 'image/jpeg', data: 'offline-frame' }], job(), 'source-image-observation'), { observed: true });
});

test('cloud workers receive every independent role at runtime while the task envelope stays credential-free', async () => {
  let command, envelope;
  const sdk = { async getOrCreate() { return { async writeFiles(files) { envelope = files[0].content.toString(); }, async runCommand(value) { command = value; return { cmdId: 'offline-command' }; } }; } };
  await createSandboxExecutor({ sdk, env: { ...env, GOMOTION_SANDBOX_SNAPSHOT: 'offline-snapshot' } }).start({ task: { id: randomUUID(), attempt: 1, input: {} }, callbackURL: 'https://studio.invalid', workerToken: 'offline-scoped-token' });
  for (const [name, value] of Object.entries(env)) assert.equal(command.env[name], value, name);
  for (const value of [config.visionKey, config.narrationKey, config.reviewKey]) assert.ok(!envelope.includes(value));
});

test('audio timing keeps the selected recording and routes actual audio to the retained review service', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'audio-role-'));
  const text = `离线独立音频服务检查 ${randomUUID()}。`;
  const project = { voice: 'gemini:Kore', language: 'zh-CN', script: text, scenes: [{ id: 'one', text }] };
  const original = globalThis.fetch; let result, timingCalls = 0;
  t.after(async () => { globalThis.fetch = original; if (result) await rm(result.file, { force: true }); await rm(directory, { recursive: true, force: true }); });
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.generationConfig?.responseModalities?.includes('AUDIO')) {
      assert.ok(url.startsWith('https://tts.invalid/')); assert.equal(options.headers['x-goog-api-key'], config.narrationKey);
      return fixtureAudioResponse([{ tone: 2 }]);
    }
    timingCalls++; assert.ok(url.startsWith('https://review.invalid/')); assert.equal(options.headers['x-goog-api-key'], config.reviewKey);
    assert.ok(body.contents[0].parts.some((p) => p.inlineData?.mimeType === 'audio/mpeg'));
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"complete":true,"speakerConsistent":true,"segments":[{"index":0,"start":0,"end":1.95}]}' }] } }] });
  };
  result = await prepareNarrationTimeline(project, config, job(), directory);
  assert.equal(timingCalls, 1); assert.equal(result.track.scenes.length, 1);
});

test('final film review chooses the retained audiovisual role before validating the real export', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'review-role-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'sources.json'), '{"scenes":[]}');
  const reviewJob = { ...job(), id: randomUUID() };
  await reviewExport(reviewJob, '.', directory, config);
  assert.equal(reviewJob.status, 'error'); assert.match(reviewJob.error, /完整性检查/);
  assert.doesNotMatch(reviewJob.error, /请使用.*Gemini/);
});

test('final audiovisual review actually sends an audio-bearing MP4 to its independent Gemini service', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'review-role-media-'));
  const exportId = randomUUID(), folder = path.join(directory, exportId); await mkdir(folder);
  const original = globalThis.fetch; t.after(async () => { globalThis.fetch = original; await rm(directory, { recursive: true, force: true }); });
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-c:a', 'aac', '-shortest', path.join(folder, 'video.mp4')]);
  await writeFile(path.join(folder, 'sources.json'), JSON.stringify({ duration: 2, scenes: [{ text: 'Offline audio-bearing fixture.', start: 0, end: 2, voice: 'gemini:Kore', source: { kind: 'video' } }] }));
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, 'https://review.invalid/models/offline-audio-review:generateContent');
    assert.equal(options.headers['x-goog-api-key'], config.reviewKey);
    const body = JSON.parse(options.body), parts = body.contents[0].parts;
    assert.ok(parts.some((p) => p.inlineData?.mimeType === 'video/mp4'));
    assert.equal(JSON.parse(parts[0].text).audioIncluded, true);
    assert.ok(!parts.some((p) => p.inlineData?.mimeType?.startsWith('image/')), 'final review receives the actual video, not substitute still frames');
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ summary: 'Offline routing fixture only.', audioReviewed: true, narrationComplete: true, naturalnessPass: true, watermarkFree: true, issues: [], limitations: [] }) }] } }] });
  };
  const reviewJob = { ...job(), id: randomUUID(), bytes: 0 };
  await reviewExport(reviewJob, exportId, directory, config);
  assert.equal(calls, 1); assert.equal(reviewJob.status, 'done');
  assert.equal(reviewJob.review.provider, 'gemini'); assert.equal(reviewJob.review.model, config.reviewModel);
});
