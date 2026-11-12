import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { narrationPlan, validNarrationManifest, ensureNarrationManifest, writeNarrationReceipt, verifiedNarrationChunkFiles, withNarrationSlot, assembleNarration } from './narration-chunks.mjs';
import { fixturePCM, fixtureWAV } from './narration-fixture-utils.mjs';
import { checkpointFiles, hydrateCheckpoint } from './cloud/worker.mjs';

const plan = () => narrationPlan('Every exact narration sentence ends here.\n'.repeat(90), 'Kore', 'A constant native-language style.', 'offline-fixture-model', 'documentary');

test('chunk manifest binds every part to the exact script, selected voice, language/style and model', () => {
  const base = plan();
  assert.equal(validNarrationManifest(base.manifest, base.manifest.key), true);
  for (const request of [
    ['Different exact script. '.repeat(100), 'Kore', 'A constant native-language style.', 'offline-fixture-model'],
    [base.texts.join(''), 'Puck', 'A constant native-language style.', 'offline-fixture-model'],
    [base.texts.join(''), 'Kore', 'A different native-language style.', 'offline-fixture-model'],
    [base.texts.join(''), 'Kore', 'A constant native-language style.', 'another-fixture-model'],
  ]) assert.notEqual(narrationPlan(...request).manifest.key, base.manifest.key);
  const stale = structuredClone(base.manifest); stale.chunks[0].textHash = 'a'.repeat(64);
  assert.equal(validNarrationManifest(stale, base.manifest.key), false);
});

test('cloud checkpoint carries only attributable complete chunk WAV/receipt pairs and can hydrate them offline', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'narration-checkpoint-fixture-'));
  const staging = await mkdtemp(path.join(os.tmpdir(), 'narration-checkpoint-stage-'));
  const restored = await mkdtemp(path.join(os.tmpdir(), 'narration-checkpoint-restore-'));
  const { manifest } = plan(), directory = path.join(work, 'narration', 'chunks', manifest.key);
  const progress = { version: 1, key: manifest.key, chunkKeys: manifest.chunks.map((chunk) => chunk.key), completed: 1, total: manifest.chunks.length };
  const task = { status: 'running', project: { scenes: [], narrationWork: progress } };
  try {
    await ensureNarrationManifest(directory, manifest);
    const audio = path.join(directory, manifest.chunks[0].key + '.wav');
    await writeFile(audio, fixtureWAV(fixturePCM()));
    await writeNarrationReceipt(audio, `${manifest.key}:${manifest.chunks[0].key}`, 1);
    await writeFile(path.join(directory, manifest.chunks[1].key + '.wav'), fixtureWAV(fixturePCM())); // unfinished: no receipt
    await writeFile(path.join(directory, 'unfinished.raw.wav'), 'offline partial');
    const files = await checkpointFiles(work, task, staging);
    assert.equal(files.length, 3, 'only immutable manifest and one checked WAV/receipt pair');
    assert.ok(files.every((file) => file.relativePath.startsWith(`narration/chunks/${manifest.key}/`)));
    await hydrateCheckpoint(restored, files.map((file) => ({ ...file, url: file.relativePath })), async (relative) => new Response(await readFile(path.join(staging, relative))));
    assert.equal((await verifiedNarrationChunkFiles(restored, progress)).length, 3);
    assert.deepEqual(await verifiedNarrationChunkFiles(work, { ...progress, key: 'b'.repeat(64) }), []);
    assert.deepEqual(await verifiedNarrationChunkFiles(work, { ...progress, chunkKeys: ['c'.repeat(64)] }), []);
    await writeFile(audio, fixtureWAV(fixturePCM([{ tone: 2 }])));
    assert.deepEqual(await checkpointFiles(work, task), [], 'changed bytes must not be uploaded under a stale receipt');
  } finally { await Promise.all([work, staging, restored].map((file) => rm(file, { recursive: true, force: true }))); }
});

test('a corrupt manifest discards its partial cache instead of making an unrelated recording reusable', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'narration-manifest-fixture-'));
  try {
    const { manifest } = plan(); await mkdir(work, { recursive: true });
    await writeFile(path.join(work, 'manifest.json'), JSON.stringify({ ...manifest, request: { ...manifest.request, voice: 'AnotherVoice' } }));
    await writeFile(path.join(work, 'unattributable.wav'), 'invalid fixture');
    await ensureNarrationManifest(work, manifest);
    assert.deepEqual(JSON.parse(await readFile(path.join(work, 'manifest.json'), 'utf8')), manifest);
    await assert.rejects(readFile(path.join(work, 'unattributable.wav')), { code: 'ENOENT' });
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('queued cancellation frees no other caller and never starts its provider work', async () => {
  const gates = [], controller = new AbortController(); let started = 0;
  const active = Array.from({ length: 3 }, () => withNarrationSlot(undefined, () => new Promise((resolve) => { started++; gates.push(resolve); })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const queued = withNarrationSlot(controller.signal, async () => { started++; });
  const rejected = assert.rejects(queued, /cancelled queued/u); controller.abort(Error('cancelled queued'));
  await rejected; assert.equal(started, 3);
  gates.forEach((resolve) => resolve()); await Promise.all(active);
  await withNarrationSlot(undefined, async () => { started++; }); assert.equal(started, 4);
});


test('continuous WAV assembly preserves every PCM sample in the supplied chunk order', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-sample-order-'));
  const pcm = [0, 1, 2].map((index) => { const bytes = Buffer.alloc(24000 * (index + 1)); for (let sample = 0; sample < bytes.length / 2; sample++) bytes.writeInt16LE((index + 1) * 1000 + sample % 500, sample * 2); return bytes; });
  try {
    const files = [];
    for (let index = 0; index < pcm.length; index++) { const file = path.join(directory, `${index}.wav`); await writeFile(file, fixtureWAV(pcm[index])); files.push(file); }
    const output = path.join(directory, 'assembled.wav');
    await assembleNarration([files[2], files[0], files[1]], output);
    const bytes = await readFile(output); let data;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32LE(offset + 4);
      if (bytes.toString('ascii', offset, offset + 4) === 'data') { data = bytes.subarray(offset + 8, offset + 8 + size); break; }
      offset += 8 + size + size % 2;
    }
    assert.ok(data); assert.deepEqual(data, Buffer.concat([pcm[2], pcm[0], pcm[1]]));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
