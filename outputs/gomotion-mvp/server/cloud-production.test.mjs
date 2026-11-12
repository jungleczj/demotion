import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCloudAPI, cloudConfigured } from './cloud/api.mjs';
import { createVercelHandler } from './vercel-api.mjs';
import { createCloudAuth } from './cloud/auth.mjs';
import { createCloudProductions } from './cloud/productions.mjs';
import { checkpointFiles, hydrateCheckpoint, ensureLocalProduction, checkpointUploadGrants } from './cloud/worker.mjs';
import { splitNarration } from './narration-chunks.mjs';
import { createSandboxExecutor } from './cloud/executor.mjs';
import { createBlobStore } from './cloud/blob-store.mjs';

const secret = 'offline-fixture-cloud-secret-32-characters';
const clone = (v) => v === undefined ? undefined : structuredClone(v);
function memory() {
  const records = new Map(); let queue = Promise.resolve(); const verified = [];
  return { records, verified,
    async read(name) { return records.has(name) ? { value: clone(records.get(name)) } : null; },
    change(name, fn) { const operation = queue.then(async () => { const next = await fn(clone(records.get(name)) || null); if (next !== undefined) records.set(name, clone(next)); return clone(records.get(name)); }); queue = operation.catch(() => {}); return operation; },
    async upload(name) { return { url: `https://private.example/upload/${name}`, blobRef: name }; },
    async verify(name, file) { verified.push({ name, file }); },
    async download(name) { return `https://private.example/read/${name}`; },
  };
}
function setup() {
  const store = memory(), starts = [], stops = [];
  let timestamp = 1794400000000;
  const now = () => timestamp;
  const executor = { async start(input) { starts.push(clone(input)); return { name: `sandbox-${input.task.id}-${input.task.attempt}`, commandId: 'cmd-1' }; }, async stop(input) { stops.push(input); }, async state() { return 'stopped'; } };
  const auth = createCloudAuth(secret, now);
  const manager = () => createCloudProductions({ store, executor, auth, now, callbackOrigin: 'https://studio.example' });
  return { store, executor, starts, stops, auth, manager, now, advance(ms) { timestamp += ms; } };
}
const input = () => ({ project: { id: randomUUID(), title: '海洋', script: '海浪不断涌向海岸，海洋的故事却远不止眼前这一片蓝色。', voice: 'gemini:Kore', language: 'zh-CN', voiceStyle: 'documentary', format: 'landscape', subtitles: true, createdAt: '2026-11-11T00:00:00.000Z', scenes: [] }, providers: ['pixabay', 'coverr'] });
const request = (path, data, cookie) => new Request(`https://studio.example${path}`, { ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(data) } : { headers: cookie ? { cookie } : {} }) });
const file = (relativePath, data = 'video', contentType = 'video/mp4') => ({ relativePath, size: Buffer.byteLength(data), sha256: createHash('sha256').update(data).digest('hex'), contentType });
async function callback(s, id, type, payload, sequence = 1, attempt) {
  const task = (await s.store.read(`tasks/${id}.json`)).value;
  const token = s.auth.worker(attempt ? { ...task, attempt } : task);
  return s.manager().callback(new Request('https://studio.example', { headers: { authorization: `Bearer ${token}` } }), id, { version: 1, taskId: id, attempt: attempt || task.attempt, sequence, type, payload });
}

