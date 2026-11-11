import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { searchSources, assets, ensureAnalysisPreview } from './sources.mjs';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const image = { id: 99111, tags: 'penguin egg photograph', largeImageURL: 'https://cdn.pixabay.com/photo/fixture.jpg', webformatURL: 'https://cdn.pixabay.com/photo/preview.jpg', pageURL: 'https://pixabay.com/photos/penguin-99111/', user: 'Source photographer', imageWidth: 1200, imageHeight: 1800, imageSize: 120000 };

test('image fallback can retrieve a portrait base photograph for a landscape composition', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ hits: [image] }) });
  const result = await searchSources('source-photo-fixture', ['pixabay'], { pixabayKey: 'fixture', outputFormat: 'landscape' }, 'image');
  assert.equal(result.assets.length, 1, 'image layout is composed later; source video orientation rules must not discard it');
  assert.equal(result.assets[0].sourceUrl, image.pageURL);
  assert.equal(result.assets[0].width, 1200);
  assert.equal(result.assets[0].height, 1800);
});

test('video searches continue excluding opposite orientation footage', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ hits: [{ id: 99112, tags: 'penguin video', pageURL: 'https://pixabay.com/videos/penguin-99112/', user: 'Source videographer', duration: 10, videos: { medium: { url: 'https://cdn.pixabay.com/video/fixture.mp4', width: 720, height: 1280, size: 1000000 } } }] }) });
  const result = await searchSources('source-video-fixture', ['pixabay'], { pixabayKey: 'fixture', outputFormat: 'landscape' }, 'video');
  assert.equal(result.assets.length, 0);
});

test('automatic image fallback queries new public image catalogs without new UI settings', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url); calls.push(u.hostname);
    const data = u.hostname === 'api.openverse.org' ? { results: [{ id: 'image-auto-fixture', title: 'Penguin photograph', creator: 'Photographer', url: 'https://images.example.org/penguin.jpg', foreign_landing_url: 'https://example.org/penguin', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', width: 2400, height: 1600 }] } : u.hostname === 'openaccess-api.clevelandart.org' ? { data: [] } : { hits: [] };
    return { ok: true, json: async () => data };
  };
  const result = await searchSources('auto-image-expand-fixture', ['pixabay'], { pixabayKey: 'fixture' }, 'image');
  assert.ok(calls.includes('api.openverse.org')); assert.ok(calls.includes('openaccess-api.clevelandart.org'));
  assert.deepEqual(result.queriedSources, ['pixabay', 'openverse', 'cleveland']);
  assert.equal(result.assets[0].provider, 'openverse'); assert.equal(assets.get(result.assets[0].id).kind, 'image');
});

test('automatic video retrieval includes configured stock sources omitted by the planner and can be disabled', async () => {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(new URL(url).hostname); return { ok: true, json: async () => ({ query: { pages: {} }, videos: [], hits: [] }) }; };
  const config = { pexelsKey: 'fixture', pixabayKey: 'fixture', outputFormat: 'landscape' };
  const expanded = await searchSources('auto-stock-expand-fixture', ['commons'], config, 'video');
  assert.deepEqual(expanded.queriedSources, ['commons', 'pexels', 'pixabay']);
  assert.ok(calls.includes('api.pexels.com')); assert.ok(calls.includes('pixabay.com'));
  const isolated = await searchSources('stock-no-expand-fixture', ['commons'], { ...config, expandSources: false }, 'video');
  assert.deepEqual(isolated.queriedSources, ['commons']);
});

test('automatic YouTube discoveries stay outside editable assets and the asset registry', async () => {
  let youtubeCalls = 0;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const data = u.hostname === 'www.googleapis.com' ? (++youtubeCalls, u.pathname.endsWith('/search') ? { items: [{ id: { videoId: 'abcdefghijk' } }] } : { items: [{ id: 'abcdefghijk', snippet: { title: 'Reference fixture', channelTitle: 'Official owner', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT30S' }, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed', license: 'creativeCommon' } }] }) : { hits: [] };
    return { ok: true, json: async () => data };
  };
  const result = await searchSources('youtube-auto-discovery-fixture', ['pixabay'], { pixabayKey: 'fixture', youtubeKey: 'fixture-youtube', expandSources: false }, 'video');
  assert.equal(result.assets.length, 0); assert.equal(result.references.length, 1); assert.equal(result.references[0].needsOriginal, true);
  assert.equal('downloadUrl' in result.references[0], false); assert.equal('url' in result.references[0], false);
  assert.equal([...assets.values()].some((a) => a.provider === 'youtube'), false); assert.equal(youtubeCalls, 2);
});

test('analysis metadata requests propagate cancellation for Commons, Pixabay and Coverr without mutating the asset', async () => {
  for (const provider of ['commons', 'pixabay', 'coverr']) {
    const controller = new AbortController(); let received;
    globalThis.fetch = async (_url, { signal }) => {
      received = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    };
    const asset = { provider, sourceId: '123', kind: 'video' };
    const pending = ensureAnalysisPreview(asset, { pixabayKey: 'fixture', coverrKey: 'fixture' }, controller.signal);
    controller.abort(new Error(`cancel-${provider}`));
    await assert.rejects(pending, new RegExp(`cancel-${provider}`));
    assert.equal(received.aborted, true); assert.equal(asset.analysisUrl, undefined); assert.equal(asset.derivativesChecked, undefined);
  }
  const preaborted = new AbortController(); preaborted.abort(new Error('already cancelled'));
  globalThis.fetch = () => { throw new Error('must not request'); };
  await assert.rejects(ensureAnalysisPreview({ provider: 'nasa' }, { signal: preaborted.signal }), /already cancelled/);
});
