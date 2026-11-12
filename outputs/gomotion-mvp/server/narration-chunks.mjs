import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { estimateNarrationSeconds } from '../shared/narration-duration.mjs';
import { probe, run } from './process.mjs';

export const CHUNK_CHARACTERS = 1200;
export const CHUNK_SECONDS = 60;
export const CHUNK_CONCURRENCY = 3;
export const activeNarrationDirectories = new Map();
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function fileHash(file) { const value = createHash('sha256'); for await (const bytes of createReadStream(file)) value.update(bytes); return value.digest('hex'); }
const hex = (value) => /^[a-f0-9]{64}$/.test(value || '');
const chunkKey = (parent, index, textHash) => hash(JSON.stringify({ version: 1, parent, index, textHash }));

// Every character belongs to exactly one chunk. Prefer sentence/paragraph ends,
// then clause/word ends. Only an overlong unbroken token requires a hard split.
export function splitNarration(text, style) {
  const chunks = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + CHUNK_CHARACTERS);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    let left = offset + 1, right = end;
    while (left < right) { const middle = Math.ceil((left + right) / 2); if (estimateNarrationSeconds(text.slice(offset, middle), style) <= CHUNK_SECONDS) left = middle; else right = middle - 1; }
    end = Math.min(end, left);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    if (end < text.length) {
      const candidate = text.slice(offset, end), minimum = Math.floor(candidate.length * .45);
      const sentence = [...candidate.matchAll(/[。！？.!?](?:[”’"')\]]*)\s*|\n+/gu)].filter((match) => match.index + match[0].length >= minimum).at(-1);
      const clause = [...candidate.matchAll(/[,，、;；:：]\s*|\s+/gu)].filter((match) => match.index + match[0].length >= minimum).at(-1);
      const boundary = sentence || clause;
      if (boundary) end = offset + boundary.index + boundary[0].length;
    }
    // A Unicode scalar may occupy two JS characters.
    if (end <= offset) end = offset + (text.codePointAt(offset) > 0xffff ? 2 : 1);
    chunks.push(text.slice(offset, end)); offset = end;
  }
  return chunks;
}

export function narrationPlan(text, voice, style, model, voiceStyle) {
  const request = { textHash: hash(text), voice, styleHash: hash(style), model };
  const key = hash(JSON.stringify({ version: 1, ...request }));
  const texts = splitNarration(text, voiceStyle);
  const chunks = texts.map((text, index) => { const textHash = hash(text); return { index, key: chunkKey(key, index, textHash), textHash, characters: text.length }; });
  return { manifest: { version: 1, key, request, chunks }, texts };
}

export function validNarrationManifest(manifest, key) {
  if (!hex(key) || manifest?.version !== 1 || manifest.key !== key || !hex(manifest.request?.textHash) || !hex(manifest.request?.styleHash) || typeof manifest.request?.voice !== 'string' || typeof manifest.request?.model !== 'string') return false;
  if (hash(JSON.stringify({ version: 1, textHash: manifest.request.textHash, voice: manifest.request.voice, styleHash: manifest.request.styleHash, model: manifest.request.model })) !== key) return false;
  const chunks = manifest.chunks;
  return Array.isArray(chunks) && chunks.length > 1 && chunks.length <= 25000 && chunks.every((chunk, index) => chunk.index === index && hex(chunk.textHash) && chunk.key === chunkKey(key, index, chunk.textHash) && Number.isSafeInteger(chunk.characters) && chunk.characters > 0 && chunk.characters <= CHUNK_CHARACTERS) && chunks.reduce((sum, chunk) => sum + chunk.characters, 0) <= 25000;
}

export async function atomicJSON(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value)); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export const receiptPath = (file) => file.replace(/\.wav$/u, '.json');
export async function writeNarrationReceipt(file, identity, duration) {
  await atomicJSON(receiptPath(file), { version: 1, identity, bytes: (await stat(file)).size, duration, sha256: await fileHash(file) });
}
export async function checkedNarrationArtifact(file, identity, signal, maximum = Infinity) {
  try {
    signal?.throwIfAborted();
    const receipt = JSON.parse(await readFile(receiptPath(file), 'utf8')), info = await stat(file);
    if (receipt.version !== 1 || receipt.identity !== identity || !hex(receipt.sha256) || !info.isFile() || receipt.bytes !== info.size || info.size <= 44 || !Number.isFinite(receipt.duration) || receipt.duration < .3 || receipt.duration > maximum || await fileHash(file) !== receipt.sha256) return null;
    const audio = await probe(file, signal);
    if (!audio.hasAudio || Math.abs(audio.duration - receipt.duration) > .002) return null;
    return { file, duration: audio.duration };
  } catch { signal?.throwIfAborted(); return null; }
}

export async function ensureNarrationManifest(directory, manifest) {
  let existing;
  try { existing = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); } catch {}
  if (JSON.stringify(existing) !== JSON.stringify(manifest)) {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await atomicJSON(path.join(directory, 'manifest.json'), manifest);
  }
}

export async function verifiedNarrationChunkFiles(work, progress) {
  const key = progress?.key;
  if (progress?.version !== 1 || !hex(key)) return [];
  const directory = path.join(work, 'narration', 'chunks', key);
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (!validNarrationManifest(manifest, key) || !Array.isArray(progress.chunkKeys) || JSON.stringify(progress.chunkKeys) !== JSON.stringify(manifest.chunks.map((chunk) => chunk.key))) return [];
    const files = [path.join(directory, 'manifest.json')];
    for (const chunk of manifest.chunks) {
      const file = path.join(directory, chunk.key + '.wav');
      if (await checkedNarrationArtifact(file, `${key}:${chunk.key}`, undefined, 180)) files.push(file, receiptPath(file));
    }
    return files.length > 1 ? files : [];
  } catch { return []; }
}

// Limit actual paid requests across all films, including callers waiting for a
// slot. An aborted film cannot take a queued slot or cancel another film.
let active = 0;
const waiting = [];
function wake() { while (active < CHUNK_CONCURRENCY && waiting.length) { const entry = waiting.shift(); entry.signal?.removeEventListener('abort', entry.abort); if (entry.signal?.aborted) { entry.reject(entry.signal.reason); continue; } active++; entry.resolve(); } }
export async function withNarrationSlot(signal, action) {
  signal?.throwIfAborted();
  await new Promise((resolve, reject) => { const entry = { signal, resolve, reject, abort: () => { const index = waiting.indexOf(entry); if (index !== -1) waiting.splice(index, 1); reject(signal.reason); } }; waiting.push(entry); signal?.addEventListener('abort', entry.abort, { once: true }); wake(); });
  try { signal?.throwIfAborted(); return await action(); }
  finally { active--; wake(); }
}

export async function assembleNarration(files, output, signal) {
  const list = `${output}.${randomUUID()}.concat.txt`;
  try {
    // concat demuxer keeps every sample, without crossfade, silence insertion,
    // resampling, or another silence-removal pass over the joins.
    await writeFile(list, files.map((file) => `file '${path.resolve(file).replaceAll("'", "'\\''")}'`).join('\n'));
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'copy', '-f', 'wav', output], signal);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', output, '-f', 'null', '-'], signal);
    const info = await probe(output, signal);
    if (!info.hasAudio || info.duration < .3) throw Error('旁白拼接未包含有效音轨');
    return info;
  } finally { await rm(list, { force: true }); }
}
