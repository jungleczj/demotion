import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run, probe } from './process.mjs';

const module = await import('./source-images.mjs').catch(() => ({}));
const scene = { id: 's1', query: 'blue red test pattern', text: '测试图上方是蓝色，下方是红色。' };
const source = (localPath) => ({ id: 'fixture:pattern', provider: 'fixture', sourceId: 'pattern', sourceUrl: 'https://example.test/pattern', author: 'Local test fixture', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', localPath, width: 9000, height: 9000, kind: 'image' });
const review = { matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'Test fixture has a blue upper region and a red lower region.', limitations: ['Synthetic fixture only; no production subject claim.'], title: '测试图', annotations: [{ label: '上方是蓝色', quote: '测试图上方是蓝色', region: [.1, .1, .2, .2], observed: 'Blue upper region is visible.' }, { label: '下方是红色', quote: '下方是红色', region: [.1, .7, .2, .2], observed: 'Red lower region is visible.' }] };
async function fixture(folder, size = '1600x1200') {
  const file = path.join(folder, `input-${size}.png`);
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=blue:s=${size},drawbox=x=0:y=ih/2:w=iw:h=ih/2:color=red:t=fill`, '-frames:v', '1', file]);
  return file;
}

// A fake metadata dimension must never promote a small/corrupt image to HD.
test('acquires the actual file and derives dimensions and checksum from full decoding', async () => {
  assert.equal(typeof module.acquireSourceImage, 'function', 'source image acquisition is missing');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'source-image-acquire-'));
  try {
    const input = await fixture(folder);
    const acquired = await module.acquireSourceImage(source(input), path.join(folder, 'acquired'));
    assert.equal(acquired.width, 1600); assert.equal(acquired.height, 1200);
    assert.notEqual(acquired.localPath, input);
    assert.equal(acquired.sha256, createHash('sha256').update(await readFile(input)).digest('hex'));
    assert.equal((await stat(acquired.decodedPath)).size > 0, true);
    const bad = path.join(folder, 'bad.png'); await writeFile(bad, 'not image data');
    await assert.rejects(module.acquireSourceImage(source(bad), path.join(folder, 'bad')), /图片|解码|image/i);
    await assert.rejects(module.acquireSourceImage({ ...source(input), license: '授权待确认', licenseUrl: '' }, path.join(folder, 'unknown')), /许可|授权/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('large source images retain the original file while bounding full-frame review pixels', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'source-image-size-'));
  try {
    const input = await fixture(folder, '3200x1800');
    const acquired = await module.acquireSourceImage(source(input), path.join(folder, 'acquired'));
    assert.deepEqual([acquired.width, acquired.height], [1600, 900]);
    const original = await probe(acquired.localPath);
    assert.deepEqual([original.width, original.height], [3200, 1800]);
    assert.equal(acquired.sha256, createHash('sha256').update(await readFile(input)).digest('hex'));
    assert.deepEqual(acquired.decoding, { sourceWidth: 3200, sourceHeight: 1800, width: 1600, height: 900, fullFrame: true, scaleDownOnly: true });
    let supplied;
    await module.inspectSourceImage(acquired, scene, scene.text, {}, { controller: new AbortController(), events: [] }, async (_config, _prompt, parts) => { supplied = parts; return review; });
    assert.ok(Buffer.byteLength(JSON.stringify(supplied)) < 20 * 1024 * 1024);
    assert.deepEqual(Buffer.from(supplied.find((p) => p.mime === 'image/png').data, 'base64'), await readFile(acquired.decodedPath));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

// If the reviewer is fed only a title, this checks the actual payload is the decoded source pixels.
test('content inspection sends real acquired image bytes and binds the decision to those bytes', async () => {
  assert.equal(typeof module.inspectSourceImage, 'function', 'actual image inspection is missing');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'source-image-review-'));
  try {
    const input = await fixture(folder), acquired = await module.acquireSourceImage(source(input), path.join(folder, 'acquired'));
    const job = { controller: new AbortController(), events: [] };
    const result = await module.inspectSourceImage(acquired, scene, scene.text, {}, job, async (_config, _prompt, parts) => {
      const pixelInput = parts.find((p) => p.mime === 'image/png');
      assert.ok(pixelInput, 'review must include actual image');
      assert.deepEqual(Buffer.from(pixelInput.data, 'base64'), await readFile(acquired.decodedPath));
      return review;
    });
    assert.equal(result.contentReview.actualRead, true);
    assert.equal(result.contentReview.inputSha256, acquired.sha256);
    assert.equal(result.contentReview.reviewedImageSha256, acquired.decodedSha256);
    assert.equal(result.contentReview.annotations[0].sourceAssetId, acquired.id);
    await assert.rejects(module.inspectSourceImage(acquired, scene, scene.text, {}, job, async () => ({ ...review, exactSubject: false })), /主体|物种|内容|匹配/);
    await assert.rejects(module.inspectSourceImage(acquired, scene, scene.text, {}, job, async () => ({ ...review, annotations: [{ ...review.annotations[0], label: '游动' }, review.annotations[1]] })), /原文|标注|依据/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

// A missing image route must preserve the gap, with bounded work rather than a freehand fallback.
test('image search is bounded, rejects wrong subjects, and never creates assets when sources fail', async () => {
  assert.equal(typeof module.findSourceImagePlan, 'function', 'source-driven fallback is missing');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'source-image-search-'));
  try {
    const input = await fixture(folder), job = { controller: new AbortController(), events: [] };
    const result = await module.findSourceImagePlan(scene, { script: scene.text, format: 'landscape' }, path.join(folder, 'candidates'), {}, job, { providers: ['commons'], search: async (query, providers, config, kind) => {
      assert.equal(query, scene.query); assert.equal(kind, 'image'); assert.deepEqual(providers, ['commons']);
      return { assets: Array.from({ length: 12 }, (_, i) => ({ ...source(input), id: `fixture:${i}`, sourceId: String(i) })), warnings: [] };
    }, review: async () => ({ ...review, exactSubject: false }) });
    assert.equal(result.plan, null);
    assert.equal(result.attempted, 4);
    assert.ok(result.warnings.length >= 4);
    const abandoned = await readdir(path.join(folder, 'candidates'), { recursive: true });
    assert.equal(abandoned.filter((name) => /\.(source|png|download)$/.test(name)).length, 0, 'rejected images must not accumulate');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

// Equal source hashes in different scenes must not make rejection/cancellation delete an already selected image.
test('candidate cleanup isolates scenes and removes cancelled image reads', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'source-image-cleanup-'));
  try {
    const input = await fixture(folder), directory = path.join(folder, 'candidates');
    const project = { script: scene.text, format: 'landscape' };
    const search = async () => ({ assets: [source(input)], warnings: [] });
    const accepted = await module.findSourceImagePlan(scene, project, directory, {}, { controller: new AbortController(), events: [] }, { providers: ['commons'], search, review: async () => review });
    assert.ok(accepted.plan);
    const original = accepted.plan.sourceAssets[0];
    const rejected = await module.findSourceImagePlan({ ...scene, id: 's2' }, project, directory, {}, { controller: new AbortController(), events: [] }, { providers: ['commons'], search, review: async () => ({ ...review, matched: false }) });
    assert.equal(rejected.plan, null);
    assert.equal(createHash('sha256').update(await readFile(original.localPath)).digest('hex'), original.sha256);
    const controller = new AbortController();
    await assert.rejects(module.findSourceImagePlan({ ...scene, id: 's3' }, project, directory, {}, { controller, events: [] }, { providers: ['commons'], search, review: async () => { controller.abort(new Error('cancel image')); throw controller.signal.reason; } }), /cancel image/);
    const retained = (await readdir(directory, { recursive: true })).filter((name) => /\.(source|png|download)$/.test(name));
    assert.equal(retained.length, 2, 'only the selected source and its decoded pixels remain');
    assert.equal(createHash('sha256').update(await readFile(original.decodedPath)).digest('hex'), original.decodedSha256);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
