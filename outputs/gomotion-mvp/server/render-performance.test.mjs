import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { renderProject } from './render.mjs';
import { run, probe } from './process.mjs';
import { narrationAudio } from './narration.mjs';
import { fixtureAudioResponse } from './narration-fixture-utils.mjs';
import { assets } from './sources.mjs';
import { playbackPath } from './playback.mjs';
import { acquireDefaultMusic } from './music-sources.mjs';
import { SCOTT_BUCKLEY_TRACKS } from './source-adapters/scottbuckley.mjs';

test('a failed render retains the measured time spent in its failing phase', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'render-failure-timing-'));
  try {
    const job = { id: randomUUID(), controller: { signal: t.signal } };
    await renderProject(job, { voice: 'gemini:Kore', format: 'landscape', scenes: [{ id: 'one', text: '缺少配音连接的离线失败检查。' }] }, directory, { visionProvider: 'gemini' });
    assert.equal(job.status, 'error');
    assert.ok(job.renderTimings?.narrationMs > 0, 'a failed phase still consumed real time');
    assert.equal(job.renderTimings.prepareInputsMs, 0);
    assert.ok(job.renderTimings.totalMs >= job.renderTimings.narrationMs);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('independent render inputs prepare together while the final HD timeline and single narration remain ordered', { timeout: 90000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'render-parallel-fixture-'));
  const source = path.join(directory, 'source.mp4');
  const config = { visionProvider: 'gemini', visionEnabled: false, visionKey: 'offline-fixture', visionBase: 'https://narration.invalid', coverrKey: 'offline-coverr' };
  const project = { id: randomUUID(), title: 'offline render pipeline', voice: 'gemini:Kore', language: 'zh-CN', format: 'landscape', fit: 'cover', subtitles: false };
  const ids = Array.from({ length: 4 }, () => `coverr:${randomUUID()}`);
  let recording, activeReports = 0, maximumReports = 0, ttsCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://narration.invalid/')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO'], 'cached supplied timing must avoid any alignment/model request');
      ttsCalls++; return fixtureAudioResponse([{ tone: 2 }]);
    }
    assert.ok(String(url).startsWith('https://api.coverr.co/videos/') && String(url).endsWith('/stats/downloads'), 'no network call may escape the local fixture');
    assert.equal(options.method, 'PATCH');
    activeReports++; maximumReports = Math.max(maximumReports, activeReports);
    try { await delay(100, undefined, { signal: t.signal }); return new Response('{}'); }
    finally { activeReports--; }
  });
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', source], t.signal);
    const musicFixture = path.join(directory, 'music-fixture.wav');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.25', musicFixture], t.signal);
    const musicBytes = await readFile(musicFixture);
    await acquireDefaultMusic(path.join(directory, 'music-sources'), { signal: t.signal, fetch: async (url, options) => url === SCOTT_BUCKLEY_TRACKS[0].url
      ? new Response(options.method === 'HEAD' ? null : musicBytes, { headers: { 'Content-Length': String(musicBytes.length) } })
      : new Response(`<p>This work is licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a></p><a href="${SCOTT_BUCKLEY_TRACKS[0].url}">MP3</a><pre>'Undertow' by Scott Buckley - released under CC-BY 4.0.</pre>`) });
    project.scenes = ids.map((id, index) => {
      const asset = { id, sourceId: id.slice(7), provider: 'coverr', title: `Local scene ${index}`, description: '', kind: 'video', width: 1280, height: 720, duration: 2, localPath: source, sourceUrl: 'https://coverr.co/', author: 'offline fixture', license: 'fixture only', licenseUrl: 'https://coverr.co/license' };
      assets.set(id, asset);
      return { id: `scene-${index}`, text: `离线第${index + 1}句 ${index === 0 ? randomUUID() : ''}。`, duration: .5, start: 0, selected: asset, confirmed: true, transitionType: index === 1 ? 'dissolve' : 'cut', transitionDuration: .2 };
    });
    project.script = project.scenes.map((s) => s.text).join('\n\n');
    recording = await narrationAudio({ text: project.script }, project, config, t.signal);
    const total = Math.ceil((recording.duration + .22) * 30) / 30;
    project.narrationTrack = { processingVersion: 2, key: recording.key, voice: project.voice, language: project.language, duration: recording.duration,
      scenes: project.scenes.map((scene, i) => ({ id: scene.id, text: scene.text, start: i * total / 4, end: (i + 1) * total / 4 })) };
    const job = { id: randomUUID(), controller: { signal: t.signal }, events: [] };
    await renderProject(job, project, directory, config);
    assert.equal(job.status, 'done', job.error);
    assert.equal(ttsCalls, 1, 'one recording is shared by all four scenes');
    const manifest = JSON.parse(await readFile(path.join(directory, job.id, 'sources.json'), 'utf8'));
    assert.deepEqual(manifest.scenes.map((s) => s.id), ['scene-0', 'scene-1', 'scene-2', 'scene-3']);
    assert.equal(new Set(manifest.scenes.map((s) => s.narrationTrackKey)).size, 1);
    assert.equal(manifest.music.status, 'mixed', 'the default render must actually include the prepared music');
    assert.equal(job.music.status, 'mixed');
    assert.equal(manifest.music.mix.continuous, true);
    assert.equal(manifest.music.mix.start, 0);
    assert.equal(manifest.music.mix.end, total);
    assert.equal(manifest.scenes[0].start, 0);
    manifest.scenes.slice(1).forEach((scene, i) => assert.equal(scene.start, manifest.scenes[i].end));
    const output = path.join(directory, job.id, 'video.mp4'), info = await probe(output, t.signal);
    assert.deepEqual([info.width, info.height, info.hasAudio], [1280, 720, true]);
    assert.ok(Math.abs(info.duration - total) < .15);
    await run('ffmpeg', ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], t.signal);
    assert.ok(maximumReports >= 2, `independent input preparation remained serial (observed ${maximumReports})`);
    assert.notEqual(job.review?.passed, true, 'offline fixtures cannot be reported as real audiovisual acceptance');
    for (const phase of ['narrationMs', 'prepareInputsMs', 'encodeMs', 'assembleMs', 'reviewMs', 'totalMs']) assert.ok(job.renderTimings?.[phase] > 0, `${phase} must record the phase that ran`);
    t.diagnostic(JSON.stringify({ inputReportsMax: maximumReports, renderTimings: job.renderTimings, outputDuration: info.duration, artificialAudio: true, realModelRequests: 0 }));
  } finally {
    for (const id of ids) {
      const asset = assets.get(id); assets.delete(id);
      if (asset?.playbackKey) await Promise.all([playbackPath(asset.playbackKey), playbackPath(asset.playbackKey).replace(/\.mp4$/, '.jpg')].map((file) => rm(file, { force: true })));
    }
    if (recording) await rm(recording.file, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
