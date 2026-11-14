import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProductionManager } from './productions.mjs';
import { assets } from './sources.mjs';

const textResponse = (data) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] });

for (const shortlistFails of [false, true]) {
  test(`catalog candidates survive narration failure and restart${shortlistFails ? ' even when catalog ranking also fails' : ''}`, { timeout: 5000 }, async (t) => {
    const work = await mkdtemp(path.join(os.tmpdir(), 'selection-checkpoint-'));
    const sourceId = randomUUID(), assetId = `pixabay:${sourceId}`, sceneId = randomUUID();
    const query = `ocean coral ${sourceId}`;
    const text = `海底的珊瑚礁为海洋生物提供栖息之所，这是离线检查 ${randomUUID()}。`;
    const project = { id: randomUUID(), script: text, voice: 'gemini:Kore', language: 'zh-CN', format: 'landscape', scenes: [{ id: sceneId, text, query: 'old query', candidates: [], selected: null }] };
    const config = { visionEnabled: true, visionProvider: 'gemini', visionKey: 'offline-key', visionModel: 'offline-model', visionBase: 'https://model.invalid', pixabayKey: 'offline-stock-key' };
    let catalogCalls = 0, narrationCalls = 0, rankingCalls = 0, saveCalls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      const target = new URL(url);
      if (target.hostname === 'pixabay.com') {
        catalogCalls++;
        assert.equal(target.searchParams.get('q'), query.slice(0, 100));
        return Response.json({ hits: [{ id: sourceId, tags: 'ocean coral reef', pageURL: 'https://pixabay.com/videos/offline-coral/', user: 'offline-author', duration: 20, videos: { medium: { url: 'https://cdn.invalid/coral.mp4', width: 1280, height: 720, size: 1000 } } }] });
      }
      assert.equal(target.hostname, 'model.invalid', 'no actual API or media download is permitted');
      const payload = JSON.parse(options.body);
      if (payload.generationConfig.responseModalities?.includes('AUDIO')) {
        narrationCalls++;
        return Response.json({ error: { message: 'Generate requests per day FreeTier limit: 10' } }, { status: 429 });
      }
      if (payload.systemInstruction.parts[0].text.startsWith('Plan footage retrieval')) {
        return textResponse({ queries: [{ sceneId, query, providers: ['pixabay'] }] });
      }
      rankingCalls++;
      return shortlistFails ? Response.json({ error: { message: 'per day limit' } }, { status: 429 })
        : textResponse({ scenes: [{ sceneId, candidateIds: [assetId] }] });
    });
    try {
      const dependencies = { work, config, analyses: new Map(), exports: new Map(), saveAssets: async () => { saveCalls++; } };
      const manager = await createProductionManager(dependencies);
      const submitted = await manager.submit({ project, providers: ['pixabay'] });
      let task;
      for (let i = 0; i < 100; i++) {
        task = manager.get(submitted.id);
        if (!['queued', 'running'].includes(task.status)) break;
        await delay(10);
      }
      assert.equal(task.status, 'error');
      assert.equal(narrationCalls, 1, 'a daily limit must not start another narration or recovery pass');
      assert.equal(catalogCalls, 1);
      assert.equal(rankingCalls, 1);
      assert.deepEqual(task.project.scenes[0].candidates.map((a) => a.id), [assetId], 'a successful parallel catalog must not disappear when narration fails');
      assert.equal(task.project.scenes[0].selected, null, 'catalog metadata cannot approve playable footage');
      assert.equal(task.project.scenes[0].candidates[0].playbackChecked, undefined);
      assert.equal(task.project.exportUrl, undefined);
      assert.equal(task.project.sequenceReport.complete, false);
      assert.equal(task.project.sequenceReport.stopReason, 'narration');
      const failure = task.project.sequenceReport.events.find((e) => e.stage === 'narration-timing' && e.status === 'failed');
      assert.equal(failure.httpStatus, 429);
      assert.equal(failure.errorCode, 'TTS_PROVIDER_ERROR');
      assert.ok(task.project.sequenceReport.events.some((e) => e.stage === 'semantic-retrieval-1' && e.mediaCount === 1));
      assert.ok(saveCalls > 0);
      // Wait for the terminal write, then load the real persisted task manager.
      let saved;
      for (let i = 0; i < 100; i++) {
        saved = JSON.parse(await readFile(path.join(work, 'productions/jobs.json'), 'utf8'))[0];
        if (saved.finishedAt) break;
        await delay(10);
      }
      assert.ok(saved.finishedAt);
      const restarted = await createProductionManager({ ...dependencies, analyses: new Map(), autoStart: false });
      const restored = restarted.get(task.id);
      assert.equal(restored.status, 'error');
      assert.deepEqual(restored.project.scenes[0].candidates.map((a) => a.id), [assetId]);
      assert.equal(restored.project.sequenceReport.stopReason, 'narration');
      assert.ok(restored.project.sequenceReport.events.some((e) => e.httpStatus === 429));
      assert.equal(narrationCalls, 1, 'read-only restore must not resubmit a terminal task');
      const retried = await manager.submit({ project: restored.project, providers: ['pixabay'] });
      let retry;
      for (let i = 0; i < 100; i++) {
        retry = manager.get(retried.id);
        if (!['queued', 'running'].includes(retry.status)) break;
        await delay(10);
      }
      assert.equal(retry.status, 'error');
      assert.equal(narrationCalls, 2, 'only an explicit new submission attempts narration again');
      assert.equal(catalogCalls, 1, 'retry uses the saved catalog instead of repeating a successful source search');
      assert.equal(rankingCalls, 1);
      assert.deepEqual(retry.project.scenes[0].candidates.map((a) => a.id), [assetId]);
    } finally {
      assets.delete(assetId);
      await rm(work, { recursive: true, force: true });
    }
  });
}
