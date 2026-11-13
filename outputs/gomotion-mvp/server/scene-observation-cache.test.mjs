import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { visionJSON } from './vision-client.mjs';

const observation = () => ({ observations: [{ assetId: 'fixture:wave', observed: 'Waves moving toward the beach', medium: 'live action', usable: true, hasMotion: true, hasWatermark: false, sharpnessAcceptable: true, orientationMatches: true, intervals: [{ start: 0, end: 8, reason: 'Visible moving waves' }], uncertainties: [] }] });
const parts = () => [{ text: JSON.stringify({ story: 'Waves reach the coast.', sceneId: 'one', narration: 'Waves reach the coast.', requiredDuration: 5, outputAspect: 'landscape' }) }, { text: JSON.stringify({ assetId: 'fixture:wave', kind: 'video', sourceStart: 0, analyzedUntil: 8 }) }, { mime: 'video/mp4', data: Buffer.from('offline media bytes').toString('base64') }];
const job = () => ({ controller: new AbortController(), events: [] });
const response = (value = observation(), finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }], modelVersion: 'offline-resolved-model', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } });
async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scene-observation-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { visionEnabled: true, visionKey: 'offline-test-secret', visionModel: 'offline-model', visionProvider: 'gemini', visionBase: 'https://offline.invalid', visionCacheDirectory: directory };
}

test('the exact successful media review is persisted across jobs without repeating upstream usage', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  const first = job(), second = job();
  assert.deepEqual(await visionJSON(config, 'review actual footage', parts(), first, 'visual-scene-1-1'), observation());
  assert.deepEqual(await visionJSON(config, 'review actual footage', parts(), second, 'visual-scene-1-1'), observation());
  assert.equal(requests, 1, 'an identical successful review must not be billed twice');
  assert.equal(first.calls, 1); assert.equal(second.calls || 0, 0);
  assert.equal(second.events[0].cacheHit, true);
  assert.equal(second.events[0].cacheSourceModelVersion, 'offline-resolved-model');
  assert.deepEqual(second.events[0].usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const files = await readdir(config.visionCacheDirectory); assert.equal(files.length, 1);
  const saved = await readFile(path.join(config.visionCacheDirectory, files[0]), 'utf8');
  assert.ok(!saved.includes(config.visionKey)); assert.ok(!saved.includes(parts()[2].data), 'media is not duplicated in observation storage');
});

test('truncated provider completions are never cached even when their JSON is well formed', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(observation(), requests === 1 ? 'MAX_TOKENS' : 'STOP'); });
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  assert.equal(requests, 2);
});

test('uncached requests retain the actual call limit error instead of becoming network failures', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  const current = { ...job(), calls: 1, callLimit: 1 };
  await assert.rejects(visionJSON(config, 'review', parts(), current, 'visual-scene-1-1'), /达到上限/);
  assert.equal(requests, 0);
});

test('changed media, text, duration, aspect, prompt, model, endpoint or account cannot reuse a review', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  const textChange = (patch) => { const p = parts(); p[0].text = JSON.stringify({ ...JSON.parse(p[0].text), ...patch }); return p; };
  const changedMedia = parts(); changedMedia[2].data = Buffer.from('changed bytes').toString('base64');
  for (const [c, p, system] of [
    [config, changedMedia, 'review'], [config, textChange({ narration: 'A whale migrates.' }), 'review'],
    [config, textChange({ requiredDuration: 7 }), 'review'], [config, textChange({ outputAspect: 'portrait' }), 'review'],
    [config, parts(), 'new quality rules'], [{ ...config, visionModel: 'new-model' }, parts(), 'review'],
    [{ ...config, visionBase: 'https://other-offline.invalid' }, parts(), 'review'],
    [{ ...config, visionKey: 'different-offline-account' }, parts(), 'review'],
  ]) await visionJSON(c, system, p, job(), 'visual-scene-1-1');
  assert.equal(requests, 9);
});

test('incomplete and failed responses never become reusable evidence; other stages remain uncached', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return requests === 1 ? Response.json({ error: { message: 'insufficient credits' } }, { status: 402 }) : requests === 2 ? response({ observations: [{ assetId: 'fixture:wave', usable: true }] }) : response(); });
  await assert.rejects(visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1'), /402/);
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  assert.equal(requests, 3, 'missing motion/watermark/quality evidence must not be cached');
  await visionJSON(config, 'review', parts(), job(), 'rendered-film-1');
  await visionJSON(config, 'review', parts(), job(), 'rendered-film-1');
  assert.equal(requests, 5, 'final rendered-film review must still inspect the current film');
});