test('cloud capability stays false until all resources and explicit activation are present', () => {
  assert.equal(cloudConfigured({}), false);
  assert.equal(cloudConfigured({ GOMOTION_CLOUD_ENABLED: '1', VISION_API_KEY: 'fixture' }), false);
  assert.equal(cloudConfigured({ GOMOTION_CLOUD_ENABLED: '1', VISION_API_KEY: 'fixture', GOMOTION_CLOUD_SECRET: secret, BLOB_STORE_ID: 'store_fixture', GOMOTION_SANDBOX_SNAPSHOT: 'snap_fixture' }), true);
});
test('native API enables Generate only with durable API, sets owner cookie, and accepts full Chinese script bytes', async () => {
  const s = setup();
  const handler = () => createVercelHandler({ env: {}, cloudAPI: createCloudAPI({ env: { GOMOTION_CLOUD_SECRET: secret }, store: s.store, executor: s.executor, now: s.now }) });
  const config = await handler()(request('/api/config'));
  assert.equal((await config.json()).render, true);
  const cookie = config.headers.get('set-cookie').split(';')[0];
  const draft = input(); draft.project.script = '海洋中的水流与海岸。'.repeat(300);
  assert.ok(Buffer.byteLength(JSON.stringify(draft)) > 6000);
  const response = await handler()(request('/api/productions', draft, cookie));
  assert.equal(response.status, 202); const task = await response.json();
  assert.equal(task.status, 'queued'); assert.equal(s.starts.length, 1);
  const saved = await handler()(request(`/api/productions/${task.id}`, null, cookie));
  assert.equal(saved.status, 200); assert.equal((await saved.json()).id, task.id);
});
test('concurrent duplicate submissions across instances create one execution; navigation does not cancel it', async () => {
  const s = setup(), draft = input();
  const tasks = await Promise.all([s.manager().submit('owner', draft), s.manager().submit('owner', draft), s.manager().submit('owner', draft)]);
  assert.equal(new Set(tasks.map((t) => t.id)).size, 1);
  assert.equal(s.starts.length, 1); assert.equal(s.stops.length, 0);
  assert.equal((await s.manager().list('owner')).tasks.length, 1);
  assert.equal((await s.manager().list('another-owner')).tasks.length, 0);
  await assert.rejects(s.manager().get('another-owner', tasks[0].id), { status: 404 });
});

