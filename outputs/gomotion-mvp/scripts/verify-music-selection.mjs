// File-only acceptance. Optional public license-page recheck never calls a
// model, music generator, YouTube API, app job endpoint or cloud resource.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workDirectory } from '../server/runtime.mjs';
import { configureNetwork } from '../server/network.mjs';
import { prewarmCuratedMusic } from '../server/music-selection.mjs';
import { acquireDefaultMusic, musicAssets } from '../server/music-sources.mjs';
import { SCOTT_BUCKLEY_TRACKS, verifyScottBuckleyTrack } from '../server/source-adapters/scottbuckley.mjs';
import { prepareBackgroundMusic, addBackgroundMusic, createSeamlessMusicLoop } from '../server/background-music.mjs';
import { run, probe } from '../server/process.mjs';

const reportFile = path.resolve(process.argv.find((arg) => arg.startsWith('--report='))?.slice(9) || '../music-selection-live-2026-11-12.json');
const narration = process.argv.find((arg) => arg.startsWith('--narration='))?.slice(12);
const folder = path.join(workDirectory, 'music-selection-acceptance'), cache = path.join(workDirectory, 'music-sources');
const offline = async () => { throw new Error('Verification forbids network outside explicit public license recheck'); };
const digest = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const report = { startedAt: new Date().toISOString(), modelRequests: 0, musicGenerationRequests: 0, youtubeRequests: 0, cloudJobs: 0,
  existingNarrationOnly: true, humanListeningAccepted: false, finalCloudFilmAccepted: false, operations: [] };
await mkdir(folder, { recursive: true });
async function measure(name, action) {
  const start = Date.now();
  try { const result = await action(); report.operations.push({ name, ok: true, elapsedMs: Date.now() - start, result }); return result; }
  catch (error) { report.operations.push({ name, ok: false, elapsedMs: Date.now() - start, error: error.message }); return undefined; }
  finally { await writeFile(reportFile, JSON.stringify(report, null, 2)); }
}

if (process.argv.includes('--recheck-license')) {
  report.network = configureNetwork();
  await measure('current-official-per-track-license-pages', async () => Promise.all(SCOTT_BUCKLEY_TRACKS.map((track) => verifyScottBuckleyTrack(track, {
    requestText: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Official page HTTP ${response.status}`);
      const text = await response.text(); if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Official page too large'); return text;
    },
  }))));
}

musicAssets.clear();
const warm = await measure('all-three-actual-files-full-decode-hash-and-restart-cache-with-no-network', () => prewarmCuratedMusic(cache, { cacheOnly: true, fetch: offline }));
report.completeCuratedCache = Boolean(warm);
const available = warm || await measure('existing-default-original-remains-verified-and-available-offline', async () => ({ tracks: [await acquireDefaultMusic(cache, { cacheOnly: true, fetch: offline })] }));
if (warm) {
  assert.equal(warm.tracks.length, 3); assert.equal(warm.downloadedBytes, 0);
  await measure('deterministic-topics-select-different-relevant-files-offline', async () => {
    const results = [];
    for (const [project, id] of [
      [{ title: '海洋探索', script: '跟随探险队发现自然世界。' }, 'scottbuckley:the-great-sea'],
      [{ title: 'Danger and survival', script: 'A storm threatens the expedition.' }, 'scottbuckley:machina'],
      [{ title: '回忆与故乡', script: '岁月中的记忆。' }, 'scottbuckley:undertow'],
    ]) {
      const result = await prepareBackgroundMusic(cache, { project, fetch: offline });
      assert.equal(result.status, 'ready'); assert.equal(result.source.id, id); assert.equal(result.source.cacheHit, true);
      results.push({ project, selection: result.selection, id: result.source.id, sha256: result.source.sha256, downloadedBytes: result.source.downloadedBytes });
    }
    return results;
  });
}
if (available) {
  await measure('actual-licensed-original-short-crossfade-loop-boundary', async () => {
    const source = available.tracks.find((track) => track.id === 'scottbuckley:undertow');
    const cycle = path.join(folder, 'temporary-loop.flac'), audio = path.join(folder, 'Undertow-loop-boundary.m4a');
    try {
      const loop = await createSeamlessMusicLoop(source, cycle);
      // Six seconds either side of a real original-file loop boundary.
      await run('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '-1', '-i', cycle, '-ss', String(loop.loopPeriodSeconds - 6), '-t', '12', '-c:a', 'aac', '-b:a', '192k', audio]);
      const actual = await probe(audio);
      await run('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', audio, '-f', 'null', '-']);
      assert.ok(Math.abs(actual.duration - 12) < .05);
      await writeFile(`${audio}.txt`, `${source.attribution}\nChanges: tail/head crossfade; excerpt spans loop boundary at 6 seconds.\n`);
      return { audio, sourceId: source.id, sourceSha256: source.sha256, loop, actual, sha256: await digest(audio), fullDecode: true, boundaryAtSeconds: 6, humanListeningAccepted: false };
    } finally { await rm(cycle, { force: true }); }
  });
  if (narration) await measure('actual-selected-or-fallback-music-with-existing-narration-no-new-tts', async () => {
    const original = path.resolve(narration), originalInfo = await probe(original), duration = Math.min(29, originalInfo.duration);
    assert.ok(duration > 0);
    const video = path.join(folder, 'existing-narration-selected-mix.mp4'), project = { title: '海洋探索', script: '跟随探险队发现自然世界。' };
    const preparation = await prepareBackgroundMusic(cache, { project, fetch: offline });
    assert.equal(preparation.source.id, warm ? 'scottbuckley:the-great-sea' : 'scottbuckley:undertow');
    assert.equal(preparation.selection.requestedTrackId, 'scottbuckley:the-great-sea');
    assert.equal(preparation.selection.fallback, !warm);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x18334a:size=1280x720:rate=15:duration=${duration}`, '-i', original,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-c:a', 'aac', '-t', String(duration), video]);
    const music = await addBackgroundMusic(video, cache, { duration, project, preparation, fetch: offline });
    assert.equal(music.mixed, true); assert.equal(music.mix.narrationGain, 1); assert.ok(music.mix.targetMusicLufs <= music.mix.narrationLufs - 14);
    const actual = await probe(video);
    await run('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', video, '-f', 'null', '-']);
    await writeFile(path.join(folder, 'sources.json'), JSON.stringify({ actual, music, narration: { file: original, sha256: await digest(original), reused: true, newTTSRequests: 0 } }, null, 2));
    await writeFile(`${video}.txt`, `${music.source.attribution}\nChanges: ${music.mix.changes}\n`);
    return { video, actual, music, fullDecode: true, narration: { file: original, sha256: await digest(original), reused: true, newTTSRequests: 0 }, humanListeningAccepted: false, finalCloudFilmAccepted: false };
  });
}
report.finishedAt = new Date().toISOString();
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportFile, operations: report.operations.map(({ name, ok, elapsedMs, error }) => ({ name, ok, elapsedMs, error })) }));
if (report.operations.some((operation) => !operation.ok)) process.exitCode = 1;
