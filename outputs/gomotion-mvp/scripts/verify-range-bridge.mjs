import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureNetwork } from '../server/network.mjs';
import { outputProfile, mediaQualityError } from '../server/media-quality.mjs';
import { createRangeBridge, RangeUnsupportedError } from './range-bridge.mjs';

// Frozen public URLs recovered from saved production records. 4006 also appears
// in gomotion-hd-generation-2026-11-11.json; the two longer clips test 30s windows.
const fixtures = [
  { id: 'pixabay:4006', recordId: '9d1a7812-4e8f-4d4f-b89d-8f1456714c71', alsoInHdRecord: true, url: 'https://cdn.pixabay.com/video/2016/07/26/4006-176282263_medium.mp4', sourceUrl: 'https://pixabay.com/videos/id-4006/' },
  { id: 'pixabay:235', recordId: 'b93532ec-aae5-49a7-9a0a-5c09c7af6231', url: 'https://cdn.pixabay.com/video/2015/08/10/235-135862236_medium.mp4', sourceUrl: 'https://pixabay.com/videos/id-235/' },
  { id: 'pixabay:908', recordId: 'c94d4ed5-112f-46cd-9cbc-05643ee3941b', url: 'https://cdn.pixabay.com/video/2015/10/08/908-141851680_medium.mp4', sourceUrl: 'https://pixabay.com/videos/id-908/' },
];
const argument = (key, fallback) => process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const seconds = Number(argument('seconds', '30'));
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 30) throw new Error('Experiment window must be 2–30 seconds');
const selected = fixtures.filter((fixture) => !argument('only', '') || argument('only', '').split(',').includes(fixture.id.split(':')[1]));
if (!selected.length) throw new Error('Choose one of the frozen recorded fixture IDs');
const reportFile = path.resolve(argument('report', '../range-bridge-experiment-2026-11-11.json'));
const limit = 48 * 1024 * 1024;
const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Experiment cancelled')));
const network = configureNetwork();
const report = { date: new Date().toISOString(), seconds, proxy: { configured: network.configured, source: network.source },
  byteAccounting: 'Consumed upstream HTTP response-body bytes, including range probe and bounded block overfetch; excludes HTTP/TLS/proxy overhead and unconsumed bytes buffered by the transport after cancellation.',
  cacheScope: 'Cold means fresh experiment files and empty bridge block cache. No application playback cache is read. OS page cache and remote CDN cache are not purged or controlled. Warm runs reuse the complete local source or the same bridge RAM blocks.',
  results: [] };

