// Explicit acceptance: one official CC BY track and a short local FFmpeg mix.
// No AI/YouTube requests, app job submission, service restart or cloud resource.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { configureNetwork } from '../server/network.mjs';
import { workDirectory } from '../server/runtime.mjs';
import { acquireDefaultMusic, musicAssets } from '../server/music-sources.mjs';
import { addBackgroundMusic } from '../server/background-music.mjs';
import { run, probe } from '../server/process.mjs';
const reportFile = path.resolve(process.argv.find((arg) => arg.startsWith('--report='))?.slice(9) || '../music-delivery-live-2026-11-12.json');
const narration = process.argv.find((arg) => arg.startsWith('--narration='))?.slice(12);
const folder = path.join(workDirectory, 'music-delivery-acceptance');
await mkdir(folder, { recursive: true });
let report;
try { report = JSON.parse(await readFile(reportFile, 'utf8')); } catch { report = { operations: [] }; }
Object.assign(report, { updatedAt: new Date().toISOString(), network: configureNetwork(), modelRequests: 0, youtubeRequests: 0, cloudJobs: 0 });
async function measure(name, action) {
  const start = Date.now();
  try { const result = await action(); report.operations.push({ name, ok: true, elapsedMs: Date.now() - start, result }); return result; }
  catch (error) { report.operations.push({ name, ok: false, elapsedMs: Date.now() - start, error: error.message }); return undefined; }
  finally { await writeFile(reportFile, JSON.stringify(report, null, 2)); }
}
const music = await measure('verified-range-original-download', () => acquireDefaultMusic(path.join(workDirectory, 'music-sources')));
if (music) {
  musicAssets.delete(music.id);
  await measure('restart-cache-without-network', () => acquireDefaultMusic(path.join(workDirectory, 'music-sources'), { fetch: async () => { throw new Error('cache must not access network'); } }));
  await measure('actual-licensed-music-short-local-mix', async () => {
    const video = path.join(folder, 'music-verification.mp4');
    const duration = narration ? Math.min(16, (await probe(narration)).duration) : 16;
    if (duration <= 0) throw new Error('Narration sample has no duration');
    const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x18334a:size=640x360:rate=15:duration=${duration}`];
    if (narration) args.push('-i', path.resolve(narration));
    else args.push('-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=48000:duration=${duration}`, '-af', "volume='if(between(t,3,7)+between(t,10,12),1,0)':eval=frame");
    args.push('-t', String(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-c:a', 'aac', '-shortest', video);
    await run('ffmpeg', args);
    const mix = await addBackgroundMusic(video, path.join(workDirectory, 'music-sources'), { duration, fetch: async () => { throw new Error('mix must use cached original'); } });
    if (mix.status !== 'mixed') throw new Error(mix.reason || 'Music did not enter the output');
    const actual = await probe(video);
    await run('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', video, '-f', 'null', '-']);
    await writeFile(path.join(folder, 'sources.json'), JSON.stringify({ testOnly: true, narration: narration ? 'existing-audio-no-new-model-call' : 'artificial-signal-not-human-narration', music: mix }, null, 2));
    await writeFile(path.join(folder, 'music-attribution.txt'), `${mix.source.attribution}\nChanges: ${mix.mix.changes}\n`);
    return { video, actual, fullDecode: true, narration: narration ? 'existing-audio-no-new-model-call' : 'artificial-signal-not-human-narration', music: mix, finalCloudFilmAccepted: false };
  });
}
console.log(JSON.stringify({ reportFile, operations: report.operations.map(({ name, ok, elapsedMs, error, result }) => ({ name, ok, elapsedMs, error, bytes: result?.bytes, duration: result?.duration, sha256: result?.sha256, downloadMethod: result?.downloadMethod, video: result?.video })) }));
if (report.operations.slice(-3).some((operation) => !operation.ok)) process.exitCode = 1;
