import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile, mkdir, utimes, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

test('deployed Node backend serves config and voices, retains saved exports and restores queued tasks after restart', { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'demotion-deployment-http-'));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const historicalExport = randomUUID(), historicalTask = randomUUID(), historicalProject = randomUUID();
  const old = new Date(Date.now() - 26 * 3600000), savedBytes = Buffer.from('saved export bytes; HTTP retention fixture, not a video quality check');
  await mkdir(path.join(directory, historicalExport)); await writeFile(path.join(directory, historicalExport, 'video.mp4'), savedBytes);
  await utimes(path.join(directory, historicalExport), old, old);
  const uploaded = path.join(directory, randomUUID()), source = path.join(directory, `motion-${historicalProject}`), orphan = path.join(directory, randomUUID());
  for (const folder of [uploaded, source, orphan]) { await mkdir(folder); await writeFile(path.join(folder, 'file'), 'retained source fixture'); await utimes(folder, old, old); }
  await mkdir(path.join(directory, 'productions'));
  await writeFile(path.join(directory, 'productions/jobs.json'), JSON.stringify([{ id: historicalTask, status: 'done', phase: 'reviewing', updatedAt: old.getTime(), exportId: historicalExport, project: { id: historicalProject, scenes: [{ id: randomUUID(), selected: { id: 'upload:retention-fixture', localPath: path.join(uploaded, 'file'), sourceAssets: [{ localPath: path.join(source, 'file') }] } }], exportUrl: `/api/exports/${historicalExport}/video.mp4` } }]));
  let child;
  const stop = async () => { if (!child || child.exitCode !== null || child.signalCode) return; const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; };
  const start = async () => {
    const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), GOMOTION_DATA_DIR: directory, APP_ORIGINS: 'https://gomotion-mvp.vercel.app', VISION_API_KEY: '', GEMINI_API_KEY: '', LLM_API_KEY: '', SECRET_DEEPSEEK_API_KEY: '', PIXABAY_API_KEY: '', PEXELS_API_KEY: '', COVERR_API_KEY: '', YOUTUBE_API_KEY: '' };
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('isolated server startup timed out')), 10000);
      const output = (bytes) => { log += bytes; if (log.includes(`http://localhost:${port}`)) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', output); child.stderr.on('data', output);
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`isolated server exited: ${log.slice(-700)}`)); });
    });
  };
  const request = (route, options = {}) => fetch(base + route, { ...options, signal: AbortSignal.timeout(3000) });
  try {
    await start();
    assert.equal((await request('/')).status, 200);
    const health = await request('/api/health'); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
    const retained = await request(`/api/exports/${historicalExport}/video.mp4`);
    assert.equal(retained.status, 200, 'saved projects must not lose their output just because the server restarts after 24 hours');
    assert.deepEqual(Buffer.from(await retained.arrayBuffer()), savedBytes);
    assert.equal(await readFile(path.join(uploaded, 'file'), 'utf8'), 'retained source fixture');
    assert.equal(await readFile(path.join(source, 'file'), 'utf8'), 'retained source fixture');
    await assert.rejects(stat(orphan), { code: 'ENOENT' });
    const config = await request('/api/config', { headers: { Origin: 'https://gomotion-mvp.vercel.app' } });
    assert.equal(config.status, 200); assert.equal((await config.json()).visionConfigured, false);
    const youtubeConfig = await request('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ youtubeKey: 'offline-youtube-fixture', youtubeDiscovery: false }) });
    const youtubeView = await youtubeConfig.json();
    assert.equal(youtubeView.youtubeConnected, true);
    assert.equal(youtubeView.youtubeDiscovery, false);
    assert.ok(!JSON.stringify(youtubeView).includes('offline-youtube-fixture'));
    const voicesStarted = performance.now();
    const voices = await request('/api/voices', { headers: { Origin: 'https://gomotion-mvp.vercel.app' } });
    assert.equal(voices.status, 200); const catalog = await voices.json();
    assert.equal(catalog.voices.length, 30); assert.ok(catalog.languages.some((l) => l.code === 'zh-CN'));
    const invalidMusic = await request('/api/music/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'ocean', providers: ['unknown-source'] }) });
    assert.equal(invalidMusic.status, 400);
    assert.equal((await request(`/api/music/files/${'f'.repeat(64)}.audio`)).status, 404);
    const voicesMs = performance.now() - voicesStarted;
    assert.equal((await request('/api/config', { headers: { Origin: 'https://unrelated.invalid' } })).status, 403);
    const project = { id: randomUUID(), title: 'Deployment persistence check', script: '海浪不断涌向海岸，海洋的故事却远不止眼前的蓝色。', scenes: [], voice: 'gemini:Kore', language: 'zh-CN', format: 'landscape', fit: 'cover', subtitles: true };
    const submitted = await request('/api/productions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, providers: ['commons'] }) });
    assert.equal(submitted.status, 202); const task = await submitted.json(); assert.equal(task.status, 'queued');
    await stop(); await start();
    const restored = await request(`/api/productions/${task.id}`); assert.equal(restored.status, 200);
    const record = await restored.json(); assert.equal(record.id, task.id); assert.equal(record.status, 'queued'); assert.equal(record.project.script, project.script);
    const saved = JSON.parse(await readFile(path.join(directory, 'productions/jobs.json'), 'utf8'));
    assert.equal(saved.length, 2); assert.ok(saved.some((x) => x.id === task.id));
    assert.equal((await request(`/api/exports/${historicalExport}/video.mp4`)).status, 200);
    t.diagnostic(JSON.stringify({ configStatus: config.status, voicesStatus: voices.status, voiceCount: catalog.voices.length, voicesMs: Math.round(voicesMs * 100) / 100, queuedTaskRestored: true, savedExportAndSourceFilesRetained: true, orphanedExpiredDirectoryRemoved: true, realModelRequests: 0, mainServiceRestarted: false }));
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
});
