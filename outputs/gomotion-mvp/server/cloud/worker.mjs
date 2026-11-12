import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile, rm, copyFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { musicLicenseError } from '../music-sources.mjs';
import { verifiedNarrationChunkFiles } from '../narration-chunks.mjs';
import { MAX_UPLOAD_FILES, MAX_CHECKPOINT_FILES } from './checkpoint-limits.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = async (file) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); };
const typeOf = (file) => ({ '.mp4': 'video/mp4', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.srt': 'text/plain' }[path.extname(file)] || 'application/octet-stream');
export async function ensureLocalProduction(local, input, fetchImpl = fetch) {
  const list = await fetchImpl(`${local}/api/productions`).then((r) => r.json());
  const matches = list.tasks.filter((t) => t.project.id === input.project.id);
  const active = matches.find((t) => ['queued', 'running'].includes(t.status));
  const saved = matches.at(-1);
  if (active || saved?.status === 'done') return active || saved;
  // A terminal local draft needs a new local attempt; preserve the server's
  // saved project and verified chunk paths rather than restarting from input.
  const resumed = saved ? { ...input, project: saved.project } : input;
  const response = await fetchImpl(`${local}/api/productions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resumed) });
  if (!response.ok) throw Error('Video worker rejected the task');
  return response.json();
}
export async function checkpointUploadGrants(files, callback) {
  if (files.length > MAX_CHECKPOINT_FILES) throw Error('Checkpoint file count exceeded');
  const uploads = [];
  for (let offset = 0; offset < files.length; offset += MAX_UPLOAD_FILES) {
    const result = await callback('upload-request', { files: files.slice(offset, offset + MAX_UPLOAD_FILES) });
    if (result.cancelRequested) return result;
    uploads.push(...result.uploads);
  }
  return { uploads, cancelRequested: false };
}
export function checkpointTarget(work, relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || relative.split('/').some((p) => !p || p === '..' || p === '.') || !/^[a-zA-Z0-9/_ .-]+$/.test(relative)) throw Error('Invalid checkpoint path');
  const file = path.resolve(work, relative);
  if (!file.startsWith(path.resolve(work) + path.sep)) throw Error('Invalid checkpoint path');
  return file;
}
export async function hydrateCheckpoint(work, files, fetchImpl = fetch) {
  await mkdir(work, { recursive: true });
  for (const item of files || []) {
    const target = checkpointTarget(work, item.relativePath);
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || '') || !Number.isSafeInteger(item.size) || item.size > 512 * 1024 * 1024) throw Error('Invalid checkpoint receipt');
    const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw Error('Checkpoint download failed');
    await mkdir(path.dirname(target), { recursive: true });
    const { createWriteStream } = await import('node:fs');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
    if ((await stat(target)).size !== item.size || await digest(target) !== item.sha256) { await rm(target, { force: true }); throw Error('Checkpoint integrity failed'); }
  }
}
export async function checkpointFiles(work, task, staging) {
  const wanted = new Set(['assets.json', 'productions/jobs.json']);
  const add = (file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    const relative = path.relative(work, file);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) wanted.add(relative);
  };
  let catalog = [];
  try { catalog = JSON.parse(await readFile(path.join(work, 'assets.json'), 'utf8')); } catch {}
  const assets = new Map(catalog.map((a) => [a.id, a]));
  const project = task.project;
  // Carry only complete, attributable music originals across worker restarts.
  // Part files and receipts whose bytes no longer match never become uploads.
  const musicDirectory = path.join(work, 'music-sources');
  let musicReceipts = [];
  try { musicReceipts = (await readdir(musicDirectory)).filter((name) => /^[a-f0-9]{64}\.audio\.json$/.test(name)).slice(0, 8); } catch {}
  for (const name of musicReceipts) {
    try {
      const receipt = JSON.parse(await readFile(path.join(musicDirectory, name), 'utf8'));
      const audio = path.join(musicDirectory, name.slice(0, -5));
      const expectedName = createHash('sha256').update(JSON.stringify([receipt.url, receipt.license, receipt.licenseUrl])).digest('hex') + '.audio.json';
      const info = await stat(audio);
      if (name !== expectedName || musicLicenseError(receipt) || receipt.fullDecode !== true || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '') || !info.isFile() || info.size !== receipt.bytes || info.size > 48 * 1024 * 1024 || await digest(audio) !== receipt.sha256) continue;
      add(audio); add(path.join(musicDirectory, name));
    } catch {}
  }
  for (const scene of project.scenes) {
    const asset = assets.get(scene.selected?.id) || scene.selected;
    if (!asset) continue;
    add(asset.localPath); add(asset.thumbnailPath);
    if (asset.playbackKey) { wanted.add(`playback/${asset.playbackKey}.mp4`); wanted.add(`playback/${asset.playbackKey}.jpg`); }
    for (const source of [...(asset.sourceAssets || []), ...(scene.motionGraphic?.sourceAssets || [])]) { add(source.localPath); add(source.decodedPath); }
  }
  const key = project.narrationTrack?.key;
  if (/^[a-f0-9]{64}$/.test(key || '')) { wanted.add(`narration/${key}.wav`); wanted.add(`narration/${key}.json`); }
  for (const file of await verifiedNarrationChunkFiles(work, project.narrationWork)) add(file);
  if (!['queued', 'running'].includes(task.status) && /^[a-f0-9-]{36}$/.test(project.exportId || '')) for (const name of ['video.mp4', 'captions.srt', 'sources.json']) wanted.add(`${project.exportId}/${name}`);
  const files = [];
  for (const relativePath of wanted) {
    let target = checkpointTarget(work, relativePath);
    let info; try { info = await stat(target); } catch { continue; }
    if (!info.isFile() || !info.size) continue;
    if (info.size > 512 * 1024 * 1024) throw Error('Checkpoint file exceeds upload limit');
    if (staging) {
      const copy = checkpointTarget(staging, relativePath);
      await mkdir(path.dirname(copy), { recursive: true });
      if (relativePath === 'productions/jobs.json') await writeFile(copy, JSON.stringify([task]));
      else await copyFile(target, copy);
      target = copy; info = await stat(target);
    }
    files.push({ relativePath, size: info.size, contentType: typeOf(target), sha256: await digest(target) });
  }
  if (staging && project.narrationWork?.key) {
    // Generation may finish another chunk while staging is copied. Publish only
    // receipt/audio pairs that still agree in the immutable checkpoint copy.
    const valid = new Set((await verifiedNarrationChunkFiles(staging, project.narrationWork)).map((file) => path.relative(staging, file)));
    const prefix = `narration/chunks/${project.narrationWork.key}/`;
    return files.filter((file) => !file.relativePath.startsWith(prefix) || valid.has(file.relativePath));
  }
  return files;
}

export async function runCloudWorker(envelope, { fetchImpl = fetch, work = process.env.GOMOTION_DATA_DIR || '/vercel/sandbox/work', app = '/vercel/sandbox/app' } = {}) {
  if (envelope.version !== 1 || !envelope.callbackURL?.startsWith('https://') || !envelope.workerToken) throw Error('Invalid worker envelope');
  await mkdir(work, { recursive: true });
  // Multiple detached launch commands for the same attempt share this atomic
  // lock. A control-plane retry cannot start a second generation in the VM.
  const lock = path.join(work, '.cloud-worker-lock');
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') return; throw e; }
  let sequence = 0, child, localTask, heartbeat, cancelled = false, phase = 'hydrating', stderr = '';
  const local = 'http://127.0.0.1:3027';
  const callback = async (type, payload = {}) => {
    const body = JSON.stringify({ version: 1, taskId: envelope.taskId, attempt: envelope.attempt, sequence: ++sequence, type, payload });
    let response;
    for (let i = 0; i < 3; i++) {
      try { response = await fetchImpl(envelope.callbackURL, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${envelope.workerToken}`, ...(envelope.callbackBypass ? { 'x-vercel-protection-bypass': envelope.callbackBypass } : {}) }, body, signal: AbortSignal.timeout(150_000) }); if (response.ok || response.status < 500) break; }
      catch (e) { if (i === 2) throw e; }
      await sleep(1000 * 2 ** i);
    }
    if (!response?.ok) throw Error(`Checkpoint update failed (${response?.status})`);
    const result = await response.json();
    if (result.cancelRequested && !cancelled) { cancelled = true; if (localTask) await fetchImpl(`${local}/api/productions/${localTask.id}`, { method: 'DELETE' }).catch(() => {}); }
    return result;
  };
  try {
    await hydrateCheckpoint(work, envelope.checkpoint?.files, fetchImpl);
    phase = 'starting';
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: app, env: { ...process.env, GOMOTION_DATA_DIR: work, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3027' }, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-6000); });
    let startupError;
    child.once('error', (e) => { startupError = e; });
    for (let i = 0; ; i++) {
      if (startupError || child.exitCode !== null || i > 100) throw Error('Video worker did not start');
      if (await fetchImpl(`${local}/api/health`).then((r) => r.ok).catch(() => false)) break;
      await sleep(300);
    }
    let heartbeatRunning = false;
    heartbeat = setInterval(() => { if (heartbeatRunning) return; heartbeatRunning = true; void callback('heartbeat').catch(() => {}).finally(() => { heartbeatRunning = false; }); }, 10_000);
    phase = 'submitting';
    localTask = await ensureLocalProduction(local, envelope.input, fetchImpl);
    const uploaded = new Map((envelope.checkpoint?.files || []).map((f) => [f.relativePath, f]));
    let lastCheckpoint = 0;
    phase = 'producing';
    for (;;) {
      const response = await fetchImpl(`${local}/api/productions/${localTask.id}`);
      if (!response.ok) throw Error('Video task is unavailable');
      localTask = await response.json();
      if (cancelled) return;
      const terminal = !['running', 'queued'].includes(localTask.status);
      if (terminal || Date.now() - lastCheckpoint > 15_000) {
        const staging = await mkdtemp(path.join(path.dirname(work), 'gomotion-checkpoint-'));
        try {
        const files = await checkpointFiles(work, localTask, staging);
        const changed = files.filter((f) => uploaded.get(f.relativePath)?.sha256 !== f.sha256);
        const prepared = await checkpointUploadGrants(changed, callback);
        if (cancelled) return;
        for (const file of changed) {
          const grant = prepared.uploads.find((f) => f.relativePath === file.relativePath);
          if (!grant) throw Error('Missing upload authorization');
          if (!grant.exists) {
            let result;
            for (let attempt = 0; attempt < 3; attempt++) {
              result = await fetchImpl(grant.url, { method: 'PUT', headers: { 'Content-Type': file.contentType, 'x-content-type': file.contentType, 'Content-Length': String(file.size) }, body: createReadStream(checkpointTarget(staging, file.relativePath)), duplex: 'half', signal: AbortSignal.timeout(180_000) });
              if (result.ok || ![408, 429, 500, 502, 503, 504].includes(result.status)) break;
              await result.body?.cancel(); await sleep(1000 * 2 ** attempt);
            }
            if (!result.ok) throw Error(`Checkpoint upload failed (${result.status}, ${file.relativePath})`);
          }
          uploaded.set(file.relativePath, { ...file, blobRef: grant.blobRef });
        }
        const result = await callback(terminal ? 'complete' : 'checkpoint', { task: localTask, files: files.map((f) => uploaded.get(f.relativePath)) });
        if (result.cancelRequested || terminal) return;
        lastCheckpoint = Date.now();
        } finally { await rm(staging, { recursive: true, force: true }); }
      } else await callback('progress', { task: localTask });
      await sleep(2000);
    }
  } catch (e) {
    let detail = `${e.message}\n${stderr}`.replace(/https?:\/\/\S+/g, '[service URL]');
    for (const [key, value] of Object.entries(process.env)) if (/KEY$|TOKEN$|SECRET$/.test(key) && value) detail = detail.replaceAll(value, '[redacted]');
    if (!cancelled) await callback('failed', { failure: { phase, detail: detail.slice(-6000) } }).catch(() => {});
    throw e;
  } finally { clearInterval(heartbeat); child?.kill('SIGTERM'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runCloudWorker(JSON.parse(await readFile(process.argv[2], 'utf8'))); }
  catch { process.stderr.write('Cloud video worker stopped before completion.\n'); process.exitCode = 1; }
}
