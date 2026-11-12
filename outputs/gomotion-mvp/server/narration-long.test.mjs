import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { rm, writeFile, readFile, readdir, mkdtemp, mkdir, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const isolatedWork = await mkdtemp(path.join(os.tmpdir(), 'gomotion-narration-long-test-'));
process.env.GOMOTION_DATA_DIR = isolatedWork;
const { createProductionManager } = await import('./productions.mjs');
const { narrationAudio, narrationPath, TTS_MODEL, pruneNarrationCache } = await import('./narration.mjs');
after(async () => { await rm(isolatedWork, { recursive: true, force: true }); });
import { splitNarration, checkedNarrationArtifact, receiptPath, activeNarrationDirectories } from './narration-chunks.mjs';
import { retainTaskMedia } from './media-retention.mjs';
import { fixtureAudioResponse, fixtureWAV, fixturePCM } from './narration-fixture-utils.mjs';

const config = { visionProvider: 'gemini', visionKey: 'offline-fixture-only', visionBase: 'https://narration.invalid' };
const project = { voice: 'gemini:Kore', language: 'en', voiceStyle: 'documentary' };
const cleanup = async (result) => { if (result) { await rm(result.file, { force: true }); await rm(receiptPath(result.file), { force: true }); await rm(path.join(path.dirname(result.file), 'chunks', result.key), { recursive: true, force: true }); } };
const narrationText = (options) => JSON.parse(options.body).contents[0].parts[0].text.split('\n\nNARRATION:\n')[1];

// Offline tones verify request orchestration and WAV decoding only. They cannot
// verify language, naturalness, speaker identity, or the original Sea Wolf film.
test('a long script is requested in bounded exact-text chunks with the selected voice', async (t) => {
  const text = `  ${randomUUID()}\n` + 'The ocean carries each exact sentence onward.\n\n'.repeat(200) + 'The final sentence stays here.  ';
  const requested = [], voices = new Set(); let result;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'));
    const chunk = narrationText(options);
    assert.ok(chunk.length <= 1200, 'a long script must not be sent as one provider request');
    requested.push(chunk);
    voices.add(JSON.parse(options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName);
    return fixtureAudioResponse();
  });
  try {
    result = await narrationAudio({ text }, project, config, t.signal);
    assert.ok(requested.length > 1);
    const expected = splitNarration(text, project.voiceStyle);
    assert.equal(expected.join(''), text, 'chunking must preserve every original character in order');
    assert.deepEqual([...requested].sort(), [...expected].sort());
    assert.deepEqual([...voices], ['Kore']);
  } finally {
    await cleanup(result);
  }
});


test('25,000 characters split at natural boundaries without altering Unicode, whitespace, or punctuation', () => {
  for (const unit of ['一段中文旁白，保留自然停顿。\n', 'A sentence with exact words.\n\n', '🙂'.repeat(1000), 'x'.repeat(1300)]) {
    const text = (unit.repeat(Math.ceil(25000 / unit.length))).slice(0, 25000);
    const chunks = splitNarration(text, 'gentle');
    assert.equal(chunks.join(''), text); assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 1200 && chunk.length > 0));
    assert.ok(chunks.slice(0, -1).every((chunk) => !/[\uD800-\uDBFF]$/u.test(chunk)), 'do not split Unicode surrogate pairs');
  }
  const paragraphs = splitNarration('A complete sentence.\n\n'.repeat(100), 'documentary');
  assert.ok(paragraphs.slice(0, -1).every((chunk) => /[.\n]$/u.test(chunk)));
});

