import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run } from './process.mjs';
import { musicAssets, musicLicenseError, searchMusicSources, acquireMusicAsset } from './music-sources.mjs';
import { SCOTT_BUCKLEY_TRACKS } from './source-adapters/scottbuckley.mjs';
import * as musicSources from './music-sources.mjs';
const officialPage = (track) => `<p>This work is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a></p><a href="${track.url}">MP3</a>`;

test('music backend searches official tracks, downloads once, fully decodes and verifies content hash on cache reuse', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-sources-'));
  try {
    const fixture = path.join(folder, 'fixture.wav');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.25', '-c:a', 'pcm_s16le', fixture]);
    const bytes = await readFile(fixture); let pages = 0, downloads = 0;
    const fetcher = async (url, options) => {
      const track = SCOTT_BUCKLEY_TRACKS.find((t) => url === t.url);
      if (track) { if (options.method !== 'HEAD') downloads++; return new Response(options.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.length) } }); }
      pages++; return new Response(officialPage(SCOTT_BUCKLEY_TRACKS[0]), { headers: { 'Content-Type': 'text/html' } });
    };
    const found = await searchMusicSources('reflective', {}, { providers: ['scottbuckley'], fetch: fetcher });
    assert.equal(found.assets.length, 1); assert.equal(found.assets[0].kind, 'audio');
    const ready = await acquireMusicAsset(found.assets[0].id, path.join(folder, 'cache'), { fetch: fetcher });
    assert.equal(ready.fullDecode, true); assert.ok(Math.abs(ready.duration - 1.25) < .01); assert.match(ready.sha256, /^[0-9a-f]{64}$/);
    const warm = await acquireMusicAsset(found.assets[0].id, path.join(folder, 'cache'), { fetch: fetcher });
    assert.equal(warm.cacheHit, true); assert.equal(warm.downloadedBytes, 0); assert.equal(warm.sha256, ready.sha256); assert.equal(downloads, 1);
    await writeFile(ready.localPath, 'broken cache');
    const repaired = await acquireMusicAsset(found.assets[0].id, path.join(folder, 'cache'), { fetch: fetcher });
    assert.equal(downloads, 2); assert.equal(repaired.sha256, ready.sha256); assert.equal(pages, 1);
    const cached = await searchMusicSources('reflective', {}, { providers: ['scottbuckley'], fetch: fetcher });
    assert.equal(cached.cached, true); assert.equal(pages, 1);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('large range-capable music downloads bounded nonoverlapping original bytes and rejects changed versions', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-ranges-'));
  const base = { ...SCOTT_BUCKLEY_TRACKS[0], id: 'scottbuckley:range-fixture', provider: 'scottbuckley', sourceId: 'range-fixture', kind: 'audio', sourceUrl: 'https://www.scottbuckley.com.au/library/undertow/', author: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Offline range fixture only' };
  musicAssets.set(base.id, base);
  try {
    const fixture = path.join(folder, 'fixture.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=sample_rate=48000:duration=15', '-ac', '2', fixture], t.signal);
    const bytes = await readFile(fixture), ranges = [];
    const headers = { 'Content-Length': String(bytes.length), 'Accept-Ranges': 'bytes', 'Last-Modified': 'Fri, 13 Dec 2019 10:21:19 GMT' };
    const fetcher = async (_url, options) => {
      if (options.method === 'HEAD') return new Response(null, { headers });
      const range = options.headers.Range;
      assert.ok(range, 'large originals must avoid the stalled unbounded full GET path');
      const [, start, end] = range.match(/^bytes=(\d+)-(\d+)$/).map(Number);
      assert.ok(end - start + 1 <= 65536, 'large responses stall on the verified source transport');
      ranges.push([start, end]);
      return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } });
    };
    const result = await acquireMusicAsset(base.id, path.join(folder, 'cache'), { signal: t.signal, fetch: fetcher });
    assert.equal(result.fullDecode, true);
    assert.equal(result.downloadedBytes, bytes.length);
    assert.deepEqual(await readFile(result.localPath), bytes);
    ranges.sort((a, b) => a[0] - b[0]);
    assert.equal(ranges[0][0], 0);
    assert.equal(ranges.at(-1)[1], bytes.length - 1);
    ranges.slice(1).forEach((range, index) => assert.equal(range[0], ranges[index][1] + 1));
    const badFolder = path.join(folder, 'changed-version');
    await assert.rejects(acquireMusicAsset(base.id, badFolder, { signal: t.signal, fetch: async (_url, options) => options.method === 'HEAD'
      ? new Response(null, { headers })
      : new Response(bytes.subarray(0, 524288), { status: 206, headers: { ...headers, 'Content-Length': '524288', 'Content-Range': `bytes 0-524287/${bytes.length}`, 'Last-Modified': 'Sat, 14 Dec 2019 10:21:19 GMT' } }) }), /范围|版本/);
    assert.deepEqual(await readdir(badFolder), [], 'a changed remote version must leave no usable original or part');
  } finally { musicAssets.delete(base.id); await rm(folder, { recursive: true, force: true }); }
});

