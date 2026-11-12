import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

test('the default durable directory belongs to the application and survives a changed temporary directory or cwd', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gomotion-default-directory-'));
  const runtime = new URL('./runtime.mjs', import.meta.url).href;
  const expected = fileURLToPath(new URL('../work', import.meta.url));
  try {
    const check = async (temporary, cwd) => {
      const env = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
      delete env.GOMOTION_DATA_DIR;
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
        const { workDirectory } = await import(${JSON.stringify(runtime)});
        console.log(JSON.stringify(workDirectory));
      `], { cwd, env });
      return JSON.parse(stdout);
    };
    assert.equal(await check(path.join(directory, 'first-temp'), directory), expected);
    assert.equal(await check(path.join(directory, 'second-temp'), path.dirname(directory)), expected);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the voice catalog loads without downloading thirty unrelated sample recordings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'demotion-cold-catalog-'));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      globalThis.fetch = async () => { throw new Error('catalog must not fetch recordings'); };
      const { readyVoices } = await import('./server/voice-samples.mjs');
      console.log(JSON.stringify(await readyVoices()));
    `], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, TMPDIR: directory, GOMOTION_DATA_DIR: directory } });
    const voices = JSON.parse(stdout);
    assert.equal(voices.length, 30);
    assert.ok(voices.includes('Kore') && voices.includes('Puck') && voices.includes('Fenrir'));
    assert.equal(new Set(voices).size, 30);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all durable media paths follow the configured server data directory', async () => {
  const directory = path.join(os.tmpdir(), 'demotion-persistent-volume-contract');
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import { narrationPath } from './server/narration.mjs';
    import { playbackPath } from './server/playback.mjs';
    import { voiceSamplePath } from './server/voice-samples.mjs';
    console.log(JSON.stringify([narrationPath('recording'), playbackPath('clip'), voiceSamplePath('Kore')]));
  `], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, GOMOTION_DATA_DIR: directory } });
  assert.deepEqual(JSON.parse(stdout), [path.join(directory, 'narration/recording.wav'), path.join(directory, 'playback/clip.mp4'), path.join(directory, 'voice-samples/Kore.wav')]);
});

test('the explicit cloud worker directory keeps its existing absolute contract', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    const { workDirectory } = await import('./server/runtime.mjs');
    console.log(JSON.stringify(workDirectory));
  `], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, GOMOTION_DATA_DIR: '/vercel/sandbox/work' } });
  assert.equal(JSON.parse(stdout), '/vercel/sandbox/work');
});

test('default storage restores the same task after a process restart and retains only an explicit stop', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-default-restart-'));
  const server = path.join(fixture, 'app/server');
  try {
    await mkdir(server, { recursive: true });
    for (const name of ['runtime.mjs', 'data-directory.mjs']) await cp(fileURLToPath(new URL(name, import.meta.url)), path.join(server, name));
    const runtime = new URL(`file://${server}/runtime.mjs`).href;
    const manager = new URL('./productions.mjs', import.meta.url).href;
    const run = async (phase, tmpdir) => {
      const env = { ...process.env, TMPDIR: path.join(fixture, tmpdir) };
      delete env.GOMOTION_DATA_DIR;
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
        import { randomUUID } from 'node:crypto';
        const { workDirectory, initializeWorkDirectory } = await import(${JSON.stringify(runtime)});
        const { createProductionManager } = await import(${JSON.stringify(manager)});
        await initializeWorkDirectory();
        const manager = await createProductionManager({ work: workDirectory, config: { visionEnabled: false }, analyses: new Map(), exports: new Map(), saveAssets: async () => {} });
        let task;
        if (${JSON.stringify(phase)} === 'submit') task = await manager.submit({ project: { id: randomUUID(), script: '这段本地离线检查不会调用模型，用来验证任务跨进程重启后保留。', voice: 'gemini:Kore', format: 'landscape', scenes: [] } });
        else task = manager.list().tasks[0];
        if (${JSON.stringify(phase)} === 'stop') task = await manager.cancel(task.id);
        console.log(JSON.stringify({ workDirectory, task }));
      `], { cwd: fixture, env });
      return JSON.parse(stdout);
    };
    const first = await run('submit', 'temporary-session-one');
    const file = path.join(first.workDirectory, 'productions/jobs.json');
    const records = JSON.parse(await readFile(file, 'utf8'));
    records[0].status = 'running'; records[0].progress = 42;
    records[0].project.scenes = [{ id: 'checkpoint-scene', text: '保留的检查点', duration: 7 }];
    await writeFile(file, JSON.stringify(records));
    const restarted = await run('inspect', 'temporary-session-two');
    assert.equal(restarted.workDirectory, first.workDirectory);
    assert.equal(restarted.task.id, first.task.id);
    assert.equal(restarted.task.status, 'queued');
    assert.equal(restarted.task.project.scenes[0].text, '保留的检查点');
    assert.equal((await run('stop', 'temporary-session-three')).task.status, 'cancelled');
    const stopped = await run('inspect', 'temporary-session-four');
    assert.equal(stopped.task.id, first.task.id);
    assert.equal(stopped.task.status, 'cancelled');
    assert.match(stopped.task.message, /草稿已保留/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