test('expired or malformed records are ignored and cancellation cannot be satisfied from cache', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  const files = await readdir(config.visionCacheDirectory); assert.equal(files.length, 1);
  const file = path.join(config.visionCacheDirectory, files[0]);
  const record = JSON.parse(await readFile(file, 'utf8')); record.createdAt = Date.now() - 25 * 3600000;
  await writeFile(file, JSON.stringify(record));
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1'); assert.equal(requests, 2);
  await writeFile(file, '{corrupt');
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1'); assert.equal(requests, 3);
  const cancelled = job(); cancelled.controller.abort(new Error('user stopped'));
  await assert.rejects(visionJSON(config, 'review', parts(), cancelled, 'visual-scene-1-1'), /user stopped/);
  assert.equal(requests, 3);
});

test('a valid JSON record with incorrectly typed audit fields is a cache miss, not a playback-generation failure', async (t) => {
  const config = await setup(t); let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(); });
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  const file = path.join(config.visionCacheDirectory, (await readdir(config.visionCacheDirectory))[0]);
  for (const corrupt of [{ createdAt: String(Date.now()) }, { modelVersion: { incorrect: 'type' } }]) {
    const record = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...record, ...corrupt }));
    const result = await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
    assert.deepEqual(result, observation());
  }
  assert.equal(requests, 3);
});

test('malformed intervals in rejected observations cannot make the optional cache fail generation', async (t) => {
  const config = await setup(t); let requests = 0;
  const data = observation(); Object.assign(data.observations[0], { usable: false, intervals: [null] });
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(data); });
  assert.deepEqual(await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1'), data);
  assert.deepEqual(await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1'), data);
  assert.equal(requests, 2);
});

test('a rejected watermarked observation remains rejected when reused', async (t) => {
  const config = await setup(t); let requests = 0;
  const data = observation(); Object.assign(data.observations[0], { usable: false, hasWatermark: true, intervals: [] });
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(data); });
  await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  const cached = await visionJSON(config, 'review', parts(), job(), 'visual-scene-1-1');
  assert.equal(requests, 1); assert.equal(cached.observations[0].usable, false); assert.equal(cached.observations[0].hasWatermark, true);
});

test('a missing or duplicated candidate observation is never cached', async (t) => {
  const config = await setup(t); let requests = 0;
  const p = [...parts(), { text: JSON.stringify({ assetId: 'fixture:second', kind: 'video', sourceStart: 0, analyzedUntil: 8 }) }, { mime: 'video/mp4', data: 'b3RoZXI=' }];
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    const data = observation(); if (requests > 2) data.observations.push({ ...data.observations[0] });
    return response(data);
  });
  for (let i = 0; i < 4; i++) await visionJSON(config, 'review', p, job(), 'visual-scene-1-1');
  assert.equal(requests, 4); assert.equal((await readdir(config.visionCacheDirectory)).length, 0);
});

test('a cache write failure is optional and a request cancelled after HTTP completion leaves no evidence', async (t) => {
  const config = await setup(t); let requests = 0, abortJob;
  t.mock.method(globalThis, 'fetch', async () => { requests++; abortJob?.controller.abort(new Error('stop')); return response(); });
  const occupied = path.join(config.visionCacheDirectory, 'not-a-directory'); await writeFile(occupied, 'occupied');
  const unavailable = { ...config, visionCacheDirectory: occupied };
  for (let i = 0; i < 2; i++) assert.deepEqual(await visionJSON(unavailable, 'review', parts(), job(), 'visual-scene-1-1'), observation());
  assert.equal(requests, 2);
  abortJob = job();
  await assert.rejects(visionJSON(config, 'review', parts(), abortJob, 'visual-scene-1-1'), /取消/);
  assert.equal((await readdir(config.visionCacheDirectory)).filter(x => x.endsWith('.json')).length, 0);
});

test('compatible frame-based endpoints reuse only their own normally completed responses', async (t) => {
  const config = { ...await setup(t), visionProvider: 'compatible' }; let requests = 0;
  const p = parts(); p[2] = { mime: 'image/jpeg', data: 'b2ZmbGluZQ==' };
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({ model: 'compatible-fixture', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(observation()) } }] }); });
  await visionJSON(config, 'review', p, job(), 'visual-scene-1-1');
  const cachedJob = job(); await visionJSON(config, 'review', p, cachedJob, 'visual-scene-1-1');
  assert.equal(requests, 1); assert.equal(cachedJob.events[0].cacheSourceModelVersion, 'compatible-fixture');
});