test('native cloud API accepts 25,000 Chinese characters without truncation and rejects 25,001', async () => {
  const s = setup();
  const handler = createVercelHandler({ env: {}, cloudAPI: createCloudAPI({ env: { GOMOTION_CLOUD_SECRET: secret }, store: s.store, executor: s.executor, now: s.now }) });
  const cookie = (await handler(request('/api/config'))).headers.get('set-cookie').split(';')[0];
  const draft = input(); draft.project.script = '海'.repeat(25000);
  const accepted = await handler(request('/api/productions', draft, cookie));
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).project.script, draft.project.script);
  assert.equal(s.starts.length, 1);
  draft.project.id = randomUUID(); draft.project.script += '洋';
  assert.equal((await handler(request('/api/productions', draft, cookie))).status, 400);
  assert.equal(s.starts.length, 1, 'oversized input must not start any extra executor');
});
test('explicit cancellation is durable before stop and a late callback cannot resurrect a task', async () => {
  const s = setup(), task = await s.manager().submit('owner', input());
  const oldToken = s.auth.worker((await s.store.read(`tasks/${task.id}.json`)).value);
  assert.equal((await s.manager().cancel('owner', task.id)).status, 'cancelled');
  assert.equal(s.stops.length, 1);
  const result = await s.manager().callback(new Request('https://studio.example', { headers: { authorization: `Bearer ${oldToken}` } }), task.id, { version: 1, taskId: task.id, attempt: 1, sequence: 1, type: 'progress', payload: { task: { ...task, status: 'running' } } });
  assert.equal(result.cancelRequested, true);
  assert.equal((await s.manager().get('owner', task.id)).status, 'cancelled');
});
test('unverified progress cannot expose media; completed video requires a verified object and passed review', async () => {
  const s = setup(), task = await s.manager().submit('owner', input());
  const exportId = randomUUID(), video = file(`${exportId}/video.mp4`);
  video.blobRef = `files/${task.id}/${video.sha256}/${video.relativePath}`;
  const final = { ...task, status: 'done', progress: 100, project: { ...task.project, exportId, exportUrl: `/api/exports/${exportId}/video.mp4`, sequenceReport: { complete: true }, videoReview: { passed: true }, scenes: [{ id: 's1', selected: { id: 'pixabay:1' } }] } };
  await callback(s, task.id, 'progress', { task: final });
  assert.equal((await s.manager().get('owner', task.id)).project.scenes.length, 0);
  await assert.rejects(callback(s, task.id, 'complete', { task: final }, 2), { status: 409 });
  await callback(s, task.id, 'complete', { task: final, files: [video] }, 3);
  assert.equal(s.store.verified.length, 1);
  assert.equal((await s.manager().get('owner', task.id)).status, 'done');
  assert.match(await s.manager().exported('owner', exportId, 'video.mp4'), /https:\/\/private.example/);
  await assert.rejects(s.manager().exported('intruder', exportId, 'video.mp4'), { status: 404 });
  assert.equal(s.stops.length, 1);
});
test('worker cannot register another task object or arbitrary filesystem path as its own upload', async () => {
  const s = setup(), task = await s.manager().submit('owner', input());
  await assert.rejects(callback(s, task.id, 'upload-request', { files: [file('../secrets.mp4')] }), { status: 400 });
  const fake = { ...file(`${randomUUID()}/video.mp4`), blobRef: 'files/another-task/video.mp4' };
  await assert.rejects(callback(s, task.id, 'checkpoint', { task, files: [fake] }), { status: 403 });
  const stored = (await s.store.read(`tasks/${task.id}.json`)).value;
  await assert.rejects(s.manager().callback(new Request('https://studio.example', { headers: { authorization: `Bearer ${s.auth.worker(stored)}x` } }), task.id, {}), { status: 401 });
});
test('restart uses committed checkpoint in a new attempt and fences the previous worker', async () => {
  const s = setup(), task = await s.manager().submit('owner', input());
  await callback(s, task.id, 'checkpoint', { task }, 1);
  s.advance(91_000);
  await s.manager().list('owner');
  assert.equal(s.starts.length, 2);
  assert.equal(s.starts[1].task.attempt, 2);
  assert.equal(s.starts[1].checkpoint.task.id, task.id);
  await assert.rejects(callback(s, task.id, 'progress', { task }, 2, 1), { status: 401 });
  assert.equal((await s.manager().get('owner', task.id)).id, task.id);
});
test('retrying the same failed input retains verified media and resumes its committed checkpoint', async () => {
  const s = setup(), draft = input(), task = await s.manager().submit('owner', draft);
  const saved = { ...task, status: 'running', project: { ...task.project, scenes: [{ id: 's1', text: '海浪', selected: { id: 'pixabay:1' } }] } };
  const media = file(`playback/${'a'.repeat(64)}.mp4`); media.blobRef = `files/${task.id}/${media.sha256}/${media.relativePath}`;
  await callback(s, task.id, 'checkpoint', { task: saved, files: [media] });
  await callback(s, task.id, 'failed', { failure: { phase: 'producing', detail: 'upload failed' } }, 2);
  await s.manager().submit('owner', draft);
  assert.equal(s.starts.length, 2); assert.equal(s.starts[1].task.attempt, 2);
  assert.equal(s.starts[1].checkpoint.task.project.scenes[0].selected.id, 'pixabay:1');
  assert.equal(s.starts[1].checkpoint.files[0].sha256, media.sha256);
});
test('cancellation while an execution is starting stops the late VM rather than leaving it running', async () => {
  const s = setup();
  s.executor.start = async ({ task }) => { await s.manager().cancel('owner', task.id); return { name: 'late-vm' }; };
  const task = await s.manager().submit('owner', input());
  assert.equal(task.status, 'cancelled');
  assert.deepEqual(s.stops, [{ name: 'late-vm' }]);
});
test('private checkpoint metadata is not downloadable through the public artifact route', async () => {
  const s = setup(), task = await s.manager().submit('owner', input());
  const data = file('productions/jobs.json', '{}', 'application/json'); data.blobRef = `files/${task.id}/${data.sha256}/${data.relativePath}`;
  await callback(s, task.id, 'checkpoint', { task, files: [data] });
  await assert.rejects(s.manager().file('owner', task.id, data.relativePath), { status: 404 });
});
test('25,000-character narration checkpoints support all chunk receipts and still reject an oversized file list', async () => {
  const s = setup(), draft = input(); draft.project.script = '海'.repeat(25000);
  const task = await s.manager().submit('owner', draft);
  const chunks = splitNarration(draft.project.script, 'documentary'), key = 'b'.repeat(64);
  const files = chunks.flatMap((_, index) => {
    const chunk = createHash('sha256').update(String(index)).digest('hex');
    return [file(`narration/chunks/${key}/${chunk}.wav`, 'tone fixture', 'audio/wav'), file(`narration/chunks/${key}/${chunk}.json`, '{}', 'application/json')];
  });
  files.push(file(`narration/chunks/${key}/manifest.json`, '{}', 'application/json'), file('assets.json', '[]', 'application/json'), file('productions/jobs.json', '[]', 'application/json'));
  assert.ok(files.length > 200, 'fixture must reproduce the former production cap');
  let sequence = 0, batches = 0;
  const grants = await checkpointUploadGrants(files, async (type, payload) => { batches++; assert.ok(payload.files.length <= 200); return callback(s, task.id, type, payload, ++sequence); });
  assert.equal(batches, Math.ceil(files.length / 200));
  assert.equal(grants.uploads.length, files.length);
  const committed = files.map((f) => ({ ...f, blobRef: grants.uploads.find((g) => g.relativePath === f.relativePath).blobRef }));
  await callback(s, task.id, 'checkpoint', { task, files: committed }, ++sequence);
  assert.equal(Object.keys((await s.store.read(`tasks/${task.id}.json`)).value.files).length, files.length);
  await assert.rejects(callback(s, task.id, 'upload-request', { files: Array.from({ length: 2049 }, () => files[0]) }, 3), { status: 400 });
  await assert.rejects(callback(s, task.id, 'checkpoint', { task, files: Array.from({ length: 2049 }, () => committed[0]) }, 4), { status: 400 });
});
test('cloud worker retries terminal drafts with their saved project and reuses an already active task', async () => {
  const draft = input(), local = 'http://127.0.0.1:fixture';
  for (const status of ['error', 'incomplete', 'cancelled']) {
    const saved = { id: randomUUID(), status, project: { ...draft.project, narrationWork: { key: 'a'.repeat(64) }, scenes: [{ id: 'saved-scene', text: '原文', selected: { id: 'fixture:retained' } }] } };
    let posted;
    const result = await ensureLocalProduction(local, draft, async (url, options) => {
      assert.equal(url, local + '/api/productions');
      if (!options?.method) return Response.json({ tasks: [saved] });
      posted = JSON.parse(options.body); return Response.json({ id: 'new-local-task', status: 'queued', project: posted.project });
    });
    assert.equal(result.status, 'queued'); assert.deepEqual(posted.project, saved.project);
    assert.deepEqual(posted.providers, draft.providers);
  }
  const failed = { id: 'old', status: 'error', project: draft.project }, running = { id: 'current', status: 'running', project: draft.project };
  const fetchExisting = async (_url, options) => { assert.ok(!options?.method, 'active or completed tasks must not be resubmitted'); return Response.json({ tasks: [failed, running] }); };
  assert.equal((await ensureLocalProduction(local, draft, fetchExisting)).id, running.id);
  assert.equal((await ensureLocalProduction(local, draft, async () => Response.json({ tasks: [{ ...running, status: 'done' }] }))).status, 'done');
});
test('checkpoint hydration checks bytes and hashes and rejects directory traversal', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'gomotion-cloud-hydrate-'));
  try {
    const receipt = { ...file('narration/fixture.wav', 'sound', 'audio/wav'), url: 'https://private.example/fixture' };
    await hydrateCheckpoint(work, [receipt], async () => new Response('sound'));
    assert.equal(await readFile(path.join(work, receipt.relativePath), 'utf8'), 'sound');
    await assert.rejects(hydrateCheckpoint(work, [receipt], async () => new Response('wrong')), /integrity/);
    await assert.rejects(hydrateCheckpoint(work, [{ ...receipt, relativePath: '../outside' }], async () => new Response('sound')), /path/);
  } finally { await rm(work, { recursive: true, force: true }); }
});
test('checkpoint snapshots freeze mutable JSON and exclude a partially rendered movie', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'gomotion-cloud-files-'));
  const staging = await mkdtemp(path.join(os.tmpdir(), 'gomotion-cloud-staging-'));
  try {
    await mkdir(path.join(work, 'productions')); await writeFile(path.join(work, 'assets.json'), '[]'); await writeFile(path.join(work, 'productions/jobs.json'), '[]');
    const exportId = randomUUID(); await mkdir(path.join(work, exportId)); await writeFile(path.join(work, exportId, 'video.mp4'), 'unfinished');
    const task = { status: 'running', project: { ...input().project, exportId } };
    const files = await checkpointFiles(work, task, staging);
    assert.ok(!files.some((f) => f.relativePath.endsWith('video.mp4')));
    await writeFile(path.join(work, 'assets.json'), '[{"changed":true}]');
    assert.equal(await readFile(path.join(staging, 'assets.json'), 'utf8'), '[]');
    assert.equal(JSON.parse(await readFile(path.join(staging, 'productions/jobs.json')))[0].project.exportId, exportId);
  } finally { await rm(work, { recursive: true, force: true }); await rm(staging, { recursive: true, force: true }); }
});
test('Sandbox starts a detached worker from a key-free snapshot and injects credentials only into execution', async () => {
  const writes = [], commands = []; let options;
  const sdk = { async getOrCreate(input) { options = input; return { async writeFiles(files) { writes.push(...files); }, async runCommand(input) { commands.push(input); return { cmdId: 'cmd-offline' }; } }; } };
  const result = await createSandboxExecutor({ sdk, env: { GOMOTION_SANDBOX_SNAPSHOT: 'snap-fixture', GEMINI_API_KEY: 'private-provider-key' } }).start({ task: { id: randomUUID(), attempt: 1, input: input() }, callbackURL: 'https://studio.example/callback', workerToken: 'scoped-fixture-token' });
  assert.equal(options.source.type, 'snapshot'); assert.equal(options.persistent, false);
  assert.equal(commands[0].detached, true); assert.equal(commands[0].env.GEMINI_API_KEY, 'private-provider-key');
  assert.doesNotMatch(writes[0].content.toString(), /private-provider-key/);
  assert.equal(result.commandId, 'cmd-offline');
});

