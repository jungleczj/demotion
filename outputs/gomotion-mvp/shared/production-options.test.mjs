import test from 'node:test';
import assert from 'node:assert/strict';
import { productionOptions, BACKGROUNDS } from './production-options.mjs';

test('legacy drafts get consistent creation defaults and all five backgrounds survive', () => {
  assert.deepEqual(productionOptions(), { background: 'blue', motionGraphics: true, musicOptions: { enabled: true, genre: 'auto', volume: 3 } });
  for (const background of BACKGROUNDS) assert.equal(productionOptions({ background }).background, background);
  const chosen = { background: 'grid', motionGraphics: false, musicOptions: { enabled: false, genre: 'epic', trackId: 'scottbuckley:legionnaire', volume: 8 } };
  assert.deepEqual(productionOptions(chosen), chosen);
});

test('creation choices cannot carry paths, URLs or browser asserted music rights', () => {
  const result = productionOptions({ background: '../hidden', musicOptions: { volume: Infinity, genre: 'invented', trackId: 'https://host/track', upload: { id: 'valid-id', name: 'music.mp3', sha256: 'a'.repeat(64), localPath: '/private/key', url: 'https://private', rights: { licensed: true } } } });
  assert.equal(result.background, 'blue'); assert.equal(result.musicOptions.genre, 'auto');
  assert.equal(result.musicOptions.volume, 3); assert.equal(result.musicOptions.trackId, undefined);
  assert.deepEqual(result.musicOptions.upload, { id: 'valid-id', name: 'music.mp3', sha256: 'a'.repeat(64) });
  assert.equal(productionOptions({ musicOptions: { upload: { id: '../secret' }, volume: -20 } }).musicOptions.upload, undefined);
  assert.equal(productionOptions({ musicOptions: { volume: -20 } }).musicOptions.volume, 0);
  assert.equal(productionOptions({ musicOptions: { volume: 101 } }).musicOptions.volume, 100);
});
