import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const [id, cookie, output] = process.argv.slice(2);
if (!/^[a-f0-9-]{36}$/.test(id || '') || !cookie || !output) throw Error('Usage: node verify-cloud-production.mjs TASK COOKIE_FILE REPORT_JSON');
const origin = 'https://gomotion-mvp.vercel.app';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const report = { at: new Date().toISOString(), taskId: id, origin, observations: [], passed: false, browserVerified: false, submittedByThisScript: false };
const folder = await mkdtemp(path.join(os.tmpdir(), 'gomotion-cloud-accept-'));
const curl = async (route, args = []) => exec('curl', [...(proxy ? ['--proxy', proxy] : []), '--silent', '--show-error', '--max-time', '180', '--cookie', cookie, ...args, `${origin}${route}`], { maxBuffer: 16 * 1024 * 1024 });
try {
  let task;
  for (let i = 0; i < 120; i++) {
    task = JSON.parse((await curl(`/api/productions/${id}`)).stdout);
    if (task.error) throw Error(task.error);
    const observation = { at: new Date().toISOString(), status: task.status, phase: task.phase, progress: task.progress, scenes: task.project.scenes.length };
    if (JSON.stringify({ ...observation, at: null }) !== JSON.stringify({ ...report.observations.at(-1), at: null })) { report.observations.push(observation); process.stdout.write(JSON.stringify(observation) + '\n'); }
    report.status = task.status; report.message = task.message; report.createdAt = task.createdAt; report.startedAt = task.startedAt; report.finishedAt = task.finishedAt;
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    if (!['queued', 'running'].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (task.status !== 'done') throw Error(`Task not complete: ${task.status}`);
  report.project = { title: task.project.title, scenes: task.project.scenes.length, allScenesFilled: task.project.scenes.every((s) => s.selected), profile: task.project.videoProfile, duration: task.project.narrationTrack?.duration, reviewPassed: task.project.videoReview?.passed, audioReviewed: task.project.videoReview?.audioReviewed, sequenceComplete: task.project.sequenceReport?.complete, exportId: task.project.exportId };
  report.productionSeconds = (task.finishedAt - task.createdAt) / 1000;
  const route = task.project.exportUrl;
  const range = path.join(folder, 'range.bin'), headers = path.join(folder, 'range.headers');
  const partial = await curl(route, ['--range', '0-31', '--output', range, '--dump-header', headers, '--write-out', '%{http_code}']);
  report.range = { status: Number(partial.stdout), bytes: (await readFile(range)).length, contentRange: (await readFile(headers, 'utf8')).match(/^content-range:\s*(.+)$/im)?.[1]?.trim() };
  if (report.range.status !== 206 || report.range.bytes !== 32) throw Error('Same-origin Range playback failed');
  const movie = output.replace(/\.json$/, '.mp4');
  const full = await curl(route, ['--output', movie, '--write-out', '%{http_code}']);
  if (full.stdout !== '200') throw Error('Movie download failed');
  const bytes = await readFile(movie); report.bytes = bytes.length; report.sha256 = createHash('sha256').update(bytes).digest('hex');
  report.media = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate', '-of', 'json', movie])).stdout);
  await exec('ffmpeg', ['-v', 'error', '-i', movie, '-f', 'null', '-']); report.fullDecode = true;
  report.extras = {};
  for (const name of ['captions.srt', 'sources.json']) {
    const target = path.join(folder, name);
    report.extras[name] = Number((await curl(`/api/exports/${task.project.exportId}/${name}`, ['--output', target, '--write-out', '%{http_code}'])).stdout);
  }
  if (Object.values(report.extras).some((status) => status !== 200)) throw Error('Export sidecar is unavailable');
  report.passed = report.project.allScenesFilled && report.project.reviewPassed && report.project.sequenceComplete && report.fullDecode;
} catch (e) { report.error = e.message.replace(/https?:\/\/\S+/g, '[service URL]'); process.exitCode = 1; }
finally { await writeFile(output, JSON.stringify(report, null, 2) + '\n'); await rm(folder, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify({ passed: report.passed, status: report.status, error: report.error, productionSeconds: report.productionSeconds, duration: report.project?.duration, range: report.range }) + '\n');
