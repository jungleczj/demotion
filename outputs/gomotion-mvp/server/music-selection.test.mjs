import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './process.mjs';
import { prepareBackgroundMusic } from './background-music.mjs';
import { musicAssets } from './music-sources.mjs';
import { prewarmCuratedMusic, rankMusicForProject } from './music-selection.mjs';
import { verifyScottBuckleyTrack } from './source-adapters/scottbuckley.mjs';

const tracks = [
  { slug: 'undertow', title: 'Undertow', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3' },
  { slug: 'the-great-sea', title: 'The Great Sea', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2024/01/TheGreatSea.mp3' },
  { slug: 'machina', title: 'Machina', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_machina.mp3' },
];
const page = (track) => `<h1>${track.title}</h1><h4>Download</h4><a href="${track.url}">MP3</a><p>This work is licensed under a <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>; free as long as credited.</p><h5>Attribution format:</h5><pre>'${track.title}' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au</pre>`;
test('military documentary title selects restrained tension instead of the generic reflective bed', () => {
  for (const title of ["The 'Obsolete' British Missile That Could Shoot Down An Artillery Shell", '战争中的导弹与火炮战斗']) {
    assert.equal(rankMusicForProject({ title }).requestedTrackId, 'scottbuckley:machina');
  }
});
test('scene planning cannot double-count a script and change music or the completed-film cache key', () => {
  const project = { title: 'Danger', script: 'An ocean exploration journey.' };
  const before = rankMusicForProject(project), after = rankMusicForProject({ ...project, scenes: [{ text: project.script }] });
  assert.equal(before.requestedTrackId, 'scottbuckley:machina');
  assert.equal(after.requestedTrackId, before.requestedTrackId);
  assert.equal(rankMusicForProject({ scenes: [{ text: 'An ocean exploration journey.' }] }).requestedTrackId, 'scottbuckley:the-great-sea');
});
async function fixture(folder, signal) {
  const file = path.join(folder, 'test-only.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.25', file], signal);
  return readFile(file);
}
function transport(bytes, requests, rejectTrack) {
  return async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    const audio = tracks.find((track) => track.url === url);
    if (audio) {
      if (audio.slug === rejectTrack) throw new Error('selected audio offline');
      return new Response(options.method === 'HEAD' ? null : bytes, { headers: { 'Content-Length': String(bytes.length) } });
    }
    const track = tracks.find((track) => url === `https://www.scottbuckley.com.au/library/${track.slug}/`);
    if (!track) throw new Error(`Unapproved request: ${url}`);
    return new Response(page(track));
  };
}

test('automatic music uses existing topic and script to choose exploration or tension with no model', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-selection-'));
  try {
    const bytes = await fixture(folder, t.signal), requests = [], fetcher = transport(bytes, requests);
    for (const [name, project, expected] of [
      ['ocean', { title: '海洋探索', script: '跟随探险队发现海洋生物与自然世界。' }, 'scottbuckley:the-great-sea'],
      ['danger', { title: 'Storm survival', script: 'The expedition faces danger, a storm and a desperate fight for survival.' }, 'scottbuckley:machina'],
      ['memory', { title: '岁月与回忆', script: '一个人关于生活与故乡的回忆。' }, 'scottbuckley:undertow'],
    ]) {
      const result = await prepareBackgroundMusic(path.join(folder, name), { project, signal: t.signal, fetch: fetcher });
      assert.equal(result.status, 'ready');
      assert.equal(result.source.id, expected);
      assert.equal(result.selection.selectedTrackId, expected);
      assert.equal(result.source.fullDecode, true);
    }
    assert.ok(requests.every(({ url }) => new URL(url).hostname === 'www.scottbuckley.com.au'));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('verified relevant cache survives registry reset and beats cold downloads; corrupt files never count as cache', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-selection-cache-'));
  try {
    const bytes = await fixture(folder, t.signal), requests = [], project = { topic: 'ocean exploration' };
    const first = await prepareBackgroundMusic(folder, { project, signal: t.signal, fetch: transport(bytes, requests) });
    assert.equal(first.source.id, 'scottbuckley:the-great-sea');
    musicAssets.clear();
    const warm = await prepareBackgroundMusic(folder, { project, signal: t.signal, fetch: async () => { throw new Error('network forbidden'); } });
    assert.equal(warm.status, 'ready'); assert.equal(warm.source.cacheHit, true);
    assert.equal(warm.source.downloadedBytes, 0); assert.equal(warm.source.id, first.source.id);
    assert.equal(warm.selection.cachePreferred, true);
    await writeFile(warm.source.localPath, 'corrupt');
    musicAssets.clear();
    const broken = await prepareBackgroundMusic(folder, { project, signal: t.signal, fetch: async () => { throw new Error('offline corrupt-cache fixture'); } });
    assert.equal(broken.status, 'ready'); assert.equal(broken.source.id, 'scottbuckley:undertow');
    assert.equal(broken.selection.fallback, true);
    await writeFile(broken.source.localPath, 'also corrupt');
    const unavailable = await prepareBackgroundMusic(folder, { project, signal: t.signal, fetch: async () => { throw new Error('offline corrupt-cache fixture'); } });
    assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.narrationPreserved, true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('cold selected download failure has one bounded default fallback and retains selection evidence', async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-selection-fallback-'));
  try {
    const bytes = await fixture(folder, t.signal), requests = [];
    const result = await prepareBackgroundMusic(folder, { project: { title: 'Danger and survival' }, signal: t.signal, fetch: transport(bytes, requests, 'machina') });
    assert.equal(result.status, 'ready'); assert.equal(result.source.id, 'scottbuckley:undertow');
    assert.equal(result.selection.requestedTrackId, 'scottbuckley:machina');
    assert.equal(result.selection.fallback, true);
    assert.ok(result.selection.attempts.some((attempt) => attempt.id === 'scottbuckley:machina' && attempt.status === 'unavailable'));
    assert.ok(!requests.some(({ url }) => url.includes('TheGreatSea.mp3')), 'never try the entire catalog after a failure');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('a generic site footer cannot authorize a track and strict snapshot prewarm cannot omit missing originals', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-selection-rights-'));
  try {
    await assert.rejects(verifyScottBuckleyTrack(tracks[0], { requestText: async () => `<a href="${tracks[0].url}">MP3</a><pre>'Undertow' by Scott Buckley</pre><footer>All music is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></footer>` }), /官方逐曲/);
    await assert.rejects(prewarmCuratedMusic(folder, { cacheOnly: true, fetch: async () => { throw new Error('must never download'); } }), /缓存不完整/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
