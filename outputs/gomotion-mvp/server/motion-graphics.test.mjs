import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { validateMotionPlan, motionSVG } from './motion-graphics-template.mjs';
import { renderMotionGraphic, fillMissingWithMotion } from './motion-graphics.mjs';
import * as motion from './motion-graphics.mjs';
import { run } from './process.mjs';
import { sourceProvenanceError, assertSourceFiles } from './source-provenance.mjs';

const scene = { id: 'scene-1', text: '测试图上方是蓝色，下方是红色。', duration: 1.2 };
const style = { background: '#142b3b', accent: '#72c6de', text: '#f3f7fa', muted: '#b1c5ce' };
const annotations = [
  { sourceAssetId: 'fixture:colors', label: '上方是蓝色', quote: '测试图上方是蓝色', region: [.1, .1, .2, .2], observed: 'Blue upper region is visible in the supplied test image.' },
  { sourceAssetId: 'fixture:colors', label: '下方是红色', quote: '下方是红色', region: [.1, .7, .2, .2], observed: 'Red lower region is visible in the supplied test image.' },
];
function source(overrides = {}) {
  const digest = 'a'.repeat(64);
  return { id: 'fixture:colors', provider: 'fixture', sourceId: 'colors', sourceUrl: 'https://example.test/colors', author: 'Local test fixture', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', localPath: '/tmp/fixture.png', decodedPath: '/tmp/fixture.png', sha256: digest, decodedSha256: digest, width: 1600, height: 1200,
    contentReview: { actualRead: true, inputSha256: digest, reviewedImageSha256: digest, matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'Blue and red test pattern.', annotations }, ...overrides };
}
function raw(asset = source()) { return { schemaVersion: 2, sceneId: scene.id, type: 'source-annotation', title: '测试图', explanation: '标注来源图片实际可见的上下区域。', sourceAssets: [asset], annotations }; }

// Removing the provenance/actual-reading gate would let the old arbitrary icon route pass.
test('rejects legacy freehand plans and sources that were not actually read', () => {
  assert.throws(() => validateMotionPlan({ sceneId: scene.id, type: 'mechanism', title: '自画', explanation: '图标', nodes: [{ label: '蓝色', quote: scene.text, icon: 'penguin' }, { label: '红色', quote: scene.text, icon: 'egg' }] }, scene, scene.text), /来源|source/i);
  assert.throws(() => validateMotionPlan(raw(source({ contentReview: { matched: true } })), scene, scene.text), /读取|审查|read/i);
  assert.throws(() => validateMotionPlan(raw(source({ sourceUrl: '' })), scene, scene.text), /来源|source/i);
  assert.throws(() => validateMotionPlan(raw(source({ contentReview: { ...source().contentReview, inputSha256: 'b'.repeat(64) } })), scene, scene.text), /读取|哈希|hash/i);
});

// Letting the model move subjects or add labels would create information absent from the acquired image.
test('only permits source-supported regions and exact narration annotations', () => {
  const plan = validateMotionPlan(raw(), scene, scene.text);
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(plan.processingPlan.operations, ['source-image', 'evidence-highlight', 'label-reveal']);
  assert.throws(() => validateMotionPlan({ ...raw(), annotations: [{ ...annotations[0], label: '下降99%' }, annotations[1]] }, scene, scene.text), /原文|依据|标注/);
  assert.throws(() => validateMotionPlan({ ...raw(), annotations: [{ ...annotations[0], region: [.9, .9, .5, .5] }, annotations[1]] }, scene, scene.text), /区域|region|审查/);
  assert.throws(() => validateMotionPlan({ ...raw(), mechanism: 'penguin-egg' }, scene, scene.text), /动作|创造|机制|任意/);
  assert.throws(() => validateMotionPlan({ ...raw(), annotations: [annotations[0]] }, scene, scene.text), /2|两个/);
});

