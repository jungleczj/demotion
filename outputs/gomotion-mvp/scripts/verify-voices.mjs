#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, copyFile } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let baseUrl = 'http://127.0.0.1:3027';
function acceptanceBaseUrl(args) {
  const index = args.indexOf('--base-url');
  if (index < 0) return 'http://127.0.0.1:3027';
  try {
    const value = args[index + 1];
    if (!value || value.startsWith('--') || args.lastIndexOf('--base-url') !== index) throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new Error('Acceptance endpoint must be a plain HTTP loopback origin'); }
}
const reportPath = path.resolve(appRoot, '../voice-live-acceptance-2026-11-11.json');
const stopStatuses = new Set([401, 402, 403, 429]);
export function roundBackupPath(round) {
  assert.ok(Number.isInteger(round) && round > 0, 'Backup round must be a positive integer');
  return path.resolve(appRoot, `../voice-live-acceptance-round${round}-2026-11-11.json`);
}

export function createPlan(voices, languages) {
  assert.equal(voices.length, 30, 'Expected the 30-voice catalog');
  assert.equal(new Set(voices.map((voice) => voice.key)).size, 30, 'Voice keys must be unique');
  assert.equal(languages.length, 15, 'Expected the 15-language catalog');
  assert.equal(new Set(languages.map((language) => language.code)).size, 15, 'Language codes must be unique');
  const chinese = languages.find((language) => language.code === 'zh-CN');
  assert.ok(chinese?.sample, 'Chinese sample is required');
  assert.ok(voices.some((voice) => voice.key === 'Kore'), 'Kore is required for the language sweep');
  const task = (voice, language, group) => ({
    id: `${voice}__${language.code}__documentary`, group, voiceKey: voice, language: language.code,
    request: { voice: `gemini:${voice}`, voiceStyle: 'documentary', language: language.code, text: language.sample },
  });
  const tasks = [
    ...voices.map((voice) => task(voice.key, chinese, 'all_voices_chinese')),
    ...languages.filter((language) => language.code !== 'zh-CN').map((language) => task('Kore', language, 'kore_other_languages')),
  ];
  assert.equal(tasks.length, 44); assert.equal(new Set(tasks.map((entry) => entry.id)).size, 44);
  return tasks;
}

export function resumePlan(tasks, previous) {
  assert.ok(Array.isArray(previous?.results), 'Resume needs an existing result report');
  const existing = new Map(previous.results.map((result) => [result.id, result]));
  assert.equal(existing.size, previous.results.length, 'Previous result IDs must be unique');
  assert.equal(existing.size, tasks.length, 'Previous report must cover the same task plan');
  const preserved = new Map();
  for (const task of tasks) {
    const result = existing.get(task.id);
    assert.ok(result, `Missing previous task ${task.id}`);
    assert.deepEqual(result.request, task.request, `Changed request for ${task.id}`);
    assert.ok(['success', 'failed', 'not_run'].includes(result.status), 'Only a finished report can be resumed');
    if (result.status === 'success') preserved.set(task.id, result);
  }
  return { pending: tasks.filter((task) => !preserved.has(task.id)), preserved };
}
const summarize = (results) => ({
  success: results.filter((result) => result.status === 'success').length,
  failed: results.filter((result) => result.status === 'failed').length,
  notRun: results.filter((result) => result.status === 'not_run').length,
  requestsStarted: results.filter((result) => result.requestStartedAt).length,
});

export function fatalStatus(status, message = '') {
  if (stopStatuses.has(status)) return status;
  const upstream = String(message).match(/\b(?:HTTP\s*)?(401|402|403|429)\b/i);
  return upstream ? Number(upstream[1]) : null;
}
class CheckError extends Error {
  constructor(message, extra = {}) { super(message); Object.assign(this, extra); }
}

