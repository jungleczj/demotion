import { mkdir, readFile, writeFile, stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import samples from '../shared/voice-samples.json' with { type: 'json' };
import { probe } from './process.mjs';

const folder = path.join(os.tmpdir(), 'gomotion-local-mvp', 'voice-samples');
const pending = new Map();
export const voiceSamplePath = (key) => path.join(folder, `${key}.wav`);

export async function voiceSample(key) {
  if (!Object.hasOwn(samples, key)) throw new Error('没有对应声音的试听文件');
  await mkdir(folder, { recursive: true });
  const file = voiceSamplePath(key);
  try { if ((await stat(file)).size > 44) return file; } catch {}
  if (!pending.has(key)) pending.set(key, (async () => {
    const response = await fetch(`https://firebase.google.com${samples[key]}`, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`声音样例暂不可用（${response.status}）`); }
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) throw new Error('试听文件超过容量限制');
      chunks.push(chunk);
    }
    const temporary = `${file}.partial`;
    try {
      await writeFile(temporary, Buffer.concat(chunks));
      const info = await probe(temporary);
      if (!info.hasAudio || info.duration < .5) throw new Error('试听音频无法播放');
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    return file;
  })().finally(() => pending.delete(key)));
  return pending.get(key);
}

let catalogPreparation;
export async function readyVoices() {
  if (!catalogPreparation) catalogPreparation = (async () => {
    const ready = [], keys = Object.keys(samples);
    let cursor = 0;
    async function worker() {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        try { await voiceSample(key); ready.push(key); } catch {}
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return ready;
  })().finally(() => { catalogPreparation = null; });
  return catalogPreparation;
}
