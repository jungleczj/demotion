import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareNarrationTimeline } from './narration-timeline.mjs';
import { fixtureAudioResponse } from './narration-fixture-utils.mjs';

const config = { visionEnabled: true, visionProvider: 'gemini', visionKey: 'offline-fixture-only', visionBase: 'https://narration.invalid', visionModel: 'offline-alignment-fixture' };
function projectFixture() {
  const texts = [`第一句离线时间轴 ${randomUUID()}。`, '第二句保留同一条完整配音。'];
  return { voice: 'gemini:Kore', language: 'zh-CN', voiceStyle: 'documentary', script: texts.join('\n\n'), scenes: texts.map((text, i) => ({ id: `scene-${i}`, text })) };
}
function installFixture(project) {
  const originalFetch = globalThis.fetch, calls = { tts: 0, alignment: 0 };
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://narration.invalid/'), 'fixture must never reach a real service');
    const payload = JSON.parse(options.body);
    if (payload.generationConfig.responseModalities?.includes('AUDIO')) {
      calls.tts++;
      assert.equal(payload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
      assert.ok(payload.contents[0].parts[0].text.endsWith(`NARRATION:\n${project.script}`), 'one TTS request must retain the exact complete script');
      return fixtureAudioResponse([{ tone: 2 }]);
    }
    calls.alignment++;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ complete: true, speakerConsistent: true, segments: [{ index: 0, start: .05, end: .9 }, { index: 1, start: 1.05, end: 1.95 }] }) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore() { globalThis.fetch = originalFetch; } };
}
const job = () => ({ controller: new AbortController(), events: [] });
function timingFile(result, project) {
  const key = createHash('sha256').update(JSON.stringify({ track: result.track.key, texts: project.scenes.map((s) => s.text), anchors: project.scenes.map(() => undefined), version: 3 })).digest('hex');
  return path.join(path.dirname(result.file), `${key}.json`);
}

for (const invalidEnd of [.6, 100]) test(`a cached timeline ending at ${invalidEnd}s cannot replace the complete two-second recording`, async () => {
  const project = projectFixture(), fixture = installFixture(project);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-timing-fixture-'));
  let result, cache;
  try {
    result = await prepareNarrationTimeline(project, config, job(), directory);
    cache = timingFile(result, project);
    await writeFile(cache, JSON.stringify([0, .3, invalidEnd]));
    result = await prepareNarrationTimeline(project, config, job(), directory);
    assert.ok(result.track.scenes.at(-1).end >= result.track.duration, 'the timeline must cover all recorded speech');
    assert.ok(result.track.scenes.at(-1).end <= result.track.duration + .3, 'only ordinary frame padding may extend the timeline');
    assert.equal(fixture.calls.tts, 1, 'bad timing must not replace the selected full-film voice recording');
    assert.equal(fixture.calls.alignment, 2, 'bad timing must be aligned again');
  } finally {
    fixture.restore();
    if (result) await rm(result.file, { force: true });
    if (cache) await rm(cache, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test('an existing project track cannot truncate the final 0.4 seconds of speech', async () => {
  const project = projectFixture(), fixture = installFixture(project);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-track-fixture-'));
  let result, cache;
  try {
    result = await prepareNarrationTimeline(project, config, job(), directory);
    cache = timingFile(result, project);
    const truncated = structuredClone(result.track); truncated.scenes.at(-1).end = result.track.duration - .4;
    result = await prepareNarrationTimeline({ ...project, narrationTrack: truncated }, config, job(), directory);
    assert.ok(result.track.scenes.at(-1).end >= result.track.duration, 'restored project timing must still cover the entire recording');
    assert.equal(fixture.calls.tts, 1); assert.equal(fixture.calls.alignment, 1, 'the valid timing cache can repair the project track');
  } finally {
    fixture.restore();
    if (result) await rm(result.file, { force: true });
    if (cache) await rm(cache, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test('a successful recording remains checkpointable when real timing has not been accepted', async () => {
  const project = projectFixture(), fixture = installFixture(project);
  const wrapped = globalThis.fetch;
  globalThis.fetch = (url, options) => JSON.parse(options.body).generationConfig.responseModalities?.includes('AUDIO')
    ? wrapped(url, options)
    : Promise.resolve(Response.json({ error: { message: 'busy' } }, { status: 503 }));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-checkpoint-'));
  const state = job();
  try {
    await assert.rejects(prepareNarrationTimeline(project, config, state, directory), /503/);
    assert.match(state.narrationRecording?.key || '', /^[a-f0-9]{64}$/);
    assert.equal(state.narrationTrack, undefined);
    const { narrationPath } = await import('./narration.mjs');
    const { checkpointFiles } = await import('./cloud/worker.mjs');
    const audio = narrationPath(state.narrationRecording.key);
    const work = path.join(directory, 'work');
    await mkdir(path.join(work, 'narration'), { recursive: true });
    await Promise.all([audio, audio.replace(/\.wav$/, '.json')].map(f => copyFile(f, path.join(work, 'narration', path.basename(f)))));
    const files = await checkpointFiles(work, { project: { ...project, narrationRecording: state.narrationRecording }, status: 'error' }, path.join(directory, 'staging'));
    assert.deepEqual(files.map(f => f.relativePath).sort(), [`narration/${state.narrationRecording.key}.json`, `narration/${state.narrationRecording.key}.wav`]);
    const receipt = JSON.parse(await readFile(audio.replace(/\.wav$/, '.json'), 'utf8'));
    assert.equal(receipt.sha256, files.find(f => f.relativePath.endsWith('.wav')).sha256);
    await writeFile(path.join(work, 'narration', path.basename(audio)), 'invalid changed bytes');
    assert.deepEqual(await checkpointFiles(work, { project: { ...project, narrationRecording: state.narrationRecording }, status: 'error' }), []);
    assert.equal(fixture.calls.tts, 1);
  } finally {
    fixture.restore();
    if (state.narrationRecording) {
      const { narrationPath } = await import('./narration.mjs');
      const audio = narrationPath(state.narrationRecording.key);
      await rm(audio, { force: true }); await rm(audio.replace(/\.wav$/, '.json'), { force: true });
    }
    await rm(directory, { recursive: true, force: true });
  }
});
