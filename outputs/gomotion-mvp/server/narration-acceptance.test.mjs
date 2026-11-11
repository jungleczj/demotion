import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runQueue, fatalStatus } from '../scripts/verify-voices.mjs';

const tasks = Array.from({ length: 6 }, (_, i) => ({ id: `offline-${i}`, voiceKey: 'Kore', language: 'zh-CN', request: {} }));
const exec = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/verify-voices.mjs', import.meta.url));

test('an authentication denial stops acceptance immediately and keeps later voices unrequested', async () => {
  let calls = 0;
  const result = await runQueue(tasks, async () => { calls++; throw Object.assign(new Error('HTTP 401'), { status: 401 }); }, { concurrency: 1 });
  assert.equal(calls, 1); assert.equal(result.stopReason, 'http_401');
  assert.equal(result.results.filter((entry) => entry.status === 'not_run').length, 5);
  assert.equal(fatalStatus(500, 'upstream failed (HTTP 401)'), 401);
});

test('an executor that finishes after a stop cannot publish a successful acceptance result', async () => {
  let started = 0, resolveLate;
  const running = runQueue(tasks, async () => {
    if (++started === 1) throw Object.assign(new Error('HTTP 429'), { status: 429 });
    return new Promise((resolve) => { resolveLate = resolve; });
  });
  await new Promise(setImmediate);
  resolveLate({ fullDecodeExit: 0 });
  const result = await running;
  assert.equal(result.stopReason, 'http_429');
  assert.equal(result.results[1].status, 'failed');
  assert.equal(result.results[1].reason, 'aborted_after_stop');
  assert.equal(result.results.filter((entry) => entry.status === 'success').length, 0);
});

test('invalid acceptance concurrency cannot silently skip work or exceed two requests', async () => {
  for (const concurrency of [0, -1, 1.5, 3]) {
    let started = 0;
    await assert.rejects(runQueue(tasks, async () => { started++; return {}; }, { concurrency }), /concurrency/i);
    assert.equal(started, 0);
  }
});

test('an already interrupted acceptance queue never starts a voice request', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await runQueue(tasks, async () => assert.fail('interrupted work must not start'), { signal: controller.signal });
  assert.equal(result.stopReason, 'interrupted');
  assert.ok(result.results.every((entry) => entry.status === 'not_run' && entry.reason === 'interrupted'));
});

test('voice acceptance can select an isolated loopback port while preserving the default and making no requests', async () => {
  for (const [args, endpoint] of [
    [[], 'http://127.0.0.1:3027/api/narration'],
    [['--base-url', 'http://127.0.0.1:3028'], 'http://127.0.0.1:3028/api/narration'],
    [['--base-url', 'http://localhost:3028/'], 'http://localhost:3028/api/narration'],
  ]) {
    const { stdout } = await exec(process.execPath, [script, '--resume', '--self-check', ...args], { timeout: 5000 });
    const result = JSON.parse(stdout);
    assert.equal(result.endpoint, endpoint);
    assert.equal(result.networkRequests, 0); assert.equal(result.ttsRequests, 0);
    assert.equal(result.concurrency, 2);
  }
});

test('voice acceptance rejects remote, credential-bearing or non-root base URLs before execution', async () => {
  for (const value of ['https://127.0.0.1:3028', 'http://example.com:3028', 'http://127.0.0.2:3028', 'http://user:secret@127.0.0.1:3028', 'http://127.0.0.1:3028/api', 'http://127.0.0.1:3028/?key=secret', 'http://127.0.0.1:3028/#fragment']) {
    await assert.rejects(exec(process.execPath, [script, '--self-check', '--base-url', value], { timeout: 5000 }), (error) => error.code === 1 && !`${error.stdout}${error.stderr}`.includes('secret'));
  }
  await assert.rejects(exec(process.execPath, [script, '--self-check', '--base-url'], { timeout: 5000 }), (error) => error.code === 1);
});
