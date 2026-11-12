import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const folder = await mkdtemp(path.join(fileURLToPath(new URL('../../', import.meta.url)), '.settings-source-contract-'));
const file = path.join(folder, 'settings.mjs');
await build({ entryPoints: [fileURLToPath(new URL('./Settings.tsx', import.meta.url))], outfile: file, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], logLevel: 'silent' });
const { default: Settings } = await import(pathToFileURL(file));
after(() => rm(folder, { recursive: true, force: true }));
const render = (config) => renderToStaticMarkup(createElement(Settings, { config, selected: ['commons'], onSelect() {}, onConfig() {}, onClose() {}, onError() {} }));

test('YouTube is the first visible source instead of being hidden below the stock library list', () => {
  for (const config of [{ youtubeConnected: true }, { runtime: 'vercel', youtubeConnected: true }, { youtubeConnected: false }]) {
    const html = render(config);
    const sourceList = html.slice(html.indexOf('class="source-connections"'));
    const firstSourceLink = sourceList.match(/aria-label="打开 ([^"]+)"/)?.[1];
    assert.equal(firstSourceLink, 'YouTube Data API');
  }
});

test('the same source list includes the configured YouTube API as reference discovery with a real API documentation link', () => {
  const html = render({ youtubeConnected: true, youtubeDiscovery: true });
  assert.match(html, /aria-label="打开 YouTube Data API"/);
  assert.match(html, /href="https:\/\/developers.google.com\/youtube\/v3"/);
  assert.match(html, /已连接 · 检索参考/);
  assert.match(html, /aria-label="启用 YouTube 检索参考" aria-pressed="true"/);
  assert.match(html, /YouTube API key<input type="password"/);
  assert.doesNotMatch(html, /YouTube 暂作为外部发现入口/);
});

test('a missing YouTube key does not claim a connected source and keeps the reference toggle disabled', () => {
  const html = render({ youtubeConnected: false });
  const toggle = html.match(/<button[^>]+aria-label="启用 YouTube 检索参考"[^>]*>/)?.[0];
  assert.ok(toggle);
  assert.match(toggle, /disabled=""/);
  assert.match(toggle, /aria-pressed="false"/);
  assert.match(html, /粘贴你的 YouTube Data API key/);
});

test('Vercel shows the true server-managed connection without claiming an in-memory key save', () => {
  const html = render({ runtime: 'vercel', youtubeConnected: true, youtubeDiscovery: false });
  assert.match(html, /连接由线上服务安全保存/);
  assert.doesNotMatch(html, /密钥仅在本机服务内存中使用/);
  assert.match(html, /aria-label="启用 YouTube 检索参考" aria-pressed="false" disabled=""/);
});