test('resume reuses completed chunks and regenerates only a corrupt partial', async (t) => {
  const text = randomUUID() + '\n' + Array.from({ length: 160 }, (_, index) => `A complete ocean sentence number ${index} is preserved here.\n`).join('');
  const requested = new Map(); let progress, result, mode = 'fail';
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const chunk = narrationText(options); requested.set(chunk, (requested.get(chunk) || 0) + 1);
    if (mode === 'fail' && progress?.completed >= 1) return new Response(JSON.stringify({ error: { message: 'offline fixture payment rejected' } }), { status: 402 });
    return fixtureAudioResponse();
  });
  try {
    await assert.rejects(narrationAudio({ text }, project, config, t.signal, (value) => { progress = value; }), (error) => error.status === 402);
    assert.ok(progress.completed >= 1 && progress.completed < progress.total);
    const folder = path.join(path.dirname((await import('./narration.mjs')).narrationPath(progress.key)), 'chunks', progress.key);
    const receipts = (await readdir(folder)).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name));
    assert.ok(receipts.length >= 1);
    const completed = new Set(receipts.map((name) => name.slice(0, -5)));
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    const chunks = splitNarration(text, project.voiceStyle);
    const before = new Map(requested);
    mode = 'resume';
    result = await narrationAudio({ text }, project, config, t.signal, (value) => { progress = value; });
    for (const chunk of manifest.chunks.filter((chunk) => completed.has(chunk.key))) assert.equal(requested.get(chunks[chunk.index]), before.get(chunks[chunk.index]), 'never pay again for a checked completed chunk');
    assert.equal(progress.completed, progress.total);
    const target = manifest.chunks[0];
    await writeFile(path.join(folder, target.key + '.wav'), Buffer.alloc(100, 1));
    await rm(result.file);
    const requestsBefore = [...requested.values()].reduce((sum, count) => sum + count, 0);
    result = await narrationAudio({ text }, project, config, t.signal);
    assert.equal([...requested.values()].reduce((sum, count) => sum + count, 0), requestsBefore + 1, 'replace the corrupt chunk only');
    await writeFile(result.file, Buffer.alloc(100, 1));
    result = await narrationAudio({ text }, project, config, t.signal);
    assert.equal([...requested.values()].reduce((sum, count) => sum + count, 0), requestsBefore + 1, 'repair a corrupt final assembly from checked chunks without paid generation');
  } finally {
    await cleanup(result);
    if (progress && !result) await cleanup({ key: progress.key, file: (await import('./narration.mjs')).narrationPath(progress.key) });
  }
});

test('a long assembled WAV exceeding 600 seconds is complete and reused without provider requests', async (t) => {
  const text = randomUUID() + '\n' + 'The complete sentence follows the ocean.\n'.repeat(100);
  const parts = splitNarration(text, project.voiceStyle), seconds = Math.ceil(610 / parts.length);
  let calls = 0, result;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return fixtureAudioResponse([{ tone: seconds }]); });
  try {
    result = await narrationAudio({ text }, project, config, t.signal);
    assert.ok(result.duration > 600, 'long continuous WAV must not be rejected or truncated at ten minutes');
    assert.ok(Math.abs(result.duration - seconds * parts.length) < .1, 'all chunk samples must be retained');
    const cached = await narrationAudio({ text }, project, config, t.signal);
    assert.equal(cached.duration, result.duration); assert.equal(calls, parts.length);
    const artifact = await checkedNarrationArtifact(result.file, result.key, t.signal);
    assert.equal(artifact.duration, result.duration);
  } finally { await cleanup(result); }
});

test('long recordings share bounded work while cancellation removes only its subscriber', async (t) => {
  const text = randomUUID() + '\n' + 'The waves keep the same words and the same voice.\n'.repeat(90);
  const one = new AbortController(), two = new AbortController(), gates = [];
  let started, calls = 0, active = 0, maximum = 0, result;
  const firstRequest = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    calls++; active++; maximum = Math.max(maximum, active); started();
    if (calls <= 3) await new Promise((resolve, reject) => { gates.push(resolve); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    active--; return fixtureAudioResponse();
  });
  try {
    const first = narrationAudio({ text }, project, config, one.signal);
    const cancelled = assert.rejects(first, /stopped/u);
    await firstRequest;
    const second = narrationAudio({ text }, project, config, two.signal); second.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 30)); one.abort(Error('stopped subscriber'));
    for (const finish of gates) finish();
    await cancelled; result = await second;
    assert.equal(calls, splitNarration(text, project.voiceStyle).length); assert.ok(maximum <= 3);
  } finally { one.abort(); two.abort(); for (const finish of gates) finish(); await cleanup(result); }
});


