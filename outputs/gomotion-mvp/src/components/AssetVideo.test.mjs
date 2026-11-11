import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

// Controlled component state, not a browser playback or compositor test.
const folder = await mkdtemp(path.join(fileURLToPath(new URL('../../', import.meta.url)), '.asset-video-state-'));
const adapter = path.join(folder, 'hooks.mjs'), bundle = path.join(folder, 'component.mjs');
await writeFile(adapter, `export const useState=(...args)=>globalThis.assetVideoHarness.useState(...args); export const useRef=(...args)=>globalThis.assetVideoHarness.useRef(...args); export const useEffect=()=>{};`);
await build({ entryPoints: [fileURLToPath(new URL('./AssetVideo.tsx', import.meta.url))], outfile: bundle, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react/jsx-runtime', 'lucide-react'], plugins: [{ name: 'controlled-hooks', setup(build) { build.onResolve({ filter: /^react$/ }, () => ({ path: adapter })); } }], logLevel: 'silent' });
const { default: AssetVideo } = await import(pathToFileURL(bundle));
after(async () => { delete globalThis.assetVideoHarness; await rm(folder, { recursive: true, force: true }); });

function mount() {
  let cursor = 0; const state = [], notices = [], unavailable = [];
  const props = { asset: { id: 'new-asset', playbackUrl: '/api/playback/new.mp4' }, onPlayable: (value) => notices.push(value), onUnavailable: () => unavailable.push(true) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
  };
  function render() { cursor = 0; globalThis.assetVideoHarness = hooks; return AssetVideo(props).props.children[0].props; }
  const event = (url) => ({ currentTarget: { currentSrc: `http://localhost:3027${url}`, ownerDocument: { baseURI: 'http://localhost:3027/' }, readyState: 4 } });
  return { render, event, notices, unavailable };
}

test('a URL assignment is not labelled as a loaded frame', () => {
  const app = mount(); assert.equal(app.render()['data-loaded-asset-id'], '');
});

test('only a loaded-data event for the assigned URL marks its frame ready', () => {
  const app = mount(); let video = app.render();
  assert.equal(typeof video.onLoadedData, 'function');
  video.onLoadedData(app.event('/api/playback/old.mp4'));
  assert.equal(app.render()['data-loaded-asset-id'], '');
  video.onLoadedData(app.event('/api/playback/new.mp4'));
  assert.equal(app.render()['data-loaded-asset-id'], 'new-asset');
});

test('late canplay from a previous URL cannot mark the new asset playable', () => {
  const app = mount(), video = app.render();
  video.onCanPlay(app.event('/api/playback/old.mp4')); assert.deepEqual(app.notices, []);
  video.onCanPlay(app.event('/api/playback/new.mp4')); assert.deepEqual(app.notices, [true]);
});

test('an old resource error cannot mark the next assigned video unavailable', () => {
  const app = mount(), video = app.render(), event = app.event('/api/playback/old.mp4');
  event.currentTarget.getAttribute = () => '/api/playback/new.mp4';
  event.currentTarget.error = { code: 4 };
  video.onError(event);
  assert.equal(app.render()['data-playback-error'], undefined);
  assert.deepEqual(app.unavailable, []);
  assert.deepEqual(app.notices, []);
});
