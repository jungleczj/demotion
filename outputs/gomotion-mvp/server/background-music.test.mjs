import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, probe } from './process.mjs';

// This fixture is an artificial signal used only to measure the mixer.
// It is never offered as licensed production music or real narration.
const source = { id: 'scottbuckley:undertow', provider: 'scottbuckley', kind: 'audio', title: 'Undertow', author: 'Scott Buckley', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3', sourceUrl: 'https://www.scottbuckley.com.au/library/undertow/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: "'Undertow' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au", fullDecode: true };
const digest = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
async function level(file, start, duration, frequency, signal) {
  const output = await run('ffmpeg', ['-hide_banner', '-ss', String(start), '-t', String(duration), '-i', file, '-vn', '-af', `bandpass=f=${frequency}:width_type=h:width=20,volumedetect`, '-f', 'null', '-'], signal, true);
  return Number(output.match(/mean_volume: ([\d.-]+) dB/)?.[1]);
}

test('music loop crossfades the real tail and head with sample-continuous repeat boundaries', async (t) => {
  const background = await import('./background-music.mjs');
  assert.equal(typeof background.createSeamlessMusicLoop, 'function', 'loop preparation must replace hard source resets');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-loop-'));
  try {
    const original = path.join(folder, 'ramp.wav'), loop = path.join(folder, 'loop.flac'), repeated = path.join(folder, 'repeated.pcm');
    // A saw ramp has a large discontinuity at its raw 1.25s boundary.
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0.3*(2*t/1.25-1):s=48000:d=1.25', original], t.signal);
    const prepared = await background.createSeamlessMusicLoop({ localPath: original, duration: 1.25 }, loop, { signal: t.signal });
    assert.equal(prepared.loopCrossfadeSeconds, .3125);
    assert.equal(prepared.loopPeriodSeconds, .9375);
    const info = await probe(loop, t.signal);
    assert.ok(Math.abs(info.duration - .9375) <= 1 / 48000);
    await run('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '-1', '-i', loop, '-t', '3', '-ac', '1', '-f', 'f32le', repeated], t.signal);
    const bytes = await readFile(repeated), samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    for (const boundary of [45000, 90000, 135000]) {
      assert.ok(Math.abs(samples[boundary] - samples[boundary - 1]) < .001, `audible hard reset at sample ${boundary}`);
    }
    assert.ok(Math.max(...samples.subarray(40000, 44999)) - Math.min(...samples.subarray(40000, 44999)) > .01, 'crossfade must not erase the source or replace it with silence');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('a single continuous music bed loops past its source duration, ducks beneath speech and fades at the film end', { timeout: 30000 }, async (t) => {
  const { mixBackgroundMusic } = await import('./background-music.mjs');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-mix-'));
  try {
    const input = path.join(folder, 'dry.mp4'), music = path.join(folder, 'music.wav'), output = path.join(folder, 'mixed.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:size=320x180:rate=10:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=8', '-af', "volume='if(between(t,2,4),1,0)':eval=frame", '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-c:a', 'aac', '-shortest', input], t.signal);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1.25', music], t.signal);
    const result = await mixBackgroundMusic(input, { ...source, localPath: music, duration: 1.25, sha256: await digest(music) }, output, { duration: 8, signal: t.signal });
    const info = await probe(output, t.signal);
    assert.equal(result.status, 'mixed');
    assert.equal(result.mix.continuous, true);
    assert.equal(result.mix.start, 0);
    assert.equal(result.mix.end, 8);
    assert.equal(result.mix.version, 2);
    assert.ok(result.mix.loopCrossfadeSeconds > 0);
    assert.ok(result.mix.loopPeriodSeconds < 1.25);
    assert.equal(info.hasAudio, true);
    assert.ok(Math.abs(info.duration - 8) < .1);
    await run('ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], t.signal);
    const gap = await level(output, 5.3, .5, 220, t.signal);
    const underVoice = await level(output, 2.8, .5, 220, t.signal);
    const end = await level(output, 7.75, .2, 220, t.signal);
    const voice = await level(output, 2.8, .5, 1000, t.signal);
    const originalVoice = await level(input, 2.8, .5, 1000, t.signal);
    assert.ok(gap > -50, `music must continue after multiple 1.25s loops, got ${gap} dB`);
    assert.ok(underVoice < gap - 4, `music did not duck: voice ${underVoice}, gap ${gap}`);
    assert.ok(voice > underVoice + 12, `narration must remain clearly louder: ${voice}, ${underVoice}`);
    assert.ok(Math.abs(voice - originalVoice) < 1, `narration level changed: ${voice}, ${originalVoice}`);
    assert.ok(end < gap - 10, `end must fade smoothly, got ${end} vs ${gap}`);
    const quietInput = path.join(folder, 'quiet.mp4'), quietOutput = path.join(folder, 'quiet-mixed.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-c:v', 'copy', '-af', 'volume=0.1', '-c:a', 'aac', quietInput], t.signal);
    const quietResult = await mixBackgroundMusic(quietInput, { ...source, localPath: music, duration: 1.25, sha256: await digest(music) }, quietOutput, { duration: 8, signal: t.signal });
    const quietVoice = await level(quietOutput, 2.8, .5, 1000, t.signal);
    const quietMusic = await level(quietOutput, 2.8, .5, 220, t.signal);
    assert.ok(quietVoice > quietMusic + 10, `music must also remain behind a quiet narrator: voice ${quietVoice}, bed ${quietMusic}`);
    assert.ok(quietResult.mix.targetMusicLufs < result.mix.targetMusicLufs, 'music must adapt to the actual narration level');
    t.diagnostic(JSON.stringify({ fixtureOnly: true, gapDb: gap, duckedMusicDb: underVoice, voiceDb: voice, originalVoiceDb: originalVoice, endingDb: end }));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('unavailable music preserves the completed narration video and cannot claim a successful mix', async (t) => {
  const { addBackgroundMusic } = await import('./background-music.mjs');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-fallback-'));
  try {
    const input = path.join(folder, 'video.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=size=160x90:duration=0.5', '-f', 'lavfi', '-i', 'sine=duration=0.5', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-shortest', input], t.signal);
    const before = await digest(input);
    const result = await addBackgroundMusic(input, path.join(folder, 'empty-cache'), { duration: .5, signal: t.signal, fetch: async () => { throw new Error('offline fixture'); } });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.mixed, false);
    assert.equal(result.narrationPreserved, true);
    assert.match(result.reason, /offline fixture/);
    assert.equal(await digest(input), before);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('optional music preparation aborts its download within its budget without claiming a mix', async (t) => {
  const { prepareBackgroundMusic } = await import('./background-music.mjs');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'music-budget-'));
  let aborted = false;
  try {
    const result = await prepareBackgroundMusic(folder, { signal: t.signal, budgetMs: 30, fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    }) });
    assert.equal(aborted, true);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.mixed, false);
    assert.equal(result.narrationPreserved, true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
