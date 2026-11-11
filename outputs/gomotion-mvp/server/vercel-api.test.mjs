import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelHandler } from './vercel-api.mjs';

const request = (path, options = {}) => new Request(`https://studio.example${path}`, options);
const post = (data, origin) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(data) });
const env = { VISION_API_KEY: 'private-test-secret', PIXABAY_API_KEY: 'private-pixabay', YOUTUBE_API_KEY: 'private-youtube' };

test('native config returns real capabilities without disclosing credentials or pretending a worker exists', async () => {
  const response = await createVercelHandler({ env })(request('/api/config'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.visionConfigured, true);
  assert.equal(data.pixabayConnected, true);
  assert.equal(data.youtubeConnected, true);
  assert.equal(data.render, false);
  assert.equal(data.runtime, 'vercel');
  assert.doesNotMatch(JSON.stringify(data), /private-/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('voices returns the full catalog even without a provider key or external downloads', async () => {
  const handler = createVercelHandler({ env: {}, fetchImpl: () => { throw Error('unexpected network'); } });
  const response = await handler(request('/api/index?__gomotion_route=voices'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.voices.length, 30);
  assert.equal(new Set(data.voices).size, 30);
  assert.ok(data.voices.includes('Kore'));
});

test('rewritten nested API routes return JSON errors instead of SPA HTML; methods are respected', async () => {
  const handler = createVercelHandler({ env: {} });
  const unknown = await handler(request('/api/index?__gomotion_route=missing%2Fnested&after=3'));
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/);
  assert.equal((await handler(request('/api/voices', post({})))).status, 405);
  assert.equal((await handler(request('/api/index?__gomotion_route=config', post({})))).status, 409);
});

test('preview uses the selected voice, style and language and returns a complete self-contained WAV', async () => {
  let observed;
  const pcm = Buffer.alloc(24000 * 2);
  const handler = createVercelHandler({ env, fetchImpl: async (url, options) => {
    observed = { url, headers: options.headers, body: JSON.parse(options.body) };
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] });
  } });
  const response = await handler(request('/api/narration', post({ voice: 'gemini:Kore', language: 'fr', voiceStyle: 'gentle', text: 'Bonjour.' })));
  assert.equal(response.status, 200);
  assert.equal(observed.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.match(observed.body.contents[0].parts[0].text, /fluent native French/);
  assert.match(observed.body.contents[0].parts[0].text, /Gentle, warm/);
  assert.match(observed.body.contents[0].parts[0].text, /Bonjour\./);
  const audio = Buffer.from((await response.json()).url.split(',')[1], 'base64');
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.readUInt32LE(24), 24000);
  assert.equal(audio.readUInt32LE(40), pcm.length);
  assert.equal(audio.length, 44 + pcm.length);
});

test('preview validates inputs and provider audio; no calls for missing key, invalid voice/language or long text', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ candidates: [] }); };
  const noKey = createVercelHandler({ env: {}, fetchImpl });
  assert.equal((await noKey(request('/api/narration', post({ voice: 'gemini:Kore', language: 'zh-CN', text: '你好' })))).status, 503);
  const handler = createVercelHandler({ env, fetchImpl });
  for (const patch of [{ voice: 'unknown' }, { language: 'unknown' }, { text: 'a'.repeat(501) }]) {
    assert.equal((await handler(request('/api/narration', post({ voice: 'gemini:Kore', language: 'zh-CN', text: '你好', ...patch })))).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await handler(request('/api/narration', post({ voice: 'gemini:Kore', language: 'zh-CN', text: '你好' })))).status, 502);
});

test('cross-origin mutations, oversized bodies, and upstream errors cannot disclose credentials', async () => {
  const handler = createVercelHandler({ env, fetchImpl: async () => Response.json({ error: { message: 'denied private-test-secret' } }, { status: 403 }) });
  assert.equal((await handler(request('/api/narration', post({}, 'https://other.example')))).status, 403);
  assert.equal((await handler(request('/api/narration', post({ text: 'a'.repeat(7000) })))).status, 413);
  const response = await handler(request('/api/narration', post({ voice: 'gemini:Kore', language: 'zh-CN', text: '你好' })));
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /private-test-secret/);
});

test('production endpoints explicitly reject work without durable worker instead of making transient fake tasks', async () => {
  const handler = createVercelHandler({ env });
  for (const path of ['/api/productions', '/api/productions/recover', '/api/productions/job-1', '/api/export', '/api/exports/job-1/video.mp4']) {
    const response = await handler(request(path));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'PRODUCTION_UNAVAILABLE');
  }
});
