import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { narrationAudio } from './narration.mjs';

const config = { visionProvider: 'gemini', visionKey: 'local-fixture-only', visionBase: 'https://narration.invalid' };
const project = { voice: 'gemini:Kore', language: 'zh-CN', voiceStyle: 'documentary' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
function audioResponse() {
  const pcm = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 440 * Math.PI * 2 / 24000) * 5000), i * 2);
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }] }), { headers: { 'Content-Type': 'application/json' } });
}

test('stopping one audition does not cancel a second user of the same recording', async () => {
  const originalFetch = globalThis.fetch, one = new AbortController(), two = new AbortController();
  const scene = { text: `本地并发取消检查 ${randomUUID()}。` };
  let finish, started, result, calls = 0;
  const requested = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, { signal }) => {
    calls++; started();
    return new Promise((resolve, reject) => {
      finish = () => resolve(audioResponse());
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  try {
    const first = narrationAudio(scene, project, config, one.signal); const cancelled = assert.rejects(first, /取消|stopped/);
    await requested;
    const second = narrationAudio(scene, project, config, two.signal); second.catch(() => {});
    await tick(); one.abort(new Error('stopped audition')); finish();
    await cancelled; result = await second;
    assert.equal(calls, 1); assert.ok(result.duration >= .9);
  } finally { one.abort(); two.abort(); globalThis.fetch = originalFetch; if (result) await rm(result.file, { force: true }); }
});

test('an immediate retry does not join a cancelled recording request', async () => {
  const originalFetch = globalThis.fetch, firstController = new AbortController();
  const scene = { text: `本地立即重试检查 ${randomUUID()}。` };
  let started, result, calls = 0;
  const requested = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, { signal }) => {
    if (++calls > 1) return audioResponse();
    started(); return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
  };
  try {
    const first = narrationAudio(scene, project, config, firstController.signal); const cancelled = assert.rejects(first, /取消|stopped/);
    await requested; firstController.abort(new Error('stopped audition'));
    result = await narrationAudio(scene, project, config, new AbortController().signal);
    await cancelled; assert.equal(calls, 2); assert.ok(result.duration >= .9);
  } finally { firstController.abort(); globalThis.fetch = originalFetch; if (result) await rm(result.file, { force: true }); }
});