// This runner can be self-checked with an in-memory executor. Its real executor
// is only connected by --run; self-check never contacts the configured service.
export async function runQueue(tasks, execute, { concurrency = 2, onUpdate = async () => {}, signal } = {}) {
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 2, 'Acceptance concurrency must be 1 or 2');
  const state = {
    stopped: false, stopReason: null, stopTaskId: null, consecutiveFailures: 0,
    results: tasks.map((task) => ({ ...task, status: 'not_run', reason: 'not_started' })),
  };
  let next = 0;
  const controllers = new Set();
  const stop = (reason, taskId = null) => {
    if (state.stopped) return;
    state.stopped = true; state.stopReason = reason; state.stopTaskId = taskId;
    for (const controller of controllers) controller.abort(new Error('Acceptance stopped'));
  };
  const interrupted = () => stop('interrupted');
  signal?.addEventListener('abort', interrupted, { once: true });
  if (signal?.aborted) interrupted();
  const worker = async () => {
    while (!state.stopped && next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const controller = new AbortController(); controllers.add(controller);
      state.results[index] = { ...task, status: 'running', requestStartedAt: startedAt };
      try {
        const result = await execute(task, controller.signal);
        controller.signal.throwIfAborted();
        state.results[index] = { ...task, ...result, status: 'success', requestStartedAt: startedAt, finishedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) };
        state.consecutiveFailures = 0;
      } catch (error) {
        const cancelled = controller.signal.aborted && state.stopped;
        const fatal = fatalStatus(error.status, error.message);
        state.results[index] = {
          ...task, status: 'failed', requestStartedAt: startedAt, finishedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
          reason: cancelled ? 'aborted_after_stop' : error.category || 'request_or_media_failure',
          httpStatus: error.status ?? null, fatalHttpStatus: fatal, cancelledDueToStop: cancelled,
          // Never persist raw server errors, headers, settings or credentials.
          error: cancelled ? 'Stopped while already in flight; server cancellation is not confirmed.' : error.safeMessage || (fatal ? `Quota or permission status ${fatal}` : 'Request, download or audio verification failed'),
        };
        if (!cancelled) {
          state.consecutiveFailures++;
          if (fatal) stop(`http_${fatal}`, task.id);
          else if (state.consecutiveFailures >= 3) stop('three_consecutive_failures', task.id);
        }
      } finally { controllers.delete(controller); }
      try { await onUpdate(state, state.results[index]); }
      catch (error) { stop('report_write_failed', task.id); throw error; }
    }
  };
  try { await Promise.all(Array.from({ length: concurrency }, worker)); }
  finally { signal?.removeEventListener('abort', interrupted); }
  for (const result of state.results) if (result.status === 'not_run') result.reason = state.stopReason || 'not_started';
  return state;
}

async function checkResponse(response, category) {
  if (response.ok) return;
  let message = '';
  try { const body = await response.json(); message = typeof body?.error === 'string' ? body.error : ''; } catch {}
  const fatal = fatalStatus(response.status, message);
  throw new CheckError(fatal ? `HTTP ${fatal}` : `HTTP ${response.status}`, {
    status: response.status, category, safeMessage: fatal ? `Quota or permission status ${fatal} (local HTTP ${response.status})` : `Local HTTP ${response.status}`,
  });
}

