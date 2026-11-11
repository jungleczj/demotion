import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assets } from './sources.mjs';
import { renderProject } from './render.mjs';
import { reviewExport } from './visual-review.mjs';

test('export rejects legacy diagrams before requesting voice or processing media', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'source-export-gate-'));
  const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('network must not be used by this local gate test'); };
  try {
    const job = { id: 'fixture-export', controller: new AbortController(), events: [] };
    await renderProject(job, { id: 'fixture-project', script: '企鹅保护它们的蛋。', voice: 'gemini:Kore', language: 'zh-CN', format: 'landscape', scenes: [{ id: 'scene', text: '企鹅保护它们的蛋。', duration: 3, motionGraphic: { schemaVersion: 1 }, selected: { id: 'legacy', kind: 'video', generated: true } }] }, folder, {});
    assert.equal(job.status, 'error');
    assert.match(job.error, /真实素材来源记录/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; await rm(folder, { recursive: true, force: true }); }
});

test('final audiovisual review cannot approve an old arbitrary diagram manifest', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'source-review-gate-'));
  try {
    const exportId = 'fixture-export'; await mkdir(path.join(folder, exportId));
    await writeFile(path.join(folder, exportId, 'sources.json'), JSON.stringify({ duration: 3, scenes: [{ text: '企鹅保护蛋。', start: 0, end: 3, voice: 'gemini:Kore', renderKind: 'motion-graphic', motionGraphic: { schemaVersion: 1 }, source: { id: 'legacy', kind: 'video' } }] }));
    const job = { id: 'fixture-review', controller: new AbortController(), events: [] };
    await reviewExport(job, exportId, folder, { visionProvider: 'gemini' });
    assert.equal(job.status, 'error'); assert.equal(job.review, undefined);
    assert.match(job.error, /真实素材来源记录/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('export compares submitted observations with the registered canonical asset before voice requests', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'source-canonical-export-'));
  const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('network is forbidden in this local export gate test'); };
  const assetId = 'upload:canonical-export-fixture';
  try {
    const bytes = Buffer.from('local source integrity fixture only'), digest = createHash('sha256').update(bytes).digest('hex');
    const original = path.join(folder, 'original'), decoded = path.join(folder, 'decoded');
    await writeFile(original, bytes); await writeFile(decoded, bytes);
    const annotation = (label, region) => ({ sourceAssetId: 'commons:canonical-fixture', label, quote: label, region, observed: `visible ${label}` });
    const review = { actualRead: true, inputSha256: digest, reviewedImageSha256: digest, matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'Canonical penguin and egg observation.', annotations: [annotation('企鹅', [.1, .1, .2, .2]), annotation('蛋', [.5, .5, .2, .2])] };
    const source = { id: 'commons:canonical-fixture', provider: 'commons', sourceId: 'canonical-fixture', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Canonical.jpg', author: 'Local fixture author', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', localPath: original, decodedPath: decoded, sha256: digest, decodedSha256: digest, width: 1280, height: 900, contentReview: review };
    const processingPlan = { kind: 'source-annotation', operations: ['source-image', 'evidence-highlight', 'label-reveal'], preserveMarks: true, noInventedMotion: true };
    const canonical = { id: assetId, kind: 'video', generated: true, renderKind: 'motion-graphic', width: 1280, height: 720, sourceAssets: [structuredClone(source)], processingPlan: structuredClone(processingPlan) };
    assets.set(assetId, canonical);
    const annotations = [annotation('火星', [.1, .1, .2, .2]), annotation('陨石', [.5, .5, .2, .2])];
    const submitted = { ...source, contentReview: { ...review, observed: 'Rewritten Mars observation in submitted plan only.', annotations } };
    const text = '火星表面有陨石。';
    const scene = { id: 'scene-canonical', text, duration: 3, confirmed: true, selected: { id: assetId }, motionGraphic: { schemaVersion: 2, sceneId: 'scene-canonical', narration: text, type: 'source-annotation', title: '火星', explanation: 'Submitted source annotations.', sourceAssets: [submitted], annotations, processingPlan } };
    const job = { id: 'canonical-export', controller: new AbortController(), events: [] };
    await renderProject(job, { id: 'canonical-project', script: text, voice: 'gemini:Kore', format: 'landscape', scenes: [scene] }, folder, {});
    assert.equal(job.status, 'error');
    assert.match(job.error, /审查凭据|审核凭据|已注册/);
    assert.equal(requests, 0);
    assert.equal(canonical.sourceAssets[0].contentReview.observed, 'Canonical penguin and egg observation.');
  } finally { assets.delete(assetId); globalThis.fetch = originalFetch; await rm(folder, { recursive: true, force: true }); }
});
