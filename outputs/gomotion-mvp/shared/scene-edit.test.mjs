import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editScene } from './scene-edit.mjs';

const diagram = { title: '孵化保护', nodes: [{ label: '双脚托蛋' }] };
const scene = { id: 'scene', text: '旁白', duration: 5, start: 0, selected: { id: 'generated:1' }, motionGraphic: diagram, renderKind: 'motion-graphic', trimEnd: 5, visualObservation: { assetId: 'generated:1' }, continuityNote: 'approved' };

test('replacing a diagram with footage clears its old diagram plan and content approval', () => {
  const next = editScene(scene, { selected: { id: 'stock:2' } });
  assert.equal(next.selected.id, 'stock:2');
  assert.equal(next.motionGraphic, undefined); assert.equal(next.renderKind, undefined);
  assert.equal(next.visualObservation, undefined); assert.equal(next.trimEnd, undefined);
  assert.equal(next.continuityNote, undefined); assert.equal(next.text, scene.text);
  assert.equal(scene.motionGraphic, diagram, 'the old checkpoint remains unchanged');
});

test('a timing adjustment keeps diagram identity but requires the content to be checked again', () => {
  const next = editScene(scene, { duration: 4 });
  assert.equal(next.motionGraphic, diagram); assert.equal(next.renderKind, 'motion-graphic');
  assert.equal(next.duration, 4); assert.equal(next.trimEnd, undefined); assert.equal(next.visualObservation, undefined);
});

test('editing only transition settings preserves verified content', () => {
  const next = editScene(scene, { transitionType: 'cut' });
  assert.equal(next.motionGraphic, diagram); assert.equal(next.visualObservation, scene.visualObservation); assert.equal(next.trimEnd, 5);
});
