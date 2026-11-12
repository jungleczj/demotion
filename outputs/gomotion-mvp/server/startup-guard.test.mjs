import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, utimes } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createProductionManager } from './productions.mjs';

const projectFixture = () => {
  const text = `服务启动检查保留原来的后台任务 ${randomUUID()}。`;
  return { id: randomUUID(), script: text, voice: 'gemini:Kore', format: 'landscape', language: 'zh-CN', scenes: [{ id: randomUUID(), text, searchMethod: 'ai-metadata', candidates: [] }] };
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('an occupied port exits before restoring work, cleaning files or calling a provider', { timeout: 12000 }, async (t) => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'demotion-startup-conflict-'));
  let requests = 0, child;
  const listener = http.createServer((req, res) => { requests++; req.resume(); res.writeHead(402, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Offline fixture only' } })); });
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  const task = { id: randomUUID(), status: 'queued', updatedAt: 1, project: projectFixture() };
  const saved = JSON.stringify([task]);
  const oldFolder = path.join(work, randomUUID());
  await mkdir(path.join(work, 'productions')); await writeFile(path.join(work, 'productions/jobs.json'), saved);
  await mkdir(oldFolder); await writeFile(path.join(oldFolder, 'untouched'), 'startup must not reclaim a different running service’s files');
  const old = new Date(Date.now() - 26 * 3600000); await utimes(oldFolder, old, old);
  const env = { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), GOMOTION_DATA_DIR: work, VISION_API_KEY: 'offline-startup-fixture', GEMINI_API_KEY: '', VISION_BASE_URL: `http://127.0.0.1:${port}`, VISION_MODEL: 'offline-model', LLM_API_KEY: '', SECRET_DEEPSEEK_API_KEY: '', PIXABAY_API_KEY: '', PEXELS_API_KEY: '', COVERR_API_KEY: '', YOUTUBE_API_KEY: '' };
  try {
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout.on('data', (data) => { log += data; }); child.stderr.on('data', (data) => { log += data; });
    const ended = once(child, 'exit').then(([code]) => code);
    const code = await Promise.race([ended, delay(4000).then(() => null)]);
    assert.equal(code, 1, `failed duplicate service must exit instead of leaving its task pump alive: ${log.slice(-500)}`);
    assert.match(log, /端口.*已被占用|EADDRINUSE/);
    assert.equal(requests, 0, 'a rejected duplicate process must not resume the saved job');
    assert.equal(await readFile(path.join(work, 'productions/jobs.json'), 'utf8'), saved);
    assert.equal((await stat(oldFolder)).isDirectory(), true, 'cleanup belongs only to the process that owns the listening port');
    t.diagnostic(JSON.stringify({ duplicateExitCode: code, taskFileUnchanged: true, cleanupNotStarted: true, providerRequests: requests, mainServiceRestarted: false }));
  } finally {
    if (child && child.exitCode === null && !child.signalCode) { const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; }
    listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});

test('production execution waits for explicit startup readiness, including after resume', { timeout: 8000 }, async (t) => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'demotion-startup-gate-'));
  let calls = 0, manager, task;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(url.startsWith('https://startup.invalid/'), 'this fixture cannot call a real provider');
    calls++; return Response.json({ error: { message: 'Offline input rejected' } }, { status: 400 });
  });
  try {
    manager = await createProductionManager({ autoStart: false, work, config: { visionEnabled: true, visionProvider: 'gemini', visionKey: 'offline-only', visionModel: 'offline-model', visionBase: 'https://startup.invalid' }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
    task = await manager.submit({ project: projectFixture(), providers: [] });
    manager.resume(); await delay(100);
    assert.equal(manager.get(task.id).status, 'queued'); assert.equal(calls, 0);
    manager.start(); manager.start();
    const deadline = Date.now() + 4000;
    while (['queued', 'running'].includes(manager.get(task.id).status) && Date.now() < deadline) await delay(10);
    assert.equal(calls, 1, 'idempotent startup executes the queued job once');
    assert.equal(manager.get(task.id).status, 'error');
  } finally {
    if (manager && task && ['queued', 'running'].includes(manager.get(task.id)?.status)) { await manager.cancel(task.id); await delay(100); }
    await rm(work, { recursive: true, force: true });
  }
});
