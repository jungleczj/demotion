import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Media decoding/React scheduling are controlled here; all transition, clock,
// seek, audio lifetime and cancellation decisions execute the production hook.
const folder = await mkdtemp(path.join(tmpdir(), 'gomotion-preview-state-'));
const adapter = path.join(folder, 'react.mjs');
await writeFile(adapter, `export const useRef = (...args) => globalThis.previewHarness.useRef(...args);\nexport const useState = (...args) => globalThis.previewHarness.useState(...args);\nexport const useEffect = (...args) => globalThis.previewHarness.useEffect(...args);`);
const bundle = path.join(folder, 'playback.mjs');
await build({ entryPoints: [new URL('./usePreviewPlayback.ts', import.meta.url).pathname], outfile: bundle, bundle: true, platform: 'node', format: 'esm', alias: { react: adapter }, logLevel: 'silent' });
const { default: usePlayback, sceneAt, sceneOffset, nextVideoScene, decodedVideoFrame } = await import(pathToFileURL(bundle));
after(async () => { await rm(folder, { recursive: true, force: true }); });

class Video {
  dataset = {}; style = {}; currentTime = 0; duration = 100; readyState = 4;
  videoWidth = 1280; seeking = false; error = null; ended = false;
  isConnected = true; muted = true; paused = true; playCalls = 0; frames = new Map(); autoFrames = true; serial = 0;
  play() { this.playCalls++; this.paused = false; if (this.autoFrames) queueMicrotask(() => this.present()); return Promise.resolve(); }
  pause() { this.paused = true; }
  requestVideoFrameCallback(callback) { const id = ++this.serial; this.frames.set(id, callback); return id; }
  cancelVideoFrameCallback(id) { this.frames.delete(id); }
  present() { const callbacks = [...this.frames.values()]; this.frames.clear(); callbacks.forEach((callback) => callback(0, {})); }
}
function project(missing = false) {
  const scenes = [5, missing ? 4 : 5, 5].map((duration, index) => ({ id: `scene-${index}`, duration, start: index + 1, text: `Text ${index}`, selected: missing && index === 1 ? null : { id: `asset-${index}`, kind: 'video', playbackUrl: `/clip-${index}.mp4` } }));
  let start = 0;
  return { id: 'project-a', voice: 'gemini:test', voiceStyle: 'documentary', language: 'en', scenes, narrationTrack: { processingVersion: 2, key: 'narration-a', url: '/voice.wav', voice: 'gemini:test', style: 'documentary', language: 'en', duration: 15, scenes: scenes.map((scene) => { const entry = { id: scene.id, text: scene.text, start, end: start + scene.duration }; start = entry.end; return entry; }) } };
}
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 35)); await new Promise(setImmediate); };
function mount(input = project(), movie = null) {
  const originals = { AudioContext: globalThis.AudioContext, fetch: globalThis.fetch, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  let clock = 0, nextFrame = 0, cursor = 0, pending = false, disposed = false;
  const values = [], effects = [], animationFrames = new Map(), nodes = [], gains = [], videos = [new Video(), new Video()];
  globalThis.requestAnimationFrame = (callback) => { const id = ++nextFrame; animationFrames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = (id) => animationFrames.delete(id);
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  globalThis.AudioContext = class {
    state = 'running'; get currentTime() { return clock; }
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    createGain() { const gain = { gain: { value: 1 }, connect() {}, disconnect() {} }; gains.push(gain); return gain; }
    decodeAudioData() { return Promise.resolve({ duration: 100 }); }
    createBufferSource() { const node = { stopped: 0, offsets: [], connect() {}, disconnect() {}, start(_when, offset) { this.offsets.push(offset); }, stop() { this.stopped++; } }; nodes.push(node); return node; }
  };
  const options = { project: input, active: 0, elapsed: 0, voiceEnabled: true, video: { current: movie }, setActive(index) { options.active = index; schedule(); }, setElapsed(seconds) { options.elapsed = seconds; schedule(); }, onError(message) { errors.push(message); }, onPrepared(next) { options.project = next; schedule(); } };
  const errors = [];
  const harness = {
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { const next = typeof value === 'function' ? value(values[index]) : value; if (!Object.is(next, values[index])) { values[index] = next; schedule(); } }]; },
    useEffect(callback, deps) { const index = cursor++; const previous = effects[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { effects[index] = { deps, callback, cleanup: previous?.cleanup, dirty: true }; } }
  };
  let result;
  function schedule() { if (pending || disposed) return; pending = true; queueMicrotask(() => { pending = false; if (!disposed) render(); }); }
  function render() {
    globalThis.previewHarness = harness; cursor = 0; result = usePlayback(options);
    result.draftVideos.forEach((ref, index) => {
      ref.current = videos[index]; const asset = result.slots[index]?.scene.selected;
      if (videos[index].dataset.assetId !== (asset?.id || '')) { videos[index].dataset = { assetId: asset?.id || '', loadedAssetId: asset?.id || '' }; videos[index].currentTime = 0; }
    });
    for (const effect of effects) if (effect?.dirty) { effect.dirty = false; effect.cleanup?.(); effect.cleanup = effect.callback(); }
  }
  render();
  return { get playback() { return result; }, options, videos, nodes, gains, errors,
    tick(time) { clock = time; const callbacks = [...animationFrames.values()]; animationFrames.clear(); callbacks.forEach((callback) => callback(performance.now() + time * 1000)); },
    voice(enabled) { options.voiceEnabled = enabled; render(); },
    project(next) { options.project = next; render(); },
    dispose() { disposed = true; effects.forEach((effect) => effect?.cleanup?.()); Object.assign(globalThis, originals); delete globalThis.previewHarness; }
  };
}

test('timeline helpers retain exact offsets and skip only missing visuals', () => {
  const draft = project(true);
  assert.equal(sceneOffset(draft, 2), 9);
  assert.equal(sceneAt(draft, 4.99), 0);
  assert.equal(sceneAt(draft, 5), 1);
  assert.equal(sceneAt(draft, 14), 2);
  assert.equal(nextVideoScene(draft, 0), 2);
});

test('a split of an unfilled scene keeps the saved narration audible on approved draft scenes', async () => {
  const draft = project(true);
  draft.scenes.splice(1, 1, { ...draft.scenes[1], id: 'split-a', text: 'Text', duration: 2 }, { ...draft.scenes[1], id: 'split-b', text: '1', duration: 2 });
  const app = mount(draft);
  try {
    app.playback.play('film'); await settle();
    assert.equal(app.playback.playing, true);
    assert.deepEqual(app.nodes.map((node) => node.offsets), [[0]]);
    app.tick(5.05); await settle();
    assert.deepEqual(app.nodes.map((node) => node.offsets), [[0], [9]]);
  } finally { app.dispose(); }
});

test('a delayed decoded frame keeps the outgoing slot and one narration source across a normal cut', async () => {
  const app = mount();
  try {
    await settle(); app.videos[1].autoFrames = false;
    app.playback.play('film'); await settle();
    assert.equal(app.playback.playing, true); assert.equal(app.playback.visibleSlot, 0); assert.equal(app.nodes.length, 1);
    app.tick(5.05); await settle();
    assert.equal(app.playback.visibleSlot, 0, 'retain outgoing frame while incoming callback is pending');
    assert.equal(app.playback.preparing, false, 'ordinary cuts do not show a preparation overlay');
    assert.equal(app.nodes.length, 1); assert.equal(app.nodes[0].stopped, 0);
    app.videos[1].present(); await settle();
    assert.equal(app.playback.visibleSlot, 1); assert.equal(app.options.active, 1);
    assert.equal(app.nodes.length, 1, 'adjacent scene shares the original AudioBufferSourceNode');
    app.voice(false); assert.equal(app.gains[0].gain.value, 0); assert.equal(app.nodes[0].stopped, 0);
    app.voice(true); assert.equal(app.gains[0].gain.value, 1); assert.equal(app.nodes.length, 1);
    app.tick(6); app.playback.stop(); await settle();
    assert.equal(app.playback.playing, false); assert.equal(app.options.elapsed, 6); assert.equal(app.nodes[0].stopped, 1);
    app.videos[1].autoFrames = true; app.playback.play('film'); await settle();
    assert.equal(app.nodes.length, 2); assert.equal(app.nodes[1].offsets[0], 6, 'resume uses the saved global audio position');
    app.playback.seekTo(2.5); await settle();
    assert.equal(app.options.elapsed, 2.5); assert.equal(app.options.active, 0); assert.equal(app.nodes[1].stopped, 1);
    assert.equal(app.videos[app.playback.visibleSlot].currentTime, 3.5, 'seek includes source trim offset');
    assert.deepEqual(app.errors, []);
  } finally { app.dispose(); }
});

test('missing draft intervals jump narration once rather than playing their unseen text', async () => {
  const app = mount(project(true));
  try {
    await settle(); app.playback.play('film'); await settle(); app.tick(5.05); await settle();
    assert.equal(app.options.active, 2); assert.equal(app.playback.visibleSlot, 1);
    assert.equal(app.nodes.length, 2); assert.equal(app.nodes[0].stopped, 1);
    assert.equal(app.nodes[1].offsets[0], 9, 'jump over the missing scene audio interval');
    assert.deepEqual(app.errors, []);
  } finally { app.dispose(); }
});

test('rendered movie starts inside the click and highlighting does not restart its element', async () => {
  const movie = new Video(); movie.muted = false;
  const app = mount({ ...project(), exportUrl: '/complete.mp4' }, movie);
  try {
    app.playback.play('film'); assert.equal(movie.playCalls, 1, 'play is invoked before an asynchronous load');
    await settle(); movie.currentTime = 6; app.tick(6); await settle();
    assert.equal(app.options.active, 1); assert.equal(movie.playCalls, 1); assert.equal(app.nodes.length, 0);
    app.voice(false); assert.equal(movie.muted, true); assert.equal(movie.paused, false);
    app.playback.seekTo(3); assert.equal(movie.currentTime, 3); assert.equal(movie.paused, true);
    assert.deepEqual(app.errors, []);
  } finally { app.dispose(); }
});

test('unmount cancels a pending handoff and stops the continuous voice', async () => {
  const app = mount();
  await settle(); app.videos[1].autoFrames = false; app.playback.play('film'); await settle();
  app.tick(5.05); await settle(); const oldActive = app.options.active;
  app.dispose(); app.videos[1].present(); await settle();
  assert.equal(app.nodes[0].stopped, 1); assert.equal(app.options.active, oldActive);
  assert.equal(app.videos[0].paused, true); assert.equal(app.videos[1].paused, true);
});


test('changing project cancels pending frames, clears old slots and resets the timeline', async () => {
  const app = mount();
  try {
    await settle(); app.videos[1].autoFrames = false; app.playback.play('film'); await settle();
    app.tick(5.05); await settle();
    app.project({ ...project(), id: 'project-b' });
    app.videos[1].present(); await settle();
    assert.equal(app.nodes[0].stopped, 1); assert.equal(app.options.elapsed, 0); assert.equal(app.options.active, 0);
    assert.equal(app.playback.playing, false); assert.equal(app.playback.preparing, false);
    assert.equal(app.videos[0].paused, true); assert.equal(app.videos[1].paused, true);
    assert.deepEqual(app.errors, []);
  } finally { app.dispose(); }
});

test('a failed background preload leaves the front slot playing until its boundary', async () => {
  const app = mount();
  try {
    await settle(); app.videos[1].autoFrames = false; app.playback.play('film'); await settle();
    app.videos[1].error = { code: 3 }; app.videos[1].present(); await settle();
    assert.equal(app.playback.visibleSlot, 0); assert.equal(app.playback.playing, true); assert.equal(app.playback.preparing, false);
    app.tick(5.05); await settle();
    assert.equal(app.playback.visibleSlot, 0); assert.equal(app.playback.preparing, false);
    assert.equal(app.playback.playing, false); assert.equal(app.errors.length, 1);
  } finally { app.dispose(); }
});


test('a late rejection from warmup play cannot pause a slot after its decoded frame was accepted', async () => {
  const video = new Video(); video.autoFrames = false;
  let rejectPlay;
  video.play = () => new Promise((_resolve, reject) => { rejectPlay = reject; });
  const ready = decodedVideoFrame(video, 2, new AbortController().signal);
  await new Promise(setImmediate); video.present(); await ready;
  video.paused = false; // The foreground handoff has resumed this element.
  rejectPlay(new DOMException('The play request was interrupted by pause', 'AbortError'));
  await new Promise(setImmediate);
  assert.equal(video.paused, false, 'a completed warmup cannot pause its new foreground session');
});
