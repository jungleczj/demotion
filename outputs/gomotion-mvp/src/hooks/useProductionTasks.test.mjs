import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile the real hook and API wrapper. Only React scheduling, polling clocks
// and fetch responses are controlled; no server or browser is contacted.
const folder = await mkdtemp(path.join(tmpdir(), 'gomotion-production-state-'));
const adapter = path.join(folder, 'react.mjs');
await writeFile(adapter, `export const useRef = (...args) => globalThis.productionTasksHarness.useRef(...args);\nexport const useState = (...args) => globalThis.productionTasksHarness.useState(...args);\nexport const useEffect = (...args) => globalThis.productionTasksHarness.useEffect(...args);`);
const bundle = path.join(folder, 'productions.mjs');
await build({ entryPoints: [new URL('./useProductionTasks.ts', import.meta.url).pathname], outfile: bundle, bundle: true, platform: 'node', format: 'esm', alias: { react: adapter }, logLevel: 'silent' });
const { default: useProductionTasks } = await import(pathToFileURL(bundle));
after(async () => { await rm(folder, { recursive: true, force: true }); });

const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const task = (patch = {}) => ({
  id: 'task-original', status: 'running', phase: 'matching', progress: 42, message: '正在制作视频…',
  createdAt: 100, updatedAt: 110, startedAt: 105, estimate: { videoSeconds: 30, minSeconds: 60, maxSeconds: 120 }, retry: 0, retryLimit: 3,
  project: { id: 'project-one', title: '原后台任务', script: '这是一条离线状态逻辑测试的旁白。', createdAt: '2026-11-11T06:00:00Z', voice: 'gemini:Kore', voiceStyle: 'documentary', language: 'zh-CN', format: 'landscape', fit: 'cover', subtitles: true, topic: '', scenes: [] },
  ...patch,
});

function transport() {
  const requests = [];
  const fetch = (url, options = {}) => {
    assert.match(String(url), /^\/api\/productions(?:[/?]|$)/, 'all responses are local in-memory fixtures');
    const request = { url: String(url), method: options.method || 'GET', signal: options.signal, body: options.body, settled: false };
    requests.push(request);
    return new Promise((resolve, reject) => {
      // A transport may deliver its decoded body just after cancellation. The
      // hook must still ignore late polling data using its own lifecycle guard.
      request.respond = (body, status = 200) => { request.settled = true; resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })); };
      request.fail = (error = new Error('offline connection failure')) => { request.settled = true; reject(error); };
    });
  };
  return { requests, fetch };
}

function mount(network, handlers = {}) {
  const originals = new Map(), timers = new Map(), updates = [], finished = [], navigation = [];
  const patch = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  let cursor = 0, timerId = 0, pending = false, disposed = false, result;
  const values = [], effects = [];
  const options = { enabled: handlers.enabled, onUpdate(value) { updates.push(value); handlers.onUpdate?.(value); }, onFinished(value) { finished.push(value); handlers.onFinished?.(value); } };
  const location = { assign(...args) { navigation.push(['assign', ...args]); }, replace(...args) { navigation.push(['replace', ...args]); } };
  Object.defineProperty(location, 'href', { configurable: true, get: () => '/projects', set: (value) => navigation.push(['href', value]) });
  const history = Object.fromEntries(['pushState', 'replaceState', 'back', 'forward', 'go'].map((name) => [name, (...args) => navigation.push([name, ...args])]));
  patch('fetch', network.fetch);
  patch('setTimeout', (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; });
  patch('clearTimeout', (id) => timers.delete(id));
  patch('location', location); patch('history', history); patch('window', { location, history });
  const harness = {
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { const next = typeof value === 'function' ? value(values[index]) : value; if (!Object.is(next, values[index])) { values[index] = next; schedule(); } }]; },
    useEffect(callback, deps) { const index = cursor++; const previous = effects[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects[index] = { deps, callback, cleanup: previous?.cleanup, dirty: true }; },
  };
  patch('productionTasksHarness', harness);
  function schedule() { if (pending || disposed) return; pending = true; queueMicrotask(() => { pending = false; if (!disposed) render(); }); }
  function render() {
    globalThis.productionTasksHarness = harness; cursor = 0; result = useProductionTasks(options);
    for (const effect of effects) if (effect?.dirty) { effect.dirty = false; effect.cleanup?.(); effect.cleanup = effect.callback(); }
  }
  render();
  return {
    get hook() { return result; }, updates, finished, navigation, timers,
    async poll() {
      assert.equal(timers.size, 1, 'polling must schedule only one following request');
      const [id, timer] = [...timers][0]; assert.equal(timer.ms, 2000);
      timers.delete(id); timer.callback(); await settle();
    },
    dispose() {
      if (disposed) return;
      disposed = true; effects.forEach((effect) => effect?.cleanup?.());
      for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    },
  };
}

test('an unavailable worker does not start a failing poll loop', async () => {
  const network = transport();
  const app = mount(network, { enabled: false });
  try {
    await settle();
    assert.equal(network.requests.length, 0);
    assert.equal(app.timers.size, 0);
    assert.equal(app.hook.connectionLost, false);
  } finally { app.dispose(); }
});

test('a refreshed mount reads the original background task without submitting or cancelling it', async () => {
  const network = transport(), original = task();
  let app = mount(network);
  try {
    assert.equal(network.requests[0].url, '/api/productions?after=0');
    network.requests[0].respond({ cursor: 110, tasks: [original] }); await settle();
    assert.equal(app.hook.tasks['project-one'].id, 'task-original');
    app.dispose(); app = mount(network);
    assert.equal(network.requests[1].url, '/api/productions?after=0', 'a fresh hook restores from the server, not an old client cursor');
    network.requests[1].respond({ cursor: 120, tasks: [task({ progress: 58, updatedAt: 120 })] }); await settle();
    assert.equal(app.hook.tasks['project-one'].id, original.id);
    assert.equal(app.hook.tasks['project-one'].progress, 58);
    assert.equal(app.hook.tasks['project-one'].createdAt, original.createdAt);
    assert.deepEqual(network.requests.map((request) => request.method), ['GET', 'GET']);
  } finally { app.dispose(); }
});