test('an already aligned whole-film recording survives the chunking upgrade without another paid request', async (t) => {
  const seedText = `Legacy request style fixture ${randomUUID()}.`;
  const text = `Legacy whole-film fixture ${randomUUID()}.\n` + 'Every original sentence remains in its exact position.\n'.repeat(100);
  let seed, style, existingFile, result, calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls++; style = JSON.parse(options.body).contents[0].parts[0].text.split('\n\nNARRATION:\n')[0]; return fixtureAudioResponse(); });
  try {
    seed = await narrationAudio({ text: seedText }, project, config, t.signal);
    const legacy = createHash('sha256').update(JSON.stringify({ text, voice: 'Kore', style, model: TTS_MODEL })).digest('hex');
    const key = createHash('sha256').update(`${legacy}:natural-pauses-v2`).digest('hex');
    existingFile = narrationPath(key); await writeFile(existingFile, fixtureWAV(fixturePCM([{ tone: 90 }])));
    const narrationTrack = { processingVersion: 2, key, voice: project.voice, style: project.voiceStyle, language: project.language, duration: 90, scenes: [{ id: 'legacy', text, start: 0, end: 90.23 }] };
    result = await narrationAudio({ text }, { ...project, narrationTrack }, config, t.signal);
    assert.equal(result.key, key); assert.equal(result.duration, 90); assert.equal(calls, 1);
    // Metadata for a different choice must not approve the old bytes.
    result = await narrationAudio({ text }, { ...project, narrationTrack: { ...narrationTrack, style: 'story' } }, config, t.signal);
    assert.notEqual(result.key, key); assert.ok(calls > 1);
  } finally { await cleanup(seed); await cleanup(result); if (existingFile) await rm(existingFile, { force: true }); }
});

test('a production failure persists completed narration progress without publishing an incomplete track', async (t) => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'gomotion-long-production-'));
  const text = randomUUID() + '\n' + Array.from({ length: 160 }, (_, index) => `Ocean sentence ${index} preserves every original word.\n`).join('');
  const scenes = splitNarration(text, project.voiceStyle).map((text, index) => ({ id: `fixture-${index}`, text, searchMethod: 'ai-metadata' }));
  const analyses = new Map(), exports = new Map(); let progress, calls = 0, task;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'), 'never contact a real provider or running server');
    const payload = JSON.parse(options.body); assert.ok(payload.generationConfig.responseModalities?.includes('AUDIO'));
    calls++;
    const stage = [...analyses.values()][0];
    if (stage?.narrationProgress?.completed >= 1) return new Response(JSON.stringify({ error: { message: 'offline 400 fixture' } }), { status: 400 });
    return fixtureAudioResponse();
  });
  try {
    const manager = await createProductionManager({ work, config: { ...config, visionEnabled: true, visionModel: 'offline-fixture-model' }, analyses, exports, saveAssets: async () => {}, autoStart: false });
    task = await manager.submit({ project: { ...project, id: randomUUID(), title: 'Offline long narration failure', script: text, scenes, format: 'landscape' } });
    manager.start();
    const until = Date.now() + 10000; let saved;
    while (Date.now() < until) {
      saved = JSON.parse(await readFile(path.join(work, 'productions', 'jobs.json'), 'utf8'))[0];
      if (saved.status === 'error' && saved.project.narrationWork) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(saved.status, 'error'); progress = saved.project.narrationWork;
    assert.ok(progress.completed >= 1 && progress.completed < progress.total);
    assert.equal(saved.project.narrationTrack, undefined);
    assert.equal([...analyses.values()][0].retry, 0, 'narration failure must never start another footage pass');
    assert.ok(calls > 3 && calls < progress.total, 'only bounded in-flight chunks may be attempted before the failure');
  } finally {
    if (progress) await cleanup({ key: progress.key, file: narrationPath(progress.key) });
    if (task) { const stage = [...analyses.values()][0]; stage?.controller.abort(); }
    await rm(work, { recursive: true, force: true });
  }
});


test('chunk pruning protects active and persisted partial work and removes expired abandoned directories', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'narration-partial-prune-')), directory = path.join(work, 'narration');
  const old = new Date(Date.now() - 26 * 3600000), keys = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(64));
  const dirs = keys.map((key) => path.join(directory, 'chunks', key));
  const currentFile = path.join(directory, keys[0] + '.wav');
  try {
    for (const dir of dirs) { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'fixture.wav'), 'cache pruning fixture'); await utimes(dir, old, old); }
    activeNarrationDirectories.set(dirs[1], 1);
    retainTaskMedia(work, [{ project: { narrationWork: { version: 1, key: keys[2] } } }]);
    await pruneNarrationCache(directory, currentFile);
    for (const dir of dirs.slice(0, 3)) assert.equal((await stat(dir)).isDirectory(), true);
    await assert.rejects(stat(dirs[3]), { code: 'ENOENT' });
    activeNarrationDirectories.delete(dirs[1]); retainTaskMedia(work, []);
    await pruneNarrationCache(directory, currentFile);
    for (const dir of dirs.slice(1, 3)) await assert.rejects(stat(dir), { code: 'ENOENT' });
  } finally { activeNarrationDirectories.delete(dirs[1]); retainTaskMedia(work, []); await rm(work, { recursive: true, force: true }); }
});