test('cloud checkpoints retain verified music original and license receipt but exclude partial or changed bytes', async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'gomotion-cloud-music-'));
  try {
    const record = { kind: 'audio', provider: 'scottbuckley', author: 'Scott Buckley', attribution: 'Offline storage fixture only', url: 'https://www.scottbuckley.com.au/library/fixture.mp3', sourceUrl: 'https://www.scottbuckley.com.au/library/undertow/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', fullDecode: true, sha256: createHash('sha256').update('fixture-audio').digest('hex'), bytes: 13 };
    const key = createHash('sha256').update(JSON.stringify([record.url, record.license, record.licenseUrl])).digest('hex');
    const folder = path.join(work, 'music-sources'); await mkdir(folder);
    await writeFile(path.join(folder, `${key}.audio`), 'fixture-audio');
    await writeFile(path.join(folder, `${key}.audio.json`), JSON.stringify(record));
    await writeFile(path.join(folder, `${key}.audio.download.part`), 'unfinished');
    const task = { status: 'running', project: input().project };
    const files = await checkpointFiles(work, task);
    assert.deepEqual(files.map(f => f.relativePath).sort(), [`music-sources/${key}.audio`, `music-sources/${key}.audio.json`]);
    await writeFile(path.join(folder, `${key}.audio`), 'changed-audio');
    assert.deepEqual(await checkpointFiles(work, task), []);
  } finally { await rm(work, {recursive:true, force:true}); }
});
test('private Blob compare-and-swap retries contention rather than losing another update', async () => {
  let saved = { count: 0 }, etag = '0', conflicted = false; const options = [];
  const sdk = {
    async head() { return { etag }; },
    async get(_path, opts) { options.push(opts); return { stream: new Response(JSON.stringify(saved)).body, blob: { etag: 'W/"different-cdn-representation"' } }; },
    async put(_path, value, opts) { if (!conflicted) { conflicted = true; saved = { count: 5 }; etag = '1'; throw Object.assign(Error('conflict'), { name: 'BlobPreconditionFailedError' }); } assert.equal(opts.ifMatch, etag); saved = JSON.parse(value); etag = '2'; },
  };
  const store = createBlobStore({ sdk, env: { BLOB_STORE_ID: 'store-fixture' } });
  assert.equal((await store.change('test.json', (value) => ({ count: value.count + 1 }))).count, 6);
  assert.ok(options.every((v) => v.useCache === false && v.access === 'private'));
});