test('music acquisition rejects unregistered files, unlicensed files, oversize streams, bad decode and unsafe redirects', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-reject-'));
  const base = { id: 'scottbuckley:reject-fixture', provider: 'scottbuckley', kind: 'audio', url: SCOTT_BUCKLEY_TRACKS[0].url, sourceUrl: 'https://www.scottbuckley.com.au/library/undertow/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'Scott Buckley', attribution: 'Fixture only' };
  try {
    await assert.rejects(acquireMusicAsset('unregistered', folder), /先检索/);
    assert.match(musicLicenseError({ ...base, license: 'CC BY-NC 4.0' }), /允许商业/);
    assert.match(musicLicenseError({ ...base, licenseUrl: 'malformed' }), /无效/);
    assert.match(musicLicenseError({ ...base, url: 'https://127.0.0.1/file' }), /不完整/);
    musicAssets.set(base.id, base);
    await assert.rejects(acquireMusicAsset(base.id, folder, { fetch: async () => new Response('x', { headers: { 'content-length': String(49 * 1024 * 1024) } }) }), /48MB/);
    await assert.rejects(acquireMusicAsset(base.id, folder, { fetch: async () => new Response('x', { status: 206 }) }), /完整文件/);
    await assert.rejects(acquireMusicAsset(base.id, folder, { fetch: async () => new Response('not audio') }), /ffprobe|音频/);
    await assert.rejects(acquireMusicAsset(base.id, folder, { fetch: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }) }), /不允许/);
  } finally { musicAssets.delete(base.id); await rm(folder, { recursive: true, force: true }); }
});

test('Openverse audio must have matching original-file and license links on its source page before any audio download', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'openverse-license-'));
  const asset = { id: 'openverse:license-fixture', provider: 'openverse', kind: 'audio', url: 'https://media.example.org/audio.mp3', sourceUrl: 'https://example.org/audio', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'Fixture author', attribution: 'Fixture author — CC BY 4.0' };
  musicAssets.set(asset.id, asset);
  const requests = [];
  try {
    await assert.rejects(acquireMusicAsset(asset.id, folder, { fetch: async (url) => { requests.push(url); return new Response('<a href="https://creativecommons.org/licenses/by/4.0/">License</a>'); } }), /未同时确认/);
    assert.deepEqual(requests, [asset.sourceUrl]);
  } finally { musicAssets.delete(asset.id); await rm(folder, { recursive: true, force: true }); }
});

test('default music survives a registry reset and reuses the verified original without another page or audio request', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'default-music-cache-'));
  try {
    const fixture = path.join(folder, 'fixture.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.25', fixture], t.signal);
    const bytes = await readFile(fixture);
    const fetcher = async (url) => url === SCOTT_BUCKLEY_TRACKS[0].url
      ? new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } })
      : new Response(officialPage(SCOTT_BUCKLEY_TRACKS[0]));
    const first = await musicSources.acquireDefaultMusic(folder, { signal: t.signal, fetch: fetcher });
    assert.equal(first.fullDecode, true);
    assert.equal(first.cacheHit, false);
    musicAssets.delete(first.id);
    const warm = await musicSources.acquireDefaultMusic(folder, { signal: t.signal, fetch: async () => { throw new Error('unexpected external request'); } });
    assert.equal(warm.cacheHit, true);
    assert.equal(warm.downloadedBytes, 0);
    assert.equal(warm.sha256, first.sha256);
    assert.equal(warm.author, 'Scott Buckley');
    assert.equal(warm.license, 'CC BY 4.0');
    assert.equal(warm.sourceUrl, 'https://www.scottbuckley.com.au/library/undertow/');
    assert.equal(warm.licenseEvidence.method, 'official-track-page');
    await writeFile(`${warm.localPath}.json`, JSON.stringify({ ...warm, author: 'changed author' }));
    musicAssets.delete(first.id);
    const repaired = await musicSources.acquireDefaultMusic(folder, { signal: t.signal, fetch: fetcher });
    assert.equal(repaired.author, 'Scott Buckley', 'a changed receipt must never override the verified author');
    assert.equal(repaired.cacheHit, false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