function liveExecutor(directory) {
  return async (task, stopSignal) => {
    const timeout = AbortSignal.timeout(180000);
    const signal = AbortSignal.any([stopSignal, timeout]);
    const response = await fetch(`${baseUrl}/api/narration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task.request), signal,
    });
    await checkResponse(response, 'narration_request');
    const body = await response.json();
    const url = new URL(body.url, baseUrl);
    // Audio must come from the configured loopback service, never a remote
    // provider URL that might contain credentials or generate another request.
    if (url.origin !== baseUrl || !/^\/api\/narration\/[a-f0-9]{64}\.wav$/.test(url.pathname) || url.search) {
      throw new CheckError('Unexpected local audio URL', { category: 'invalid_audio_url', safeMessage: 'API did not return an expected local narration WAV URL' });
    }
    signal.throwIfAborted();
    const audio = await fetch(url, { signal });
    await checkResponse(audio, 'audio_download');
    if (!audio.body) throw new CheckError('Missing audio body', { category: 'audio_download' });
    const size = Number(audio.headers.get('content-length'));
    if (Number.isFinite(size) && size > 64 * 1024 * 1024) { await audio.body.cancel(); throw new CheckError('Audio exceeds audit size limit', { category: 'audio_download' }); }
    const file = path.join(directory, `${task.id}.wav`);
    const partial = `${file}.part`;
    try {
      await pipeline(Readable.fromWeb(audio.body), createWriteStream(partial), { signal });
      await rename(partial, file);
    } finally { await rm(partial, { force: true }); }
    let probe;
    try {
      const inspected = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration,size', '-of', 'json', file], { signal, timeout: 30000, maxBuffer: 1024 * 1024 });
      probe = JSON.parse(inspected.stdout);
    } catch { throw new CheckError('Audio probe failed', { category: 'audio_probe', safeMessage: 'Downloaded file failed ffprobe' }); }
    const duration = Number(probe.format?.duration);
    const stream = probe.streams?.find((entry) => Number(entry.sample_rate) > 0);
    if (!stream || !Number.isFinite(duration) || duration < .3) throw new CheckError('Invalid audio duration or stream', { category: 'invalid_audio', safeMessage: 'No valid audio stream or duration below 0.3 seconds' });
    try { await exec('ffmpeg', ['-v', 'error', '-threads', '1', '-i', file, '-f', 'null', '-'], { signal, timeout: 60000, maxBuffer: 1024 * 1024 }); }
    catch { throw new CheckError('Audio decode failed', { category: 'audio_decode', safeMessage: 'Downloaded file failed full ffmpeg decode' }); }
    signal.throwIfAborted();
    return {
      audioUrl: url.pathname, file, bytes: Number(probe.format?.size), durationSeconds: duration,
      serverDurationSeconds: Number.isFinite(Number(body.duration)) ? Number(body.duration) : null,
      codec: stream.codec_name, sampleRate: Number(stream.sample_rate), channels: Number(stream.channels),
      probeExit: 0, fullDecodeExit: 0, cacheHit: 'not_reported_by_api',
      languageCorrect: 'not_assessed', voiceIdentityCorrect: 'not_assessed', naturalness: 'not_assessed',
    };
  };
}

export async function selfCheck(tasks, languages) {
  assert.equal(tasks.filter((task) => task.language === 'zh-CN').length, 30);
  assert.equal(tasks.filter((task) => task.group === 'kore_other_languages').length, 14);
  assert.equal(tasks.filter((task) => task.voiceKey === 'Kore' && task.language === 'zh-CN').length, 1);
  for (const task of tasks) {
    const language = languages.find((entry) => entry.code === task.language);
    assert.equal(task.request.language, language.code); assert.equal(task.request.text, language.sample);
    assert.equal(task.request.voiceStyle, 'documentary'); assert.equal(task.request.voice, `gemini:${task.voiceKey}`);
  }
  let active = 0, peak = 0;
  const success = await runQueue(tasks, async () => { active++; peak = Math.max(peak, active); await new Promise(setImmediate); active--; return { fullDecodeExit: 0 }; });
  assert.equal(peak, 2); assert.equal(success.results.filter((result) => result.status === 'success').length, 44);
  for (const status of [401, 402, 403, 429]) {
    let calls = 0;
    const stopped = await runQueue(tasks, async (_task, signal) => {
      calls++;
      if (calls === 1) throw new CheckError(`HTTP ${status}`, { status });
      await new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }); if (signal.aborted) reject(new Error('Aborted')); });
    });
    assert.equal(calls, 2); assert.equal(stopped.stopReason, `http_${status}`);
    assert.equal(stopped.results.filter((result) => result.status === 'not_run').length, 42);
    assert.ok(stopped.results.every((result) => ['success', 'failed', 'not_run'].includes(result.status)));
  }
  assert.equal(fatalStatus(500, 'Gemini request failed (HTTP 429)'), 429);
  assert.equal(fatalStatus(500, 'Upstream HTTP 403'), 403);
  let failures = 0;
  const stopped = await runQueue(tasks, async () => { failures++; throw new CheckError('HTTP 500', { status: 500 }); });
  assert.equal(stopped.stopReason, 'three_consecutive_failures'); assert.ok(failures >= 3 && failures <= 4);
  let index = 0;
  const reset = await runQueue(tasks.slice(0, 6), async () => { const fail = [true, false, true, true, false, true][index++]; if (fail) throw new CheckError('HTTP 500', { status: 500 }); return {}; }, { concurrency: 1 });
  assert.equal(reset.stopped, false); assert.equal(reset.results.filter((result) => result.status === 'success').length, 2);
  const previous = { results: tasks.map((task, i) => ({ ...task, status: i < 10 ? 'success' : i < 12 ? 'failed' : 'not_run', evidence: i < 10 ? `original-${i}` : undefined })) };
  const resumed = resumePlan(tasks, previous);
  assert.equal(resumed.preserved.size, 10); assert.equal(resumed.pending.length, 34);
  const requested = [];
  const resumedState = await runQueue(resumed.pending, async (task) => { requested.push(task.id); return {}; });
  assert.equal(requested.length, 34);
  assert.ok(requested.every((id) => !resumed.preserved.has(id)), 'Successful tasks must never be requested on resume');
  for (const original of previous.results.slice(0, 10)) assert.equal(resumed.preserved.get(original.id), original, 'Preserve original success evidence');
  assert.equal(resumedState.results.filter((result) => result.status === 'success').length, 34);
  const changed = structuredClone(previous); changed.results[0].request.text += ' changed';
  assert.throws(() => resumePlan(tasks, changed), /Changed request/);
  assert.equal(path.basename(roundBackupPath(1)), 'voice-live-acceptance-round1-2026-11-11.json');
  assert.equal(path.basename(roundBackupPath(2)), 'voice-live-acceptance-round2-2026-11-11.json');
  assert.throws(() => roundBackupPath(0), /positive integer/);
  return { passed: true, planned: 44, concurrency: 2, checks: ['unique_plan', 'sample_language_consistency', 'two_workers', '401_stop', '402_stop', '403_stop', '429_stop', 'upstream_status_detection', 'three_failures_stop', 'success_resets_failure_streak', 'resume_skips_successes', 'resume_preserves_evidence', 'resume_rejects_changed_requests', 'resume_round_backup_paths'], networkRequests: 0, ttsRequests: 0 };
}

async function main() {
  baseUrl = acceptanceBaseUrl(process.argv.slice(2));
  const voices = JSON.parse(await readFile(path.join(appRoot, 'shared/voices.json'), 'utf8'));
  const languages = JSON.parse(await readFile(path.join(appRoot, 'shared/languages.json'), 'utf8'));
  const tasks = createPlan(voices, languages);
  const resume = process.argv.includes('--resume');
  const previous = resume ? JSON.parse(await readFile(reportPath, 'utf8')) : null;
  const { pending, preserved } = resume ? resumePlan(tasks, previous) : { pending: tasks, preserved: new Map() };
  const backupPath = resume ? roundBackupPath(previous.round || previous.rounds?.length || 1) : null;
  if (process.argv.includes('--self-check')) {
    console.log(JSON.stringify({ ...await selfCheck(tasks, languages), endpoint: `${baseUrl}/api/narration`, concurrency: 2, resumeRequested: resume, pendingThisRound: pending.length, preservedSuccesses: preserved.size, previousReportBackup: backupPath }, null, 2)); return;
  }
  if (!process.argv.includes('--run')) {
    console.log(JSON.stringify({ mode: 'plan_only', planned: tasks.length, plannedThisRun: pending.length, preservedSuccesses: preserved.size, concurrency: 2, output: reportPath, previousReportBackup: backupPath, networkRequests: 0, ttsRequests: 0, runCommand: `node scripts/verify-voices.mjs --run${resume ? ' --resume' : ''}`, note: 'No requests were sent. Use --self-check for local checks; --run starts real acceptance requests.' }, null, 2)); return;
  }
  if (!pending.length) { console.log('All 44 tasks already succeeded; no requests sent.'); return; }
  // Back up the original evidence before any resumed request or overwrite.
  if (resume) {
    try { await copyFile(reportPath, backupPath, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  // Preflight local binaries before any TTS request is made.
  await exec('ffprobe', ['-version']); await exec('ffmpeg', ['-version']);
  const directory = await mkdtemp(path.join(tmpdir(), 'gomotion-voice-live-2026-11-11-'));
  await mkdir(path.dirname(reportPath), { recursive: true });
  const startedAt = new Date().toISOString();
  const previousRounds = previous?.rounds || (previous ? [{ startedAt: previous.startedAt, finishedAt: previous.finishedAt, stopReason: previous.stopReason, summary: previous.summary }] : []);
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  const report = {
    version: 2, mode: 'live', startedAt, firstStartedAt: previous?.firstStartedAt || previous?.startedAt || startedAt,
    round: previousRounds.length + 1, resumed: resume, preservedSuccesses: preserved.size, plannedThisRun: pending.length,
    previousReportBackup: backupPath, endpoint: `${baseUrl}/api/narration`, planned: 44, concurrency: 2,
    downloadDirectory: directory, stopOnHttp: [401, 402, 403, 429], stopAfterConsecutiveFailures: 3,
    assessment: { fullDecode: true, actualDuration: true, browserPlayback: 'not_assessed', languageCorrect: 'not_assessed', voiceIdentityCorrect: 'not_assessed', naturalness: 'not_assessed' },
    cacheNote: 'The API may reuse existing cache; it does not disclose whether each response generated new TTS.',
    cancellationNote: 'At most two requests are in flight. On a stop condition no new tasks start; other client requests are aborted. Server-side cancellation/charges cannot be confirmed from this client.',
  };
  const combined = (results) => {
    const changed = new Map(results.map((result) => [result.id, result]));
    return tasks.map((task) => preserved.get(task.id) || changed.get(task.id) || { ...task, status: 'not_run', reason: 'not_started' });
  };
  let writes = Promise.resolve();
  const save = (state, result) => {
    const snapshot = JSON.stringify({ ...report, updatedAt: new Date().toISOString(), stopped: state.stopped, stopReason: state.stopReason, stopTaskId: state.stopTaskId, results: combined(state.results) }, null, 2);
    writes = writes.then(async () => { const temporary = `${reportPath}.partial`; await writeFile(temporary, snapshot); await rename(temporary, reportPath); });
    if (result) console.log(`${result.status}: ${result.voiceKey} / ${result.language}${result.durationSeconds ? ` / ${result.durationSeconds.toFixed(3)}s` : ''}${result.reason ? ` / ${result.reason}` : ''}`);
    return writes;
  };
  try {
    await save({ stopped: false, stopReason: null, stopTaskId: null, results: pending.map((task) => ({ ...task, status: 'not_run', reason: 'not_started' })) });
    const state = await runQueue(pending, liveExecutor(directory), { concurrency: 2, onUpdate: save, signal: abort.signal });
    report.finishedAt = new Date().toISOString();
    report.roundSummary = summarize(state.results);
    const total = summarize(combined(state.results));
    report.summary = { ...total, distinctTasksStarted: total.requestsStarted, requestsStarted: previousRounds.reduce((sum, round) => sum + (round.summary?.requestsStarted || 0), 0) + report.roundSummary.requestsStarted };
    report.rounds = [...previousRounds, { startedAt, finishedAt: report.finishedAt, stopReason: state.stopReason, summary: report.roundSummary }];
    await save(state);
    console.log(JSON.stringify({ output: reportPath, stopped: state.stopped, stopReason: state.stopReason, preservedSuccesses: preserved.size, roundSummary: report.roundSummary, totalSummary: report.summary }, null, 2));
    if (state.stopped || report.summary.failed) process.exitCode = 2;
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Voice acceptance stopped because of a local preflight, report-writing or execution error. No credentials are read or printed by this script.'); process.exitCode = 1; });
}
