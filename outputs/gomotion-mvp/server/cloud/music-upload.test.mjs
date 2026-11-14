import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from '../process.mjs';
import { validateMusicFile } from '../music-sources.mjs';

test('private cloud upload decodes bytes, returns no storage credentials and hydrates only the owning session', async (t) => {
  const { createCloudMusicUploads, musicUploadCheckpoint } = await import('./music-upload.mjs');
  const json = new Map(), objects = new Map();
  const store = {
    async read(key) { return json.has(key) ? { value: structuredClone(json.get(key)) } : null; },
    async change(key, update) { const value = await update(json.get(key)); if (value !== undefined) json.set(key, structuredClone(value)); return value; },
    async upload(key) { return { url: `https://private-blob.test/${key}`, blobRef: key }; },
    async verify(key, expected) { const bytes = objects.get(key); assert.equal(bytes.length, expected.size); assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256); },
    async download(key) { if (!objects.has(key)) throw Error('missing'); return `https://private-download.test/${key}?token=private`; },
  };
  const folder = await mkdtemp(path.join(os.tmpdir(), 'cloud-music-'));
  try {
    const file = path.join(folder, 'audio.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.25', file], t.signal);
    const input = { name: 'Original.wav', data: (await readFile(file)).toString('base64') };
    const manager = createCloudMusicUploads({ store, validate: async (bytes) => { const uploaded = path.join(folder, 'uploaded.audio'); await writeFile(uploaded, bytes); return { ...await validateMusicFile(uploaded, t.signal, 3_000_000, { uploaded: true }), fullDecode: true }; }, fetchImpl: async (url, init) => { objects.set(new URL(url).pathname.slice(1), Buffer.from(init.body)); return new Response(null, { status: 200 }); } });
    const owner = '11111111-1111-4111-8111-111111111111';
    const upload = await manager.save(owner, input, t.signal);
    assert.deepEqual(Object.keys(upload).sort(), ['id', 'name', 'sha256']);
    const checkpoint = await musicUploadCheckpoint(store, owner, upload);
    assert.equal(checkpoint.files.length, 2);
    assert.ok(checkpoint.files.every((file) => file.relativePath.startsWith(`music-uploads/${upload.id}.audio`) && file.url.startsWith('https://private-download.test/')));
    await assert.rejects(musicUploadCheckpoint(store, '22222222-2222-4222-8222-222222222222', upload), /不存在|上传/);
    await assert.rejects(musicUploadCheckpoint(store, owner, { ...upload, sha256: 'f'.repeat(64) }), /散列|凭据/);
    await assert.rejects(manager.save(owner, { name: 'Fake.mp3', data: Buffer.from('invalid').toString('base64') }, t.signal), /ffprobe|音频/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
