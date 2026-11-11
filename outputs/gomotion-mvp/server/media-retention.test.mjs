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
