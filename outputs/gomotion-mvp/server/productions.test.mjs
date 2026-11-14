import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProductionManager, productionCompletionMessage } from './productions.mjs';
import { mkdir } from 'node:fs/promises';

test('completed tasks disclose unavailable music while preserving the playable narration', () => {
  const message = productionCompletionMessage({ review: { passed: true }, music: { status: 'unavailable', reason: 'private provider diagnostics' } });
  assert.match(message, /可以播放或下载/);
  assert.match(message, /背景音乐未加入，已保留完整旁白/);
  assert.ok(!message.includes('private provider diagnostics'));
  for (const status of ['mixed', 'disabled']) assert.ok(!productionCompletionMessage({ review: { passed: true }, music: { status } }).includes('未加入'));
  assert.match(productionCompletionMessage({ music: { status: 'unavailable' } }), /草稿已保存.*背景音乐未加入/);
});

test('queued production persists independently of UI and only explicit stop cancels it', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-persistence-'));
  const config = { visionEnabled: false, visionKey: 'fixture-secret-never-persist', llmKey: 'fixture-other-secret' };
  const dependencies = { work, config, analyses: new Map(), exports: new Map(), saveAssets: async () => {} };
  try {
    const first = await createProductionManager(dependencies);
    const project = { id: randomUUID(), title: 'durable fixture', script: '这是一段只用于本地检查的测试旁白，不发送任何网络请求。', createdAt: new Date().toISOString(), voice: 'gemini:Kore', format: 'landscape', language: 'zh-CN', scenes: [] };
    const task = await first.submit({ project });
    assert.equal(task.status, 'queued');
    assert.equal((await first.submit({ project })).id, task.id, 'a second submission does not create duplicate work');
    const file = path.join(work, 'productions/jobs.json');
    const raw = await readFile(file, 'utf8');
    assert.ok(!raw.includes(config.visionKey) && !raw.includes(config.llmKey));
    const records = JSON.parse(raw);
    records[0].status = 'running'; records[0].phase = 'matching'; records[0].progress = 42;
    records[0].project.scenes = [{ id: randomUUID(), text: project.script, duration: 7, selected: null }];
    await writeFile(file, JSON.stringify(records));
    const restarted = await createProductionManager({ ...dependencies, analyses: new Map(), exports: new Map() });
    const restored = restarted.get(task.id);
    assert.equal(restored.status, 'queued');
    assert.equal(restored.project.scenes[0].text, project.script);
    assert.equal(restored.project.scenes[0].duration, 7);
    assert.equal(restarted.list().tasks.length, 1);
    assert.equal(first.get(task.id).status, 'queued', 'read-only UI lifecycle has no cancellation effect');
    assert.equal((await restarted.cancel(task.id)).status, 'cancelled');
    const again = await createProductionManager({ ...dependencies, analyses: new Map(), exports: new Map() });
    assert.equal(again.get(task.id).status, 'cancelled');
    assert.match(again.get(task.id).message, /草稿已保留/);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('simultaneous submissions for the same project share one durable task', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-submit-race-'));
  try {
    const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    const project = { id: randomUUID(), title: 'concurrent local fixture', script: '并发点击制作时，必须保留同一个后台任务，不重复消耗服务请求。', voice: 'gemini:Kore', format: 'landscape', scenes: [] };
    const tasks = await Promise.all(Array.from({ length: 5 }, () => manager.submit({ project })));
    assert.equal(new Set(tasks.map((task) => task.id)).size, 1);
    assert.equal(manager.list().tasks.length, 1);
    const saved = JSON.parse(await readFile(path.join(work, 'productions/jobs.json'), 'utf8'));
    assert.equal(saved.length, 1);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('local production accepts and persists 25,000 characters exactly and rejects 25,001', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-script-limit-'));
  try {
    const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    const project = { id: randomUUID(), script: '海'.repeat(25000), voice: 'gemini:Kore', format: 'landscape', scenes: [] };
    const task = await manager.submit({ project });
    assert.equal(task.status, 'queued');
    assert.equal(task.project.script, project.script);
    assert.equal(JSON.parse(await readFile(path.join(work, 'productions/jobs.json'), 'utf8'))[0].project.script.length, 25000);
    await assert.rejects(manager.submit({ project: { ...project, id: randomUUID(), script: project.script + '洋' } }), { status: 400 });
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('completed arbitrary diagrams cannot be reused as source-backed productions', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-provenance-'));
  try {
    const directory = path.join(work, 'productions'); await mkdir(directory, { recursive: true });
    const exportId = randomUUID(); await mkdir(path.join(work, exportId));
    // Only cache eligibility is under test; this placeholder is never decoded.
    await writeFile(path.join(work, exportId, 'video.mp4'), 'old-cache-placeholder');
    const text = '帝企鹅将蛋保护在脚上，这是旧版任意绘制图形的本地回归样例。';
    const scene = { id: randomUUID(), text, duration: 6, start: 0, confirmed: false,
      selected: { id: 'upload:old-graphic', provider: 'upload', kind: 'video', generated: true, renderKind: 'motion-graphic' },
      motionGraphic: { schemaVersion: 1, type: 'mechanism', nodes: [{ icon: 'penguin', label: '企鹅', quote: '帝企鹅' }] } };
    const old = { id: randomUUID(), exportId, status: 'done', updatedAt: 1,
      project: { id: randomUUID(), script: text, voice: 'gemini:Kore', format: 'landscape', language: 'zh-CN', scenes: [scene], exportUrl: `/api/exports/${exportId}/video.mp4`, videoProfile: { version: 1 }, videoReview: { passed: true, watermarkFree: true } } };
    await writeFile(path.join(directory, 'jobs.json'), JSON.stringify([old]));
    const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    const next = await manager.submit({ project: { ...old.project, id: randomUUID(), scenes: [{ ...scene, selected: null, motionGraphic: undefined }] } });
    assert.equal(next.status, 'queued', 'legacy successful diagrams lack real base-asset provenance and must be rebuilt');
    assert.equal(next.project.exportUrl, undefined);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('remaking a subtitled project rebuilds an older small-caption export', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-caption-cache-'));
  try {
    const directory = path.join(work, 'productions'); await mkdir(directory, { recursive: true });
    const exportId = randomUUID(); await mkdir(path.join(work, exportId));
    await writeFile(path.join(work, exportId, 'video.mp4'), 'eligibility fixture only; never decoded');
    const text = '重新制作时应该采用当前清晰字幕，不能返回之前的小字缓存成片。';
    const scene = { id: randomUUID(), text, duration: 6, selected: { id: 'upload:caption-cache', provider: 'upload', kind: 'video' } };
    const old = { id: randomUUID(), exportId, status: 'done', updatedAt: 1, project: { id: randomUUID(), script: text, voice: 'gemini:Kore', format: 'landscape', subtitles: true, scenes: [scene], exportUrl: `/api/exports/${exportId}/video.mp4`, videoProfile: { version: 1 }, videoReview: { passed: true, watermarkFree: true } } };
    await writeFile(path.join(directory, 'jobs.json'), JSON.stringify([old]));
    const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    const next = await manager.submit({ project: { ...old.project, id: randomUUID() } });
    assert.equal(next.status, 'queued', 'old burned captions must be rendered again');
    assert.equal(next.project.exportUrl, undefined);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('remaking a project does not reuse a pre-music export', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-audio-cache-'));
  try {
    const directory = path.join(work, 'productions'); await mkdir(directory, { recursive: true });
    const exportId = randomUUID(); await mkdir(path.join(work, exportId));
    await writeFile(path.join(work, exportId, 'video.mp4'), 'eligibility fixture only; never decoded');
    const text = '重新制作时应该采用新版整片声音处理，不能复用之前没有配乐步骤的旧成片。';
    const scene = { id: randomUUID(), text, duration: 6, selected: { id: 'upload:audio-cache', provider: 'upload', kind: 'video' } };
    const old = { id: randomUUID(), exportId, status: 'done', updatedAt: 1, project: { id: randomUUID(), script: text, voice: 'gemini:Kore', format: 'landscape', subtitles: false, scenes: [scene], exportUrl: `/api/exports/${exportId}/video.mp4`, videoProfile: { version: 1 }, videoReview: { passed: true, watermarkFree: true } } };
    await writeFile(path.join(directory, 'jobs.json'), JSON.stringify([old]));
    const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    const next = await manager.submit({ project: { ...old.project, id: randomUUID() } });
    assert.equal(next.status, 'queued');
    assert.equal(next.project.exportUrl, undefined);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('completed short music mixes and seamless loops reuse the saved film without new work', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'production-music-profile-'));
  try {
    const directory = path.join(work, 'productions'); await mkdir(directory, { recursive: true });
    const exportId = randomUUID(); await mkdir(path.join(work, exportId));
    await writeFile(path.join(work, exportId, 'video.mp4'), 'cache eligibility fixture; not media acceptance');
    const text = '缓存检查保持已经完成的短片，不重新请求配音或检索视频素材。';
    const scene = { id: randomUUID(), text, duration: 6, selected: { id: 'upload:music-profile', provider: 'upload', kind: 'video' } };
    for (const [version, looped, end, expected, newTitle, preserveScript] of [[1, false, 6, 'done'], [2, true, 16, 'done'], [1, true, 16, 'queued'], [2, false, 6, 'queued', 'Danger and survival'], [2, false, 6, 'queued', undefined, true]]) {
      const old = { id: randomUUID(), exportId, status: 'done', updatedAt: 1,
        project: { id: randomUUID(), script: text, preserveScript, voice: 'gemini:Kore', format: 'landscape', scenes: [scene],
          exportUrl: `/api/exports/${exportId}/video.mp4`, videoProfile: { version: 1, audioMixVersion: version },
          videoReview: { passed: true, watermarkFree: true },
          music: { status: 'mixed', mixed: true, narrationPreserved: true,
            source: { duration: 10, sha256: 'a'.repeat(64), fullDecode: true },
            mix: { version, continuous: true, start: 0, end, looped, loopCrossfadeSeconds: .35, loopPeriodSeconds: 9.65 } } } };
      await writeFile(path.join(directory, 'jobs.json'), JSON.stringify([old]));
      const manager = await createProductionManager({ work, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {}, autoStart: false });
      const next = await manager.submit({ project: { ...old.project, id: randomUUID(), ...(newTitle ? { title: newTitle } : {}), ...(preserveScript ? { script: `  ${text}\n` } : {}) } });
      assert.equal(next.status, expected, `version=${version}, looped=${looped}`);
      assert.equal(next.project.exportUrl, expected === 'done' ? old.project.exportUrl : undefined);
    }
  } finally { await rm(work, { recursive: true, force: true }); }
});
