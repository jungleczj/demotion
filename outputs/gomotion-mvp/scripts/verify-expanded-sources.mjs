// Explicit live acceptance: one CC0 museum image and one officially licensed
// Scott Buckley MP3, on demand. No keys, YouTube download, AI or service restart.
import { configureNetwork } from '../server/network.mjs';
import { searchSources } from '../server/sources.mjs';
import { acquireSourceImage } from '../server/source-images.mjs';
import { searchMusicSources, acquireMusicAsset } from '../server/music-sources.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const n = configureNetwork(), root = path.join(os.tmpdir(), 'gomotion-local-mvp', 'expanded-source-acceptance');
const output = path.resolve(process.argv.find((v) => v.startsWith('--report='))?.slice(9) || '../expanded-media-sources-live-2026-11-11.json');
await mkdir(root, { recursive: true });
const report = { at: new Date().toISOString(), modelRequests: 0, paidRequests: 0, network: { configured: n.configured, source: n.source }, operations: [] };
async function measure(name, action) {
  const start = Date.now();
  try { const result = await action(); report.operations.push({ name, ok: true, elapsedMs: Date.now() - start, result }); }
  catch (error) { report.operations.push({ name, ok: false, elapsedMs: Date.now() - start, error: error.message }); }
  await writeFile(output, JSON.stringify(report, null, 2));
}
let image;
await measure('cleveland-search', async () => { const result = await searchSources('bird', ['cleveland'], { expandSources: false }, 'image'); image = result.assets[0]; return { count: result.assets.length, queriedSources: result.queriedSources, first: image }; });
if (image) await measure('cleveland-original-full-decode', () => acquireSourceImage(image, path.join(root, 'image')));
let music;
await measure('scottbuckley-official-page', async () => { const result = await searchMusicSources('reflective', {}, { providers: ['scottbuckley'] }); music = result.assets[0]; return { count: result.assets.length, warnings: result.warnings, first: music }; });
if (music) {
  let acquired;
  await measure('scottbuckley-mp3-cold-local-cache', async () => { acquired = await acquireMusicAsset(music.id, path.join(root, 'music')); return acquired; });
  if (acquired) await measure('scottbuckley-mp3-warm-local-cache', () => acquireMusicAsset(music.id, path.join(root, 'music')));
}
console.log(JSON.stringify({ output, operations: report.operations.map(({ name, ok, elapsedMs, error }) => ({ name, ok, elapsedMs, error })) }));
if (report.operations.some((v) => !v.ok)) process.exitCode = 1;
