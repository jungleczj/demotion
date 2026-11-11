import { createBlobStore } from '../server/cloud/blob-store.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici');
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const folder = await mkdtemp(path.join(os.tmpdir(), 'gomotion-blob-probe-'));
const report = { at: new Date().toISOString(), modelCalls: 0, passed: false };
try {
  const video = path.join(folder, 'fixture.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:r=30:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', video]);
  if (made.status !== 0) throw Error('Local fixture encode failed');
  const bytes = await readFile(video);
  const receipt = { size: bytes.length, contentType: 'video/mp4', sha256: createHash('sha256').update(bytes).digest('hex') };
  const store = createBlobStore({ prefix: `gomotion/acceptance/${randomUUID()}` });
  report.stage = 'create-state';
  await store.change('state.json', () => ({ count: 0 }));
  report.stage = 'atomic-updates';
  await Promise.all([store.change('state.json', (v) => ({ count: v.count + 1 })), store.change('state.json', (v) => ({ count: v.count + 1 }))]);
  report.atomicUpdates = (await store.read('state.json')).value.count;
  if (report.atomicUpdates !== 2) throw Error('CAS update failed');
  const name = `files/${receipt.sha256}/fixture.mp4`;
  report.stage = 'issue-upload';
  const grant = await store.upload(name, receipt);
  const response = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': receipt.contentType }, body: bytes, signal: AbortSignal.timeout(60_000) });
  report.uploadStatus = response.status;
  if (!response.ok) throw Error('Signed upload failed');
  report.stage = 'verify-object'; await store.verify(grant.blobRef, receipt);
  report.integrity = true;
  report.idempotentUpload = (await store.upload(name, receipt)).exists === true;
  report.stage = 'caption-upload';
  const captions = Buffer.from('1\n00:00:00,000 --> 00:00:01,000\n云端字幕\n');
  const captionFile = { size: captions.length, sha256: createHash('sha256').update(captions).digest('hex'), contentType: 'text/plain' };
  const captionGrant = await store.upload(`files/${captionFile.sha256}/captions.srt`, captionFile);
  const captionPut = await fetch(captionGrant.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain', 'x-content-type': 'text/plain', 'Content-Length': String(captions.length) }, body: captions, signal: AbortSignal.timeout(60_000) });
  report.captionUploadStatus = captionPut.status;
  if (!captionPut.ok) throw Error(`Caption upload failed (${captionPut.status})`);
  await store.verify(captionGrant.blobRef, captionFile);
  report.stage = 'private-read'; const url = await store.download(grant.blobRef);
  const range = await fetch(url, { headers: { Range: 'bytes=0-31' }, signal: AbortSignal.timeout(30_000) });
  report.rangeStatus = range.status; report.rangeHeader = range.headers.get('content-range'); report.rangeBytes = (await range.arrayBuffer()).byteLength;
  if (range.status !== 206 || report.rangeBytes !== 32) throw Error('Private Range playback failed');
  const full = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  await writeFile(path.join(folder, 'download.mp4'), Buffer.from(await full.arrayBuffer()));
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(folder, 'download.mp4'), '-f', 'null', '-']);
  report.fullDecode = decoded.status === 0;
  if (!report.fullDecode) throw Error('Downloaded movie decode failed');
  report.passed = true;
} catch (e) {
  report.error = `${e.name}: ${e.message}${e.cause ? ` (${e.cause.code || ''} ${e.cause.message || ''})` : ''}`.replace(/https?:\/\/\S+/g, '[service URL]');
  for (const [key, value] of Object.entries(process.env)) if (/KEY$|SECRET$|TOKEN$/.test(key) && value) report.error = report.error.replaceAll(value, '[redacted]');
  process.exitCode = 1;
} finally { await rm(folder, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
