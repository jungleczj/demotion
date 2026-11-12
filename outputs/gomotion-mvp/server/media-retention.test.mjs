import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { retainTaskMedia, retainedMedia } from './media-retention.mjs';

test('removing a saved task releases its files without touching other workspaces or escaping the data root', () => {
  const root = path.join(os.tmpdir(), `media-retention-${randomUUID()}`), id = randomUUID(), otherRoot = root + '-other';
  retainTaskMedia(root, [{ exportId: id, project: { scenes: [{ selected: { localPath: path.join(root, '../outside/file') } }] } }]);
  retainTaskMedia(otherRoot, [{ exportId: id, project: {} }]);
  assert.equal(retainedMedia(path.join(root, id, 'video.mp4')), true);
  assert.equal(retainedMedia(path.join(root, '../outside/file')), false);
  retainTaskMedia(root, []);
  assert.equal(retainedMedia(path.join(root, id, 'video.mp4')), false);
  assert.equal(retainedMedia(path.join(otherRoot, id, 'video.mp4')), true);
  retainTaskMedia(otherRoot, []);
});

test('references include registered upload sources and their ancestors but not an unrelated sibling', () => {
  const root = path.join(os.tmpdir(), `media-retention-${randomUUID()}`), file = path.join(root, 'source-images/base.source');
  const registry = new Map([['upload:fixture', { localPath: file, sourceAssets: [null, { decodedPath: path.join(root, 'source-images/decoded.png') }] }]]);
  retainTaskMedia(root, [{ project: { scenes: [{ selected: { id: 'upload:fixture' }, motionGraphic: { sourceAssets: 'invalid' } }] } }], registry);
  assert.equal(retainedMedia(file), true);
  assert.equal(retainedMedia(path.dirname(file), true), true);
  assert.equal(retainedMedia(path.join(root, 'unrelated/file')), false);
  retainTaskMedia(root, []);
});

test('saved task playback cache keys and aliases retain their corresponding video and thumbnail files', () => {
  const root = path.join(os.tmpdir(), `media-retention-${randomUUID()}`), key = 'a'.repeat(64), alias = 'b'.repeat(64);
  retainTaskMedia(root, [{ project: { scenes: [{ selected: { playbackKey: key, playbackAliases: [alias, '../invalid'] } }] } }]);
  for (const kept of [key, alias]) for (const extension of ['mp4', 'jpg']) assert.equal(retainedMedia(path.join(root, 'playback', `${kept}.${extension}`)), true);
  assert.equal(retainedMedia(path.join(root, 'playback', `${'c'.repeat(64)}.mp4`)), false);
  retainTaskMedia(root, []);
  assert.equal(retainedMedia(path.join(root, 'playback', `${key}.mp4`)), false);
});

test('mixed music retains its original and license receipt until the saved task is removed', () => {
  const root = path.join(os.tmpdir(), `music-retention-${randomUUID()}`), original = path.join(root, 'music-sources', `${'e'.repeat(64)}.audio`);
  retainTaskMedia(root, [{ project: { music: { mixed: true, source: { localPath: original } } } }]);
  assert.equal(retainedMedia(original), true);
  assert.equal(retainedMedia(`${original}.json`), true);
  assert.equal(retainedMedia(`${original}.part`), false);
  retainTaskMedia(root, []);
  assert.equal(retainedMedia(original), false);
});

test('saved partial narration keeps only its own chunk directory and complete track receipt until removal', () => {
  const root = path.join(os.tmpdir(), `narration-retention-${randomUUID()}`), key = 'f'.repeat(64), chunk = 'a'.repeat(64);
  retainTaskMedia(root, [{ project: { scenes: [], narrationWork: { version: 1, key }, narrationTrack: { key } } }]);
  assert.equal(retainedMedia(path.join(root, 'narration', 'chunks', key, `${chunk}.wav`)), true);
  assert.equal(retainedMedia(path.join(root, 'narration', `${key}.json`)), true);
  assert.equal(retainedMedia(path.join(root, 'narration', 'chunks', 'b'.repeat(64), `${chunk}.wav`)), false);
  retainTaskMedia(root, []);
  assert.equal(retainedMedia(path.join(root, 'narration', 'chunks', key, `${chunk}.wav`)), false);
  retainTaskMedia(root, [{ project: { narrationWork: { version: 1, key: '../outside' } } }]);
  assert.equal(retainedMedia(path.join(root, 'outside')), false);
  retainTaskMedia(root, []);
});
