import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaQualityError, outputProfile } from './media-quality.mjs';

test('requires genuine dimensions and matching source orientation', () => {
  assert.equal(mediaQualityError(1280, 720, 'landscape'), '');
  assert.equal(mediaQualityError(720, 1280, 'portrait'), '');
  assert.match(mediaQualityError(640, 360, 'landscape'), /清晰度不足/);
  assert.match(mediaQualityError(360, 640, 'portrait'), /清晰度不足/);
  assert.match(mediaQualityError(720, 1280, 'landscape'), /横屏原片/);
  assert.match(mediaQualityError(1280, 720, 'portrait'), /竖屏原片/);
  assert.match(mediaQualityError(720, 720, 'landscape'), /横屏原片/);
  assert.match(mediaQualityError(0, 0, 'portrait'), /无法核对/);
  assert.equal(mediaQualityError(0, 0, 'portrait', true), '');
});

test('both outputs use the same real HD profile and frame rate', () => {
  const landscape = outputProfile('landscape'), portrait = outputProfile('portrait');
  assert.equal(landscape.width, 1280); assert.equal(landscape.height, 720);
  assert.equal(portrait.width, 720); assert.equal(portrait.height, 1280);
  assert.equal(landscape.fps, 30); assert.equal(portrait.fps, 30);
});
