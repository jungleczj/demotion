import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { searchSources } from './sources.mjs';

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