test('same-origin private media streams requested bytes and rejects an invalid Range without exposing Blob URLs', async () => {
  let observed;
  const sdk = { async head() { return { size: 100, contentType: 'video/mp4' }; }, async get(_name, options) { observed = options; return { stream: new Response('abcd').body, headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 4-7/100' }) }; } };
  const store = createBlobStore({ sdk, env: { BLOB_STORE_ID: 'fixture' } });
  const response = await store.serve('fixture.mp4', new Request('https://studio.example/api/media', { headers: { range: 'bytes=4-7' } }));
  assert.equal(response.status, 206); assert.equal(await response.text(), 'abcd');
  assert.equal(observed.headers.range, 'bytes=4-7'); assert.equal(response.headers.has('location'), false);
  assert.equal((await store.serve('fixture.mp4', new Request('https://studio.example/api/media', { headers: { range: 'bytes=100-' } }))).status, 416);
});

test('real Blob missing-object errors keep their generic Error name and are still treated as an absent file', async () => {
  const sdk = {
    async head() { throw Error('Vercel Blob: The requested blob does not exist'); },
    async issueSignedToken() { return {}; },
    async presignUrl() { return { presignedUrl: 'https://private.example/upload' }; },
  };
  const store = createBlobStore({ sdk, env: { BLOB_STORE_ID: 'fixture' } });
  assert.equal(await store.read('new-task.json'), null);
  assert.equal((await store.upload('new-file.mp4', { size: 4, contentType: 'video/mp4' })).url, 'https://private.example/upload');
});
