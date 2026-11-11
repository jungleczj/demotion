import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as narration from './narration.mjs';

const config = { visionProvider: 'gemini', visionKey: 'offline-fixture-only', visionBase: 'https://narration.invalid' };
const project = { voice: 'gemini:Kore', language: 'zh-CN', voiceStyle: 'documentary' };

// A deterministic signal for testing file handling. This is not speech and is
// never evidence of Gemini output, voice identity, language or naturalness.
function pcm(seconds = 1) {
  const buffer = Buffer.alloc(Math.round(seconds * 24000) * 2);
  for (let i = 0; i < buffer.length / 2; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 220 * Math.PI * 2 / 24000) * 5000), i * 2);
  return buffer;
}
function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}
const audioResponse = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm().toString('base64') } }] } }] }), { headers: { 'Content-Type': 'application/json' } });

test('an undersized cached recording is regenerated instead of returned as valid narration', async () => {
  const originalFetch = globalThis.fetch;
  const scene = { text: `离线缓存最短时长检查 ${randomUUID()}。` };
  let result, calls = 0;
  globalThis.fetch = async () => { calls++; return audioResponse(); };
  try {
    result = await narration.narrationAudio(scene, project, config);
    await writeFile(result.file, wav(pcm(.1)));
    result = await narration.narrationAudio(scene, project, config);
    assert.ok(result.duration >= .9, 'the 0.1-second invalid cache must not be accepted');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; if (result) await rm(result.file, { force: true }); }
});

test('a corrupt legacy cache cannot permanently prevent generating a replacement', async () => {
  const originalFetch = globalThis.fetch;
  const scene = { text: `离线旧缓存损坏检查 ${randomUUID()}。` };
  let result, legacy, calls = 0, prompt;
  globalThis.fetch = async (_url, options) => {
    calls++; prompt = JSON.parse(options.body).contents[0].parts[0].text;
    return audioResponse();
  };
  try {
    result = await narration.narrationAudio(scene, project, config);
    const style = prompt.slice(0, prompt.indexOf('\n\nNARRATION:\n'));
    const key = createHash('sha256').update(JSON.stringify({ text: scene.text, voice: 'Kore', style, model: narration.TTS_MODEL })).digest('hex');
    legacy = narration.narrationPath(key);
    await rm(result.file); await writeFile(legacy, Buffer.alloc(100, 1));
    await assert.doesNotReject(async () => { result = await narration.narrationAudio(scene, project, config); });
    assert.ok(result.duration >= .9); assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (result) await rm(result.file, { force: true });
    if (legacy) await rm(legacy, { force: true });
  }
});

test('cache eviction only removes published recordings and leaves concurrent temporary WAV files intact', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-prune-fixture-'));
  const current = path.join(directory, `${'a'.repeat(64)}.wav`);
  const old = path.join(directory, `${'b'.repeat(64)}.wav`);
  const temporary = path.join(directory, `${'c'.repeat(64)}.${randomUUID()}.raw.wav`);
  const oldDate = new Date(Date.now() - 25 * 3600_000);
  try {
    for (const file of [current, old, temporary]) { await writeFile(file, 'offline fixture'); await utimes(file, oldDate, oldDate); }
    await narration.pruneNarrationCache(directory, current);
    await assert.rejects(stat(old), { code: 'ENOENT' });
    assert.equal(await readFile(current, 'utf8'), 'offline fixture');
    assert.equal(await readFile(temporary, 'utf8'), 'offline fixture');
    // Concurrent cleanup/removal can make a directory disappear; a completed
    // recording must not become a failed TTS response because eviction raced.
    await rm(directory, { recursive: true, force: true });
    await assert.doesNotReject(narration.pruneNarrationCache(directory, current));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
