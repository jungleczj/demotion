import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceProvenanceError, assertSourceFiles } from './source-provenance.mjs';

const sha = (data) => createHash('sha256').update(data).digest('hex');
function receipt(folder = '/tmp/fixture', original = Buffer.from('original fixture'), decoded = Buffer.from('decoded fixture')) {
  const annotation = (label, region) => ({ sourceAssetId: 'commons:fixture-photo', label, quote: label, region, observed: `visible ${label}` });
  const annotations = [annotation('企鹅', [.1, .1, .3, .3]), annotation('蛋', [.5, .5, .2, .2])];
  const source = { id: 'commons:fixture-photo', provider: 'commons', sourceId: 'fixture-photo', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fixture.jpg', author: 'Fixture author', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', localPath: path.join(folder, 'original'), decodedPath: path.join(folder, 'decoded'), sha256: sha(original), decodedSha256: sha(decoded), width: 1280, height: 900,
    contentReview: { actualRead: true, inputSha256: sha(original), reviewedImageSha256: sha(decoded), matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'fixture evidence only; not a live visual review', annotations } };
  const processingPlan = { kind: 'source-annotation', operations: ['source-image', 'evidence-highlight', 'label-reveal'], preserveMarks: true, noInventedMotion: true };
  const plan = { schemaVersion: 2, sceneId: 'scene-fixture', narration: '企鹅保护蛋。', title: '企鹅', explanation: 'Fixture source observations only.', type: 'source-annotation', sourceAssets: [source], annotations, processingPlan };
  const asset = { id: 'upload:processed', kind: 'video', renderKind: 'motion-graphic', generated: true, sourceAssets: structuredClone(plan.sourceAssets), processingPlan: structuredClone(processingPlan) };
  return { id: 'scene-fixture', text: '企鹅保护蛋。', selected: asset, motionGraphic: plan };
}

test('ordinary footage needs no generated-image receipt, while legacy diagrams do', () => {
  assert.equal(sourceProvenanceError({ text: 'ordinary footage', selected: { kind: 'video' } }), null);
  assert.match(sourceProvenanceError({ text: '企鹅', selected: { generated: true } }), /来源记录/);
  assert.match(sourceProvenanceError({ text: '企鹅', motionGraphic: { schemaVersion: 1 } }), /来源记录/);
  assert.match(sourceProvenanceError({ text: '企鹅', renderKind: 'motion-graphic', selected: { kind: 'video' } }), /来源记录/);
});

test('a complete matching source-image receipt is accepted', () => {
  assert.equal(sourceProvenanceError(receipt()), null);
});

test('a valid source-image plan cannot be attached to a different narration scene', () => {
  const scene = receipt(); scene.id = 'different-scene';
  assert.match(sourceProvenanceError(scene, scene.selected, '企鹅保护蛋。海浪涌向海岸。'), /当前镜头/);
  const rewritten = receipt(); rewritten.text = '海浪涌向海岸。';
  assert.match(sourceProvenanceError(rewritten, rewritten.selected, '企鹅保护蛋。海浪涌向海岸。'), /当前镜头/);
});

test('evidence quotes use the same whitespace normalization as the source-plan validator', () => {
  const scene = receipt();
  scene.motionGraphic.annotations[0].quote = '企 鹅';
  scene.selected.sourceAssets[0].contentReview.annotations[0].quote = '企 鹅';
  assert.equal(sourceProvenanceError(scene), null);
});

test('an image title cannot replace an actual visual-read receipt', () => {
  const scene = receipt(); scene.motionGraphic.sourceAssets[0].contentReview.actualRead = false;
  assert.match(sourceProvenanceError(scene), /实际图片/);
});

test('a wrong species or unsupported annotation cannot pass source provenance', () => {
  const scene = receipt(); scene.motionGraphic.sourceAssets[0].contentReview.exactSubject = false;
  assert.match(sourceProvenanceError(scene), /实际图片/);
  const unsupported = receipt(); unsupported.motionGraphic.annotations[0].quote = '企鹅会飞';
  assert.match(sourceProvenanceError(unsupported), /原文/);
});

test('output receipt cannot silently swap the recorded base image', () => {
  const scene = receipt(); scene.selected.sourceAssets[0].sha256 = '1'.repeat(64);
  assert.match(sourceProvenanceError(scene), /凭据/);
});

test('malformed processing operations return a rejection rather than throwing', () => {
  const scene = receipt(); scene.motionGraphic.processingPlan.operations = 'source-image evidence-highlight label-reveal';
  scene.selected.processingPlan = structuredClone(scene.motionGraphic.processingPlan);
  assert.match(sourceProvenanceError(scene), /加工计划/);
});

test('rendering requires the exact original and decoded files that were reviewed', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'source-integrity-'));
  const original = Buffer.from('original integrity fixture'), decoded = Buffer.from('decoded integrity fixture');
  const scene = receipt(folder, original, decoded);
  try {
    await writeFile(path.join(folder, 'original'), original); await writeFile(path.join(folder, 'decoded'), decoded);
    await assertSourceFiles(scene);
    await writeFile(path.join(folder, 'decoded'), 'modified after review');
    await assert.rejects(assertSourceFiles(scene), /已审核文件不一致/);
    await rm(path.join(folder, 'decoded'));
    await assert.rejects(assertSourceFiles(scene), /文件已失效/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('submitted content review cannot replace the registered source observation', () => {
  const scene = receipt();
  scene.motionGraphic.sourceAssets[0].contentReview.observed = 'A different claimed observation only in the submitted plan.';
  assert.match(sourceProvenanceError(scene), /审查凭据|审核凭据|已注册/);
  assert.equal(scene.selected.sourceAssets[0].contentReview.observed, 'fixture evidence only; not a live visual review');
});

test('source gate enforces the strict plan rules for distinct evidence annotations', () => {
  const scene = receipt();
  scene.motionGraphic.annotations = [structuredClone(scene.motionGraphic.annotations[0]), structuredClone(scene.motionGraphic.annotations[0])];
  assert.match(sourceProvenanceError(scene), /两个不同|标注/);
});
