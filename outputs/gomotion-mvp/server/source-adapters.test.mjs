import test from 'node:test';
import assert from 'node:assert/strict';
import { searchOpenverse } from './source-adapters/openverse.mjs';
import { searchCleveland } from './source-adapters/cleveland.mjs';
import { searchScottBuckley, SCOTT_BUCKLEY_TRACKS } from './source-adapters/scottbuckley.mjs';

const openImage = { id: 'ov-1', url: 'https://images.example.org/bird.jpg', foreign_landing_url: 'https://example.org/bird', creator: 'A photographer', title: 'Bird', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', width: 2000, height: 1500, attribution: 'Bird by A photographer (CC BY 4.0)' };
test('Openverse requests direct original files with conservative reusable licenses; rejects incompatible and incomplete results', async () => {
  let requested;
  const assets = await searchOpenverse('emperor penguin', 'image', { requestJSON: async (url) => { requested = url; return { results: [openImage, { ...openImage, id: 'nc', license: 'by-nc' }, { ...openImage, id: 'bad', url: 'javascript:alert(1)' }, { ...openImage, id: 'license', license_url: 'https://example.org/by' }, { ...openImage, id: 'missing', creator: '' }] }; } });
  assert.equal(requested.searchParams.get('license'), 'by,cc0,pdm'); assert.equal(assets.length, 1);
  assert.equal(assets[0].url, openImage.url); assert.equal(assets[0].sourceUrl, openImage.foreign_landing_url);
  assert.equal(assets[0].rights.attributionRequired, true); assert.equal(assets[0].license, 'CC BY 4.0');
  const audio = await searchOpenverse('ambient', 'audio', { requestJSON: async () => ({ results: [{ ...openImage, id: 'audio', duration: 120500, filetype: 'mp3', url: 'https://media.example.org/music.mp3' }] }) });
  assert.equal(audio[0].duration, 120.5); assert.equal(audio[0].kind, 'audio');
  assert.deepEqual(await searchOpenverse('bird', 'video'), []);
});

test('Cleveland accepts only individual CC0 image records and API-published bounded JPEGs', async () => {
  const item = { id: 1, title: 'Bird study', share_license_status: 'CC0', url: 'https://clevelandart.org/art/1', creators: [{ description: 'Artist' }], images: { print: { url: 'https://openaccess-cdn.clevelandart.org/1/1_print.jpg', width: '2400', height: '1800', filesize: '20000' }, full: { url: 'https://openaccess-cdn.clevelandart.org/1/1_full.tif', width: '9000', height: '6000', filesize: '120000000' } } };
  const assets = await searchCleveland('bird', 'image', { requestJSON: async (url) => { assert.equal(url.searchParams.get('cc0'), '1'); return { data: [item, { ...item, id: 2, share_license_status: 'Copyrighted' }, { ...item, id: 3, url: 'https://example.org/art/3' }] }; } });
  assert.equal(assets.length, 1); assert.equal(assets[0].width, 2400); assert.equal(assets[0].url, item.images.print.url);
  assert.equal(assets[0].license, 'CC0 1.0'); assert.equal(assets[0].author, 'Artist');
});

test('Scott Buckley catalog rechecks exact official MP3 and per-track license; never scrapes remixes or invents paths', async () => {
  const html = `<p>This work is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p><a href="${SCOTT_BUCKLEY_TRACKS[0].url}">MP3</a><pre>'Undertow' by Scott Buckley - released under CC-BY 4.0.</pre>`;
  const tracks = await searchScottBuckley('reflective', { requestText: async (url) => { assert.equal(url, 'https://www.scottbuckley.com.au/library/undertow/'); return html; } });
  assert.equal(tracks.length, 1); assert.equal(tracks[0].license, 'CC BY 4.0'); assert.equal(tracks[0].rights.youtubeDescriptionCredit, true);
  await assert.rejects(searchScottBuckley('reflective', { requestText: async () => html.replace("'Undertow' by Scott Buckley", "'Other track' by Other author") }), /已变化/);
  await assert.rejects(searchScottBuckley('reflective', { requestText: async () => '<a href="https://other.example.org/preview.mp3">MP3</a>' }), /已变化/);
  assert.deepEqual(await searchScottBuckley('unrelated-nonmatching-query', { requestText: () => { throw new Error('should not fetch'); } }), []);
});
