import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = await mkdtemp(path.join(root, '.creator-service-contract-'));
const file = path.join(folder, 'creator.mjs');
await build({ entryPoints: [fileURLToPath(new URL('./Creator.tsx', import.meta.url))], outfile: file, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], logLevel: 'silent' });
const { default: Creator } = await import(pathToFileURL(file));
after(() => rm(folder, { recursive: true, force: true }));

test('a connected catalog without a production worker does not offer a broken generation action', () => {
  const html = renderToStaticMarkup(createElement(Creator, { config: { render: false }, providers: ['commons'], onSources() {}, onGenerate() {}, onError() {} }));
  assert.match(html, /class="primary generate-button" disabled=""/);
  assert.match(html, /视频制作服务尚未就绪/);
});

test('the local full backend retains the normal generation action', () => {
  const html = renderToStaticMarkup(createElement(Creator, { config: { render: true }, providers: ['commons'], onSources() {}, onGenerate() {}, onError() {} }));
  assert.doesNotMatch(html, /class="primary generate-button" disabled=""/);
  assert.doesNotMatch(html, /视频制作服务尚未就绪/);
});