test('source remains fixed while grounded region highlights and labels animate', () => {
  const plan = validateMotionPlan(raw(), scene, scene.text);
  const images = new Map([['fixture:colors', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YVEAAAAASUVORK5CYII=']]);
  const early = motionSVG(plan, style, .1, { width: 1280, height: 720 }, '示意', undefined, images);
  const late = motionSVG(plan, style, .8, { width: 1280, height: 720 }, '示意', undefined, images);
  assert.equal(early.match(/<image[^>]+>/)[0], late.match(/<image[^>]+>/)[0], 'the original image is not panned, cropped or fabricated');
  assert.notEqual(early, late);
  assert.match(early, /data:image\/png;base64/);
  const a = new Resvg(early).render(), b = new Resvg(late).render();
  assert.equal(a.width, 1280); assert.equal(a.height, 720); assert.ok(!a.pixels.equals(b.pixels));
});

async function localPlan(folder) {
  const input = path.join(folder, 'source.png');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1600x1200,drawbox=x=0:y=600:w=1600:h=600:color=red:t=fill', '-frames:v', '1', input]);
  const digest = createHash('sha256').update(await readFile(input)).digest('hex');
  const s = source({ localPath: input, decodedPath: input, sha256: digest, decodedSha256: digest, contentReview: { ...source().contentReview, inputSha256: digest, reviewedImageSha256: digest } });
  return validateMotionPlan(raw(s), scene, scene.text);
}

test('worker decodes acquired source and renders HD annotation layers in both orientations', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-source-'));
  try {
    const plan = await localPlan(folder);
    for (const format of ['landscape', 'portrait']) {
      const file = path.join(folder, `${format}.mp4`);
      const result = await renderMotionGraphic({ file, plan, style, duration: 1.2, format, signal: new AbortController().signal });
      assert.equal(result.width, format === 'portrait' ? 720 : 1280); assert.equal(result.height, format === 'portrait' ? 1280 : 720);
      assert.ok(Math.abs(result.duration - 1.2) < .04);
      await run('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
    }
    assert.ok((await readdir(folder)).every((file) => !file.includes('partial')));
    await writeFile(plan.sourceAssets[0].localPath, 'changed source');
    await assert.rejects(renderMotionGraphic({ file: path.join(folder, 'landscape.mp4'), plan, style, duration: 1.2, format: 'landscape' }), /文件|哈希|hash|来源/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('cancelled source animations leave no partial video or worker behind', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-source-cancel-')), controller = new AbortController();
  try {
    const plan = await localPlan(folder);
    const rendering = renderMotionGraphic({ file: path.join(folder, 'cancel.mp4'), plan, style, duration: 120, format: 'landscape', signal: controller.signal });
    const timer = setTimeout(() => controller.abort(new Error('test cancel')), 200);
    await assert.rejects(rendering, /test cancel|已取消/); clearTimeout(timer);
    assert.deepEqual((await readdir(folder)).filter((name) => name.includes('mp4')), []);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

// A saved v2 stamp must not preserve a source that was altered after its actual inspection.
test('fallback revalidates saved source files and keeps unfilled scenes incomplete', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-saved-source-'));
  try {
    const plan = await localPlan(folder);
    const selected = { id: 'upload:old', width: 1280, height: 720, kind: 'video', renderKind: 'motion-graphic', sourceAssets: plan.sourceAssets, processingPlan: plan.processingPlan };
    await writeFile(plan.sourceAssets[0].localPath, 'source changed after review');
    const project = { id: 'saved-source', format: 'landscape', script: scene.text, motionStyle: style, scenes: [{ ...scene, selected, motionGraphic: plan, renderKind: 'motion-graphic' }], sequenceReport: { complete: true } };
    const result = await fillMissingWithMotion({ controller: new AbortController(), events: [] }, project, folder, {}, { providers: [] });
    assert.equal(result.scenes[0].selected, null);
    assert.equal(result.sequenceReport.complete, false);
    assert.deepEqual(result.sequenceReport.missingScenes, ['scene-1']);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

// A successful source image is usable through the real playback pipeline and retains all provenance;
// failure in another scene may not make an incomplete project claim complete.
test('source-backed fallback retains successful files and provenance while another gap remains', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-source-integration-'));
  try {
    const plan = await localPlan(folder), input = plan.sourceAssets[0].localPath;
    const current = { ...scene, duration: 2.4, query: 'blue red test pattern' };
    const unresolved = { id: 'scene-2', text: '图中没有树木。', duration: 2.4, query: 'unavailable trees' };
    const project = { id: 'source-integration', format: 'landscape', language: 'zh-CN', script: current.text + unresolved.text, motionStyle: style, scenes: [current, unresolved], sequenceReport: { complete: false, retries: 3 } };
    const job = { controller: new AbortController(), events: [], calls: 36, callLimit: 36 };
    const result = await fillMissingWithMotion(job, project, folder, {}, { providers: ['commons'], search: async (query) => ({ assets: query === 'unavailable trees' ? [] : [{ ...source({ localPath: input }), kind: 'image' }], warnings: [] }), review: async (_config, _prompt, _parts, phaseJob) => { phaseJob.calls = (phaseJob.calls || 0) + 1; if (phaseJob.calls > phaseJob.callLimit) throw new Error('本轮自动处理已达到上限'); return { matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'The supplied local fixture visibly has blue above red.', title: '测试图', annotations }; } });
    assert.equal(result.sequenceReport.complete, false);
    assert.equal(job.calls, 37, 'phase calls remain part of cumulative usage');
    assert.equal(job.phaseBudgets.sourceImages.calls, 1);
    assert.deepEqual(result.sequenceReport.missingScenes, ['scene-2']);
    const accepted = result.scenes[0];
    assert.equal(accepted.motionGraphic.schemaVersion, 2);
    assert.equal(accepted.selected.playbackChecked, true);
    assert.deepEqual(accepted.selected.sourceAssets, accepted.motionGraphic.sourceAssets);
    assert.deepEqual(accepted.selected.processingPlan, accepted.motionGraphic.processingPlan);
    assert.equal(sourceProvenanceError(accepted, accepted.selected, project.script), null);
    await assertSourceFiles(accepted, accepted.selected, project.script, job.controller.signal);
    assert.equal(accepted.selected.license, 'CC0');
    assert.equal(accepted.selected.author, 'Local test fixture');
    assert.equal(accepted.selected.sourceAssets[0].contentReview.actualRead, true);
    assert.ok(await readFile(accepted.selected.localPath));
    await run('ffmpeg', ['-v', 'error', '-xerror', '-i', accepted.selected.localPath, '-f', 'null', '-']);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('four independent missing scenes can search images together without serial waiting', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-source-concurrency-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  try {
    const scenes = Array.from({ length: 5 }, (_, i) => ({ ...scene, id: `concurrent-${i}` }));
    const project = { id: 'concurrent', format: 'landscape', script: scenes.map((s) => s.text).join(''), scenes, motionStyle: style };
    const operation = fillMissingWithMotion({ controller: new AbortController(), events: [] }, project, folder, {}, { providers: ['commons'], planQueries: async () => ({ scenes: scenes.map((item) => ({ sceneId: item.id, subject: { text: '测试图', quote: item.text, aliases: ['test pattern'] }, queries: [{ subjectAlias: 'test pattern', detail: 'blue', quote: item.text }, { subjectAlias: 'test pattern', detail: 'red', quote: item.text }] })) }), search: async (query) => { started.push(query); await gate; return { assets: [], warnings: [] }; } });
    for (let i = 0; i < 20 && !started.length; i++) await new Promise(setImmediate);
    const simultaneous = started.length;
    release();
    const result = await operation;
    assert.equal(simultaneous, 4);
    assert.equal(started.length, 15, 'detailed and entity-only queries share the same global four catalog slots');
    assert.equal(result.sequenceReport.complete, false);
    assert.equal(result.sequenceReport.missingScenes.length, 5);
  } finally { release(); await rm(folder, { recursive: true, force: true }); }
});

test('missing-scene batch shares one grounded query plan and records its allowance separately from image reads', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-query-batch-'));
  try {
    const scenes = [{ id: 'intro', text: '帝企鹅生活在南极。', duration: 2, query: 'penguin ice' }, { id: 'egg', text: '它们将蛋放在双脚上，', duration: 2, query: 'penguin feet snow' }];
    const project = { id: 'query-batch', format: 'landscape', script: scenes.map((item) => item.text).join(''), scenes, motionStyle: style };
    const before = JSON.stringify(project), job = { controller: new AbortController(), events: [], calls: 36 }, queries = [];
    let planningCalls = 0;
    const result = await fillMissingWithMotion(job, project, folder, {}, {
      providers: ['commons'], planQueries: async () => { planningCalls++; return { scenes: scenes.map((item) => ({ sceneId: item.id, subject: { text: '帝企鹅', quote: scenes[0].text, aliases: ['emperor penguin'] }, queries: [{ subjectAlias: 'emperor penguin', detail: item.id === 'egg' ? 'egg feet' : 'Antarctica', quote: item.text }] })) }; },
      search: async (query) => { queries.push(query); return { assets: [], warnings: [] }; },
    });
    assert.equal(planningCalls, 1);
    assert.deepEqual(queries.sort(), ['emperor penguin', 'emperor penguin', 'emperor penguin Antarctica', 'emperor penguin egg feet']);
    assert.equal(job.calls, 37);
    assert.equal(result.sequenceReport.sourceImageQueryBudget.calls, 1);
    assert.equal(result.sequenceReport.sourceImageBudget.calls, 0);
    assert.equal(result.sequenceReport.sourceImageBudget.limit, 8);
    assert.equal(result.sequenceReport.complete, false);
    assert.equal(JSON.stringify(project), before);
    assert.deepEqual(result.scenes.map(({ id, text, duration }) => ({ id, text, duration })), scenes.map(({ id, text, duration }) => ({ id, text, duration })));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('a batch planning quota failure stops before catalogs and preserves unresolved scene evidence', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-query-quota-'));
  try {
    const project = { id: 'query-quota', format: 'landscape', script: scene.text, scenes: [scene], motionStyle: style };
    const job = { controller: new AbortController(), events: [], calls: 36 };
    let catalogs = 0, failure;
    try { await fillMissingWithMotion(job, project, folder, {}, { providers: ['commons'], planQueries: async () => { throw new Error('HTTP 429 daily quota exhausted'); }, search: async () => { catalogs++; return { assets: [], warnings: [] }; } }); } catch (error) { failure = error; }
    assert.match(failure?.message || '', /429/);
    assert.equal(catalogs, 0);
    assert.equal(job.calls, 37);
    assert.equal(job.phaseBudgets.sourceImageQueries.status, 'failed');
    assert.equal(failure.partialProject.sequenceReport.complete, false);
    assert.deepEqual(failure.partialProject.sequenceReport.missingScenes, [scene.id]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('render slots cap active workers and release queued work after a failure', async () => {
  assert.equal(typeof motion.createMotionLimiter, 'function', 'render scheduler is missing');
  const limit = motion.createMotionLimiter(2), starts = [], resolvers = [];
  const operations = [0, 1, 2, 3].map((id) => limit(async () => { starts.push(id); await new Promise((resolve) => resolvers.push(resolve)); if (id === 0) throw new Error('render failure'); return id; }));
  await new Promise(setImmediate); assert.deepEqual(starts, [0, 1]);
  resolvers.shift()(); await operations[0].catch(() => {}); await new Promise(setImmediate); assert.deepEqual(starts, [0, 1, 2]);
  resolvers.shift()(); await operations[1]; await new Promise(setImmediate); assert.deepEqual(starts, [0, 1, 2, 3]);
  for (const resolve of resolvers) resolve();
  assert.deepEqual((await Promise.allSettled(operations)).map((r) => r.status), ['rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
});

test('render rejection removes the unselected source files', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-render-failure-'));
  try {
    const plan = await localPlan(folder), input = plan.sourceAssets[0].localPath;
    const broken = { ...scene, duration: 0, query: 'test pattern' };
    const project = { id: 'render-failure', format: 'landscape', script: scene.text, motionStyle: style, scenes: [broken] };
    await assert.rejects(fillMissingWithMotion({ controller: new AbortController(), events: [] }, project, folder, {}, { providers: ['commons'], search: async () => ({ assets: [{ ...source({ localPath: input }), kind: 'image' }], warnings: [] }), review: async () => ({ matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'Blue upper and red lower regions in this local fixture.', title: '测试图', annotations }) }), /时长/);
    const remaining = await readdir(path.join(folder, 'motion-render-failure', 'source-images'), { recursive: true });
    assert.equal(remaining.filter((name) => /\.(source|png|download)$/.test(name)).length, 0);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('a later service block preserves completed source scenes in a durable checkpoint', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-checkpoint-'));
  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });
  try {
    const plan = await localPlan(folder), input = plan.sourceAssets[0].localPath;
    const current = { ...scene, duration: 2.4, query: 'test pattern' }, next = { ...scene, id: 'blocked', duration: 2.4, query: 'blocked query' };
    const project = { id: 'checkpoint', format: 'landscape', script: scene.text + scene.text, motionStyle: style, scenes: [current, next] };
    const checkpoints = [];
    const job = { controller: new AbortController(), events: [], onCheckpoint: async (partial) => { checkpoints.push(partial); unblock(); } };
    let failure;
    try {
      await fillMissingWithMotion(job, project, folder, {}, { providers: ['commons'], search: async (query) => { if (query === 'blocked query') { await gate; throw new Error('视觉 AI HTTP 402 预付费额度不足'); } return { assets: [{ ...source({ localPath: input }), kind: 'image' }], warnings: [] }; }, review: async () => ({ matched: true, exactSubject: true, clear: true, watermarkFree: true, licenseUsable: true, observed: 'Blue upper and red lower regions in this local fixture.', title: '测试图', annotations }) });
    } catch (error) { failure = error; }
    assert.match(failure?.message || '', /402/);
    assert.equal(checkpoints.length, 1);
    assert.ok(checkpoints[0].scenes[0].selected);
    assert.equal(checkpoints[0].report.complete, false);
    assert.ok(failure.partialProject.scenes[0].selected);
    assert.equal(failure.partialProject.scenes[1].selected, undefined);
    await assertSourceFiles(checkpoints[0].scenes[0], checkpoints[0].scenes[0].selected, project.script);
    assert.equal(job.phaseBudgets.sourceImages.status, 'failed');
  } finally { unblock(); await rm(folder, { recursive: true, force: true }); }
});

test('malformed v2 render plans are rejected before accessing annotation arrays', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-invalid-plan-'));
  try {
    await assert.rejects(renderMotionGraphic({ file: path.join(folder, 'invalid.mp4'), plan: { schemaVersion: 2, type: 'source-annotation' }, style, duration: 1.2, format: 'landscape' }), (error) => !(error instanceof TypeError) && /来源|补片|标注/.test(error.message));
    await assert.rejects(renderMotionGraphic({ file: path.join(folder, 'invalid.mp4'), plan: { ...raw(), narration: scene.text, annotations: [null, annotations[1]] }, style, duration: 1.2, format: 'landscape' }), (error) => !(error instanceof TypeError) && /来源|补片|标注/.test(error.message));
    assert.deepEqual(await readdir(folder), []);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('worker rejects legacy or malformed source plans with a controlled validation error', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'motion-worker-invalid-'));
  try {
    for (const plan of [{ schemaVersion: 1, type: 'mechanism' }, { schemaVersion: 2, type: 'source-annotation', sourceAssets: {} }, { ...raw(), narration: scene.text, annotations: [null, annotations[1]] }]) {
      const messages = [];
      const worker = new Worker(new URL('./motion-graphics-worker.mjs', import.meta.url), { execArgv: [], workerData: { plan, style, duration: 1.2, profile: { width: 1280, height: 720, fps: 30 }, file: path.join(folder, 'invalid.mp4') } });
      const exitCode = await new Promise((resolve, reject) => { worker.on('message', (message) => messages.push(message)); worker.on('error', reject); worker.on('exit', resolve); });
      assert.equal(exitCode, 0);
      assert.equal(messages.length, 1);
      assert.match(messages[0].error, /来源|补片/);
      assert.ok(!/not iterable|TypeError|undefined/.test(messages[0].error));
    }
    assert.deepEqual(await readdir(folder), [], 'invalid plans must not start producing an encoded file');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