test('polling advances the cursor and progress while recovering from a connection failure', async () => {
  const network = transport(), app = mount(network);
  try {
    network.requests[0].respond({ cursor: 110, tasks: [task()] }); await settle();
    await app.poll(); assert.equal(network.requests[1].url, '/api/productions?after=110');
    network.requests[1].fail(); await settle();
    assert.equal(app.hook.connectionLost, true); assert.equal(app.hook.tasks['project-one'].progress, 42);
    await app.poll(); assert.equal(network.requests[2].url, '/api/productions?after=110', 'failure must not advance the cursor');
    network.requests[2].respond({ cursor: 130, tasks: [task({ updatedAt: 130, progress: 76, phase: 'rendering' })] }); await settle();
    assert.equal(app.hook.connectionLost, false); assert.equal(app.hook.tasks['project-one'].progress, 76);
    assert.equal(app.updates.length, 2); assert.equal(app.finished.length, 0);
  } finally { app.dispose(); }
});

test('unmount aborts an in-flight GET, clears polling and ignores its late task without DELETE', async () => {
  const network = transport(), app = mount(network), request = network.requests[0];
  assert.equal(request.method, 'GET'); assert.equal(request.signal.aborted, false);
  app.dispose(); assert.equal(request.signal.aborted, true);
  request.respond({ cursor: 110, tasks: [task()] }); await settle();
  assert.deepEqual(app.updates, []); assert.deepEqual(app.finished, []); assert.equal(app.timers.size, 0);
  assert.deepEqual(network.requests.map((entry) => entry.method), ['GET']);
});

test('unmount leaves an accepted submission independent of the UI and never sends a cancellation', async () => {
  const network = transport(), app = mount(network);
  const submitting = app.hook.submit(task().project, ['commons']);
  const get = network.requests[0], post = network.requests[1];
  assert.equal(post.method, 'POST'); assert.equal(post.url, '/api/productions');
  app.dispose(); assert.equal(get.signal.aborted, true); assert.equal(post.signal.aborted, false);
  post.respond(task({ status: 'queued', phase: 'queued', progress: 0 }));
  assert.equal((await submitting).id, 'task-original');
  get.respond({ cursor: 0, tasks: [] }); await settle();
  assert.deepEqual(network.requests.map((entry) => entry.method), ['GET', 'POST']);
  assert.equal(app.timers.size, 0);
});

test('only explicit cancel sends DELETE and publishes the stopped task', async () => {
  const network = transport(), app = mount(network);
  try {
    network.requests[0].respond({ cursor: 110, tasks: [task()] }); await settle();
    assert.ok(network.requests.every((entry) => entry.method !== 'DELETE'));
    const stopping = app.hook.cancel('task-original');
    const request = network.requests[1];
    assert.equal(request.method, 'DELETE'); assert.equal(request.url, '/api/productions/task-original');
    request.respond(task({ status: 'cancelled', updatedAt: 140, message: '已停止制作，草稿已保留' })); await stopping; await settle();
    assert.equal(app.hook.tasks['project-one'].status, 'cancelled');
    assert.deepEqual(app.finished.map((entry) => entry.status), ['cancelled']);
  } finally { app.dispose(); }
  assert.equal(network.requests.filter((entry) => entry.method === 'DELETE').length, 1);
});

test('a late older task and stale revisions cannot overwrite a newer task for the same project', async () => {
  const network = transport(), app = mount(network);
  try {
    const submitting = app.hook.submit(task().project, ['commons']);
    const newer = task({ id: 'task-remake', createdAt: 200, updatedAt: 210, progress: 10 });
    network.requests[1].respond(newer); await submitting; await settle();
    network.requests[0].respond({ cursor: 999, tasks: [task({ updatedAt: 999, progress: 100, status: 'done' })] }); await settle();
    assert.equal(app.hook.tasks['project-one'].id, 'task-remake'); assert.equal(app.hook.tasks['project-one'].progress, 10);
    await app.poll();
    network.requests[2].respond({ cursor: 1000, tasks: [task({ ...newer, updatedAt: 205, progress: 5 })] }); await settle();
    assert.equal(app.hook.tasks['project-one'].updatedAt, 210);
    assert.deepEqual(app.updates.map((entry) => entry.id), ['task-remake']);
    assert.deepEqual(app.finished, []);
  } finally { app.dispose(); }
});

test('completion notifies once and the hook performs no navigation at its callback boundary', async () => {
  const network = transport(), completion = [], app = mount(network, { onFinished: (value) => completion.push(value.id) });
  try {
    network.requests[0].respond({ cursor: 110, tasks: [task()] }); await settle();
    await app.poll();
    const complete = task({ status: 'done', phase: 'reviewing', progress: 100, updatedAt: 150, finishedAt: 150 });
    network.requests[1].respond({ cursor: 150, tasks: [complete] }); await settle();
    assert.deepEqual(completion, ['task-original']); assert.equal(app.hook.tasks['project-one'].status, 'done');
    await app.poll(); network.requests[2].respond({ cursor: 150, tasks: [complete] }); await settle();
    assert.deepEqual(completion, ['task-original']); assert.deepEqual(app.navigation, []);
    assert.equal(globalThis.location.href, '/projects');
    assert.ok(network.requests.every((entry) => entry.method === 'GET'));
  } finally { app.dispose(); }
});
