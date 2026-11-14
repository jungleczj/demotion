import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './process.mjs';
import { prepareBackgroundMusic } from './background-music.mjs';
import { rankMusicForProject } from './music-selection.mjs';
import { musicLicenseError } from './music-sources.mjs';

test('disabled music and zero percent volume never prepare or download an original', async () => {
  for (const musicOptions of [{ enabled: false }, { enabled: true, volume: 0 }]) {
    const result = await prepareBackgroundMusic('/unused', { project: { musicOptions }, fetch: async () => { throw Error('must not download'); } });
    assert.equal(result.status, 'disabled');
  }
});

test('an explicit track wins over story cues and genre chooses a suitable real track', () => {
  assert.equal(rankMusicForProject({ title: 'War and danger', musicOptions: { trackId: 'scottbuckley:undertow' } }).requestedTrackId, 'scottbuckley:undertow');
  assert.equal(rankMusicForProject({ title: 'A quiet memory', musicOptions: { genre: 'epic' } }).requestedTrackId, 'scottbuckley:the-great-sea');
  assert.equal(rankMusicForProject({ musicOptions: { genre: 'tension' } }).requestedTrackId, 'scottbuckley:machina');
  assert.throws(() => rankMusicForProject({ musicOptions: { trackId: 'https://example.org/music.mp3' } }), /曲目/);
});

test('an unavailable explicit track never downloads another track', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-explicit-'));
  const requests = [];
  try {
    const result = await prepareBackgroundMusic(folder, { project: { musicOptions: { trackId: 'scottbuckley:machina' } }, fetch: async (url) => { requests.push(url); throw Error('selected offline'); } });
    assert.equal(result.status, 'unavailable');
    assert.ok(requests.length > 0);
    assert.ok(requests.every((url) => url.includes('machina')));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('uploaded music persists verified original bytes and rejects forged paths, corrupt audio and changed hashes', async (t) => {
  const uploads = await import('./music-uploads.mjs');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-upload-'));
  try {
    const file = path.join(folder, 'fixture.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.4', file], t.signal);
    const data = (await readFile(file)).toString('base64');
    const saved = await uploads.saveMusicUpload({ name: 'my music.wav', data }, folder, { signal: t.signal });
    assert.match(saved.id, /^[a-f0-9-]{36}$/);
    assert.equal(saved.name, 'my music.wav');
    const source = await uploads.acquireUploadedMusic(saved, folder, { signal: t.signal });
    assert.equal(source.fullDecode, true);
    assert.equal(source.license, 'User supplied');
    assert.equal(musicLicenseError(source), '');
    assert.equal(source.sha256, saved.sha256);
    await assert.rejects(uploads.acquireUploadedMusic({ id: '../../fixture', localPath: file }, folder), /上传/);
    await assert.rejects(uploads.saveMusicUpload({ name: 'fake.mp3', data: Buffer.from('not audio').toString('base64') }, folder), /ffprobe|音频/);
    await writeFile(source.localPath, 'tampered');
    await assert.rejects(uploads.acquireUploadedMusic(saved, folder), /散列|音频|ffprobe/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('catalog lists only real available titles and preview supports suffix and closed byte ranges', async () => {
  const { musicCatalog, audioByteResponse } = await import('./music-catalog.mjs');
  const catalog = musicCatalog();
  assert.deepEqual(catalog.tracks.map((t) => t.title).sort(), ['Machina', 'The Great Sea', 'Undertow']);
  assert.ok(catalog.tracks.every((t) => t.duration > 240 && t.previewUrl.startsWith('/api/music/preview?id=')));
  const bytes = Buffer.from('0123456789');
  for (const [range, status, result] of [['bytes=2-4', 206, '234'], ['bytes=-3', 206, '789'], ['bytes=99-', 416, '']]) {
    const response = audioByteResponse(bytes, new Request('https://app.test/api/music/preview', { headers: { range } }), 'audio/mpeg');
    assert.equal(response.status, status);
    assert.equal(await response.text(), result);
  }
});

test('deployed music catalog and official preview require no model and reject unknown tracks', async () => {
  const { createVercelHandler } = await import('./vercel-api.mjs');
  const handler = createVercelHandler({ env: {}, fetchImpl: async (url) => {
    assert.equal(url, 'https://www.scottbuckley.com.au/library/undertow/');
    return new Response(`<p>This work is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a></p><a href="https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3">MP3</a><pre>'Undertow' by Scott Buckley</pre>`);
  } });
  const catalog = await handler(new Request('https://app.test/api/music/catalog'));
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).tracks.length, 3);
  const preview = await handler(new Request('https://app.test/api/music/preview?id=scottbuckley%3Aundertow', { headers: { range: 'bytes=0-100' } }));
  assert.equal(preview.status, 307);
  assert.equal(preview.headers.get('location'), 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3');
  assert.equal((await handler(new Request('https://app.test/api/music/preview?id=https://evil.test/a.mp3'))).status, 404);
  assert.equal((await handler(new Request('https://app.test/api/music/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 503);
});

test('upload limit accepts a real 3MB body and rejects a larger original before a decoder or worker runs', async () => {
  const { decodeMusicUpload } = await import('./music-upload-input.mjs');
  const input = { name: 'Original.mp3', data: Buffer.alloc(3_000_000, 42).toString('base64') };
  assert.equal(decodeMusicUpload(input).bytes.length, 3_000_000);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) < 4_500_000);
  assert.throws(() => decodeMusicUpload({ ...input, data: Buffer.alloc(3_000_001).toString('base64') }), /3MB/);
  assert.throws(() => decodeMusicUpload({ ...input, data: 'data:audio/mp3;base64,AAAA' }), /无效/);
});

test('percent volume changes the real music bed while high volume keeps narration protected', async (t) => {
  const { saveMusicUpload, acquireUploadedMusic } = await import('./music-uploads.mjs');
  const { mixBackgroundMusic } = await import('./background-music.mjs');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-percent-'));
  try {
    const video = path.join(folder, 'voice.mp4'), audio = path.join(folder, 'original.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=size=160x90:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-shortest', video], t.signal);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', audio], t.signal);
    const saved = await saveMusicUpload({ name: 'Original.wav', data: (await readFile(audio)).toString('base64') }, folder, { signal: t.signal });
    const source = await acquireUploadedMusic(saved, folder, { signal: t.signal }), levels = [];
    for (const volume of [1, 3, 100]) {
      const output = path.join(folder, `volume-${volume}.mp4`);
      const result = await mixBackgroundMusic(video, source, output, { duration: 3, volume, signal: t.signal });
      assert.equal(result.mix.volumePercent, volume);
      assert.ok(result.mix.targetMusicLufs <= result.mix.narrationLufs - 14);
      const measured = await run('ffmpeg', ['-v', 'info', '-ss', '1', '-t', '0.5', '-i', output, '-vn', '-af', 'bandpass=f=220:width_type=h:width=20,volumedetect', '-f', 'null', '-'], t.signal, true);
      levels.push(Number(measured.match(/mean_volume: ([\d.-]+) dB/)?.[1]));
    }
    assert.ok(levels[0] < levels[1] - 2, `1% must be quieter than 3%: ${levels}`);
    assert.ok(levels[2] >= levels[1] - .5);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
