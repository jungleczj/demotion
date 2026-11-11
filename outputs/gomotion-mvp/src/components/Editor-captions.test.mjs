import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = await mkdtemp(path.join(root, '.editor-caption-contract-'));
const file = path.join(folder, 'editor.mjs');
await build({ entryPoints: [fileURLToPath(new URL('./Editor.tsx', import.meta.url))], outfile: file, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], logLevel: 'silent' });
const { default: Editor } = await import(pathToFileURL(file));
after(() => rm(folder, { recursive: true, force: true }));
const asset = { id: 'local-contract', provider: 'upload', kind: 'video', title: 'Local contract', width: 1280, height: 720, duration: 8 };
const base = { id: 'project-contract', title: '字幕检查', script: '字幕应该清晰。', voice: 'gemini:Kore', language: 'zh-CN', subtitles: true, fit: 'cover', scenes: [{ id: 'scene-contract', text: '字幕应该清晰。', duration: 8, start: 0, selected: asset, status: 'done' }] };
const render = (patch) => renderToStaticMarkup(createElement(Editor, { project: { ...base, ...patch }, providers: [], generating: false, onRemake: async () => {}, onChange() {}, onBack() {}, onError() {}, onCancel() {} }));

test('finished video captions cannot be dimmed by a second preview vignette', () => {
  const html = render({ format: 'landscape', exportUrl: '/api/exports/local/video.mp4' });
  assert.ok(!html.includes('class="video-vignette"'), 'a film already contains its captions and must not receive a dark overlay');
  assert.ok(!html.includes('class="video-caption"'), 'burned captions must not be duplicated');
});

for (const [format, width] of [['landscape', 600], ['portrait', 260]]) test(`${format} draft captions scale with the video canvas and retain opaque text`, () => {
  const html = render({ format });
  const caption = html.match(/class="video-caption" style="([^"]+)"/);
  assert.ok(caption, 'caption style must be driven by the shared output style');
  const font = Number(caption[1].match(/font-size:([\d.]+)cqw/)?.[1]);
  assert.ok(Number.isFinite(font), 'caption sizing must follow canvas width, not the page viewport');
  const expectedPixels = format === 'landscape' ? 27 / 1280 * width : 49 / 720 * width;
  assert.ok(Math.abs(font * width / 100 - expectedPixels) < .01, 'preview retains the original height-based caption size');
  assert.match(html, /background-color:rgba\(0, 0, 0, 0\.82\)/);
  assert.match(html, /color:#fff|color:white|color:#ffffff/);
});
