import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const folder = await mkdtemp(path.join(fileURLToPath(new URL('../../', import.meta.url)), '.creator-generation-contract-'));
const file = path.join(folder, 'creator.mjs');
await build({ entryPoints: [fileURLToPath(new URL('./Creator.tsx', import.meta.url))], outfile: file, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], logLevel: 'silent' });
const { default: Creator } = await import(pathToFileURL(file));
after(() => rm(folder, { recursive: true, force: true }));
const button = (config, providers = ['pixabay']) => renderToStaticMarkup(createElement(Creator, { config, providers, onSources() {}, onGenerate() {}, onError() {} })).match(/<button class="primary generate-button"[^>]*>/)?.[0];

test('Generate video becomes enabled when the production API reports a ready durable worker', () => {
  const html = button({ runtime: 'vercel', render: true });
  assert.ok(html); assert.doesNotMatch(html, /disabled/);
});
test('Generate stays disabled while config is loading or production resources are unavailable', () => {
  assert.match(button(null), /disabled/);
  assert.match(button({ runtime: 'vercel', render: false }), /disabled/);
});
test('Generate still requires a usable material source', () => {
  assert.match(button({ runtime: 'vercel', render: true }, []), /disabled/);
});

test('script input and visible counter share the 25,000 character limit', () => {
  const html = renderToStaticMarkup(createElement(Creator, { config: { render: true }, providers: ['pixabay'], onSources() {}, onGenerate() {}, onError() {} }));
  assert.match(html, /<textarea[^>]*aria-label="视频脚本"[^>]*maxLength="25000"/i);
  assert.match(html, /\/ 25,000/);
  assert.doesNotMatch(html, /\/ 5,000/);
});

test('a saved 25,000-character draft can generate while an oversized restored draft cannot', () => {
  const previous = globalThis.localStorage;
  try {
    for (const length of [25000, 25001]) {
      globalThis.localStorage = { getItem: () => JSON.stringify({ script: '海'.repeat(length) }) };
      const html = button({ render: true });
      if (length === 25000) assert.doesNotMatch(html, /disabled/);
      else assert.match(html, /disabled/);
    }
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