function native(command, args, signal) {
  return new Promise((resolve, reject) => {
    // Native FFmpeg connects directly to loopback, never through HTTP_PROXY.
    // Node fetch retains configureNetwork's global CONNECT proxy configuration.
    const env = { ...process.env };
    for (const key of ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete env[key];
    const child = spawn(command, args, { env, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-12000); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve({ output, errors }) : reject(new Error(`${command} failed (${code}): ${errors.slice(-1800)}`)));
  });
}
const inputOptions = (input) => input.startsWith('http://127.0.0.1:') ? ['-http_proxy', '', '-protocol_whitelist', 'http,tcp'] : [];
async function probe(input, signal) {
  const { output } = await native('ffprobe', ['-v', 'error', ...inputOptions(input), '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,pix_fmt,codec_name', '-of', 'json', input], signal);
  const data = JSON.parse(output), video = data.streams.find((stream) => stream.codec_type === 'video');
  return { duration: Number(data.format.duration), width: video.width, height: video.height, fps: video.avg_frame_rate, pixelFormat: video.pix_fmt, codec: video.codec_name };
}
async function download(url, file, signal, budget = limit) {
  const started = performance.now(), response = await fetch(url, { redirect: 'manual', signal, headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'GoMotionLocalMVP/0.1 range-experiment' } });
  if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new Error(`Complete download HTTP ${response.status}`); }
  const declared = Number(response.headers.get('content-length'));
  if (declared > budget) { await response.body.cancel(); throw new Error('Complete source exceeds remaining 48MB budget'); }
  let bytes = 0;
  const handle = await open(file, 'wx');
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > budget) throw new Error('Complete download exceeds remaining 48MB budget');
      await handle.write(chunk);
    }
  } finally { await handle.close(); }
  if (declared && bytes !== declared) throw new Error('Incomplete complete-download body');
  return { bodyBytes: bytes, declaredBytes: declared || null, seconds: (performance.now() - started) / 1000 };
}
async function crop(input, info, signal) {
  const { errors } = await native('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-threads', '1', ...inputOptions(input), '-ss', '0', '-t', '3', '-i', input, '-an', '-vf', 'fps=6,cropdetect=limit=24:round=2:reset=0', '-f', 'null', '-'], signal);
  const matches = [...errors.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map((match) => match.slice(1).map(Number));
  const last = matches.at(-1);
  if (last && matches.length >= 5 && matches.slice(-5).every((value) => value.every((n, i) => Math.abs(n - last[i]) <= 2))) {
    const [w, h, x, y] = last;
    const centered = Math.abs(2 * x + w - info.width) <= 6 && Math.abs(2 * y + h - info.height) <= 6;
    const vertical = x > info.width * .035 && h >= info.height * .96 && y <= info.height * .02;
    const horizontal = y > info.height * .035 && w >= info.width * .96 && x <= info.width * .02;
    if (centered && (vertical || horizontal) && w * h >= info.width * info.height * .25) return `crop=${w}:${h}:${x}:${y},`;
  }
  return '';
}
async function normalize(input, file, signal) {
  const started = performance.now(), phases = {};
  const measure = async (name, action) => { const at = performance.now(); try { return await action(); } finally { phases[name] = (performance.now() - at) / 1000; } };
  const info = await measure('probeSeconds', () => probe(input, signal));
  const error = mediaQualityError(info.width, info.height, 'landscape'); if (error) throw new Error(error);
  const cropFilter = await measure('cropSeconds', () => crop(input, info, signal));
  const target = outputProfile('landscape'), duration = Math.min(seconds, info.duration);
  await measure('transcodeSeconds', () => native('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '1', '-filter_threads', '1', ...inputOptions(input), '-i', input, '-t', String(duration), '-map', '0:v:0', '-an', '-vf', `${cropFilter}scale=${target.width}:${target.height}:force_original_aspect_ratio=increase:force_divisible_by=2,setsar=1,fps=${target.fps},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '3000k', '-bufsize', '6000k', '-threads', '2', '-movflags', '+faststart', file], signal));
  const output = await measure('outputProbeSeconds', () => probe(file, signal));
  if (Math.abs(output.duration - duration) > .5) throw new Error('Output duration does not cover requested interval');
  return { seconds: (performance.now() - started) / 1000, phases, crop: cropFilter, source: info, output };
}
async function fingerprints(file, signal) {
  const { output } = await native('ffmpeg', ['-v', 'error', '-xerror', '-threads', '1', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], signal);
  const frames = output.split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').map((part) => part.trim()));
  return { frameCount: frames.length, pixelsAndTimestampsHash: createHash('sha256').update(JSON.stringify(frames)).digest('hex'), first: frames[0], last: frames.at(-1) };
}

await mkdir(path.dirname(reportFile), { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), 'gomotion-range-experiment-'));
try {
  for (const [index, fixture] of selected.entries()) {
    const folder = path.join(directory, fixture.id.replace(':', '-')); await mkdir(folder);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
    const record = { ...fixture, order: index % 2 ? 'range-first' : 'complete-first' };
    report.results.push(record);
    let bridge;
    try {
      const completeSource = path.join(folder, 'complete-source.mp4');
      const completeOutput = path.join(folder, 'complete-cold.mp4'), rangeOutput = path.join(folder, 'range-cold.mp4');
      const completeRun = async () => {
        const started = performance.now();
        const transfer = await download(fixture.url, completeSource, signal);
        const processing = await normalize(completeSource, completeOutput, signal);
        record.completeCold = { seconds: (performance.now() - started) / 1000, transfer, processing };
      };
      const rangeRun = async () => {
        const started = performance.now();
        try {
          bridge = await createRangeBridge({ sourceUrl: fixture.url, signal, timeoutMs: 180000 });
          const processing = await normalize(bridge.url, rangeOutput, signal);
          record.rangeCold = { seconds: (performance.now() - started) / 1000, usedRange: true, upstreamBodyBytes: bridge.stats.upstreamBodyBytes, processing };
        } catch (error) {
          if (!(error instanceof RangeUnsupportedError) && !bridge?.stats.fallbackRequired) throw error;
          const previousBytes = bridge?.stats.upstreamBodyBytes || error.stats?.upstreamBodyBytes || 0;
          await bridge?.close(); bridge = null;
          const transfer = await download(fixture.url, path.join(folder, 'fallback-complete.mp4'), signal, limit - previousBytes);
          const processing = await normalize(path.join(folder, 'fallback-complete.mp4'), rangeOutput, signal);
          record.rangeCold = { seconds: (performance.now() - started) / 1000, usedRange: false, fallbackReason: error.message, upstreamBodyBytes: previousBytes + transfer.bodyBytes, transfer, processing };
        }
      };
      if (index % 2) { await rangeRun(); await completeRun(); } else { await completeRun(); await rangeRun(); }
      const completeFingerprint = await fingerprints(completeOutput, signal), rangeFingerprint = await fingerprints(rangeOutput, signal);
      record.equivalence = { complete: completeFingerprint, range: rangeFingerprint,
        sourceMetadataEqual: JSON.stringify(record.completeCold.processing.source) === JSON.stringify(record.rangeCold.processing.source),
        outputMetadataEqual: JSON.stringify(record.completeCold.processing.output) === JSON.stringify(record.rangeCold.processing.output),
        cropEqual: record.completeCold.processing.crop === record.rangeCold.processing.crop,
        fullyDecoded: true, framePixelsAndTimestampsEqual: JSON.stringify(completeFingerprint) === JSON.stringify(rangeFingerprint) };
      if (!record.equivalence.sourceMetadataEqual || !record.equivalence.outputMetadataEqual || !record.equivalence.cropEqual || !record.equivalence.framePixelsAndTimestampsEqual) throw new Error('Range output differs from complete-download output');
      const warmComplete = await normalize(completeSource, path.join(folder, 'complete-warm.mp4'), signal);
      record.completeWarm = { upstreamBodyBytes: 0, ...warmComplete };
      if (bridge) {
        const bytes = bridge.stats.upstreamBodyBytes;
        const warmRange = await normalize(bridge.url, path.join(folder, 'range-warm.mp4'), signal);
        record.rangeWarm = { upstreamBodyBytes: bridge.stats.upstreamBodyBytes - bytes, ...warmRange };
        record.bridge = structuredClone(bridge.stats);
      }
      record.savings = { bodyBytes: record.completeCold.transfer.bodyBytes - record.rangeCold.upstreamBodyBytes,
        bodyFraction: 1 - record.rangeCold.upstreamBodyBytes / record.completeCold.transfer.bodyBytes,
        seconds: record.completeCold.seconds - record.rangeCold.seconds };
      record.status = 'passed';
      console.log(JSON.stringify({ id: fixture.id, completeSeconds: record.completeCold.seconds, rangeSeconds: record.rangeCold.seconds, completeBytes: record.completeCold.transfer.bodyBytes, rangeBytes: record.rangeCold.upstreamBodyBytes, savings: record.savings, equivalent: record.equivalence.framePixelsAndTimestampsEqual }));
    } catch (error) {
      record.status = 'failed'; record.error = error.message;
      if (bridge) record.bridge = structuredClone(bridge.stats);
      console.log(JSON.stringify({ id: fixture.id, status: record.status, error: error.message }));
    } finally {
      await bridge?.close();
      await writeFile(reportFile, JSON.stringify(report, null, 2));
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
report.finishedAt = new Date().toISOString();
await writeFile(reportFile, JSON.stringify(report, null, 2));
if (report.results.some((result) => result.status !== 'passed')) process.exitCode = 1;
