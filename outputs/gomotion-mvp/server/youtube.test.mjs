import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeClient } from './youtube.mjs';

const first = 'AbCdEfGhI_1', second = 'AbCdEfGhI_2';
const video = (id, status = {}) => ({ id, snippet: { title: `Video ${id}`, description: 'Original source details', channelId: 'UCsource', channelTitle: 'Source', publishedAt: '2026-01-01T00:00:00Z', liveBroadcastContent: 'none', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } }, contentDetails: { duration: 'PT1M32S' }, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed', license: 'creativeCommon', ...status } });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('search returns source references, never editable or downloadable footage', async () => {
  const calls = [];
  const client = createYouTubeClient({ fetch: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return response(url.pathname.endsWith('/search') ? { items: [{ id: { videoId: first } }, { id: { videoId: second } }, { id: { videoId: 'invalid' } }] } : { items: [video(second, { embeddable: false }), { ...video(first), downloadUrl: 'https://fake.invalid/file.mp4' }] });
  } });
  const result = await client.search('whale migration', { youtubeKey: 'private-test-key' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.origin, 'https://www.googleapis.com');
  assert.equal(calls[0].url.searchParams.get('videoLicense'), 'creativeCommon');
  assert.equal(calls[0].url.searchParams.get('type'), 'video');
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'private-test-key');
  assert.equal(calls[0].url.searchParams.has('key'), false);
  assert.equal(calls[1].url.searchParams.get('id'), `${first},${second}`);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].videoId, first);
  assert.equal(result.references[0].duration, 92);
  assert.equal(result.references[0].watchUrl, `https://www.youtube.com/watch?v=${first}`);
  assert.equal(result.references[0].needsOriginal, true);
  for (const property of ['url', 'downloadUrl', 'playbackUrl', 'playbackChecked', 'downloadChecked', 'kind']) assert.equal(property in result.references[0], false);
  assert.equal(JSON.stringify(result).includes('private-test-key'), false);
});

test('reuses metadata for 24 hours, isolates credentials and cannot be corrupted by callers', async () => {
  let calls = 0, current = 1000;
  const client = createYouTubeClient({ now: () => current, fetch: async (url) => {
    calls++; return response(url.pathname.endsWith('/search') ? { items: [{ id: { videoId: first } }] } : { items: [video(first)] });
  } });
  const config = { youtubeKey: 'key-one' };
  const initial = await client.search('ocean waves', config);
  initial.references[0].title = 'tampered';
  const cached = await client.search('ocean waves', config);
  assert.equal(cached.cacheHit, true); assert.equal(calls, 2);
  assert.equal(cached.references[0].title, `Video ${first}`);
  await client.search('ocean waves', { youtubeKey: 'key-two' }); assert.equal(calls, 4);
  current += 24 * 60 * 60 * 1000 + 1;
  await client.search('ocean waves', config); assert.equal(calls, 6);
});

test('quota errors are classified, redacted, never automatically retried or cached', async () => {
  let calls = 0;
  const client = createYouTubeClient({ fetch: async () => { calls++; return response({ error: { message: 'leaky-private-key', errors: [{ reason: 'quotaExceeded' }] } }, 403); } });
  for (let n = 0; n < 2; n++) await assert.rejects(client.search('ocean waves', { youtubeKey: 'leaky-private-key' }), (error) => {
    assert.equal(error.status, 429); assert.equal(error.code, 'youtube-quota');
    assert.equal(error.message.includes('leaky-private-key'), false); return true;
  });
  assert.equal(calls, 2);
});

test('missing key, invalid query, invalid filters and cancellation make no network request', async () => {
  let calls = 0;
  const client = createYouTubeClient({ fetch: async () => { calls++; throw new Error('must not run'); } });
  await assert.rejects(client.search('whale', {}), { status: 400 });
  await assert.rejects(client.search('', { youtubeKey: 'test' }), { status: 400 });
  await assert.rejects(client.search('whale', { youtubeKey: 'test' }, { license: 'made-up' }), { status: 400 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.search('whale', { youtubeKey: 'test' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('empty results need no details call and all-license references retain their actual license', async () => {
  let emptyCalls = 0;
  const empty = createYouTubeClient({ fetch: async () => { emptyCalls++; return response({ items: [] }); } });
  assert.deepEqual((await empty.search('empty result', { youtubeKey: 'test' })).references, []);
  assert.equal(emptyCalls, 1);
  const all = createYouTubeClient({ fetch: async (url) => response(url.pathname.endsWith('/search') ? { items: [{ id: { videoId: first } }] } : { items: [video(first, { license: 'youtube' })] }) });
  const result = await all.search('whale', { youtubeKey: 'test' }, { license: 'any' });
  assert.equal(result.references[0].license, 'youtube');
  assert.equal(result.references[0].needsOriginal, true);
});

test('concurrent searches share requests and one cancellation leaves the other subscriber intact', async () => {
  let calls = 0, release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const client = createYouTubeClient({ fetch: async (url, options) => {
    calls++;
    if (url.pathname.endsWith('/search')) { await waiting; assert.equal(options.signal.aborted, false); return response({ items: [{ id: { videoId: first } }] }); }
    return response({ items: [video(first)] });
  } });
  const controller = new AbortController();
  const cancelled = client.search('same whale', { youtubeKey: 'test' }, { signal: controller.signal });
  const kept = client.search('same whale', { youtubeKey: 'test' });
  const rejection = assert.rejects(cancelled, { name: 'AbortError' });
  await new Promise(setImmediate); controller.abort(); release();
  await rejection;
  assert.equal((await kept).references[0].videoId, first);
  assert.equal(calls, 2);
});

test('invalid upstream metadata is not published or cached, and connection errors cannot echo credentials', async () => {
  let calls = 0;
  const malformed = createYouTubeClient({ fetch: async () => { calls++; return response({ items: 'not-an-array' }); } });
  for (let n = 0; n < 2; n++) await assert.rejects(malformed.search('whale', { youtubeKey: 'test' }), { status: 502 });
  assert.equal(calls, 2);
  const disconnected = createYouTubeClient({ fetch: async () => { throw new Error('secret-upstream-key in transport diagnostic'); } });
  await assert.rejects(disconnected.search('whale', { youtubeKey: 'secret-upstream-key' }), (error) => error.status === 502 && !error.message.includes('secret-upstream-key'));
});
