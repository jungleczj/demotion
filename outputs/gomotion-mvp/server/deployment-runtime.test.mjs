import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';

test('the voice catalog loads without downloading thirty unrelated sample recordings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'demotion-cold-catalog-'));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      globalThis.fetch = async () => { throw new Error('catalog must not fetch recordings'); };
      const { readyVoices } = await import('./server/voice-samples.mjs');
      console.log(JSON.stringify(await readyVoices()));
    `], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, TMPDIR: directory, GOMOTION_DATA_DIR: directory } });
    const voices = JSON.parse(stdout);
    assert.equal(voices.length, 30);
    assert.ok(voices.includes('Kore') && voices.includes('Puck') && voices.includes('Fenrir'));
    assert.equal(new Set(voices).size, 30);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all durable media paths follow the configured server data directory', async () => {
  const directory = path.join(os.tmpdir(), 'demotion-persistent-volume-contract');
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import { narrationPath } from './server/narration.mjs';
    import { playbackPath } from './server/playback.mjs';
    import { voiceSamplePath } from './server/voice-samples.mjs';
    console.log(JSON.stringify([narrationPath('recording'), playbackPath('clip'), voiceSamplePath('Kore')]));
  `], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, GOMOTION_DATA_DIR: directory } });
  assert.deepEqual(JSON.parse(stdout), [path.join(directory, 'narration/recording.wav'), path.join(directory, 'playback/clip.mp4'), path.join(directory, 'voice-samples/Kore.wav')]);
});
