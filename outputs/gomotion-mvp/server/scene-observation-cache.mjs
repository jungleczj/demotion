import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = 1, TTL = 24 * 3600000, MAX_BYTES = 128 * 1024, MAX_ENTRIES = 256;
const digest = (value) => createHash('sha256').update(value).digest('hex');

// Only exact candidate-review requests are reusable. Final film approval, search,
// source-image checks and narration always retain their own execution path.
export function sceneCacheRequest(config, stage, endpoint, body, parts) {
  if (!/^visual-scene-\d+(?:-\d+)?$/.test(stage) || !path.isAbsolute(config.visionCacheDirectory || '') || !parts.some((p) => p.mime)) return null;
  const candidates = new Map();
  for (const part of parts) {
    if (typeof part.text !== 'string') continue;
    try {
      const item = JSON.parse(part.text);
      if (typeof item.assetId === 'string' && item.kind === 'video' && Number.isFinite(item.sourceStart) && Number.isFinite(item.analyzedUntil) && item.analyzedUntil > item.sourceStart) candidates.set(item.assetId, item);
    } catch {}
  }
  if (!candidates.size) return null;
  // body is the ACTUAL serialized provider payload, including media bytes,
  // full narrative context, generation settings and prompts. Store only its hash.
  const key = digest(JSON.stringify([VERSION, config.visionProvider, endpoint, digest(config.visionKey), digest(body)]));
  return { key, directory: config.visionCacheDirectory, candidates };
}

function completeResponse(data, request) {
  if (!Array.isArray(data?.observations) || data.observations.length !== request.candidates.size) return false;
  const seen = new Set();
  return data.observations.every((o) => {
    const media = request.candidates.get(o?.assetId);
    if (!media || seen.has(o.assetId)) return false;
    seen.add(o.assetId);
    return typeof o.observed === 'string' && o.observed.trim().length > 0 && typeof o.medium === 'string'
      && ['usable', 'hasMotion', 'hasWatermark', 'sharpnessAcceptable', 'orientationMatches'].every((key) => typeof o[key] === 'boolean')
      && Array.isArray(o.uncertainties) && o.uncertainties.every((x) => typeof x === 'string')
      && Array.isArray(o.intervals) && o.intervals.length <= 2 && (!o.usable || o.intervals.length > 0)
      && o.intervals.every((i) => i && typeof i === 'object' && Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start
        && i.start >= media.sourceStart - .05 && i.end <= media.analyzedUntil + .05 && typeof i.reason === 'string');
  });
}

export async function readSceneObservation(request) {
  if (!request) return null;
  try {
    const file = path.join(request.directory, `${request.key}.json`);
    if ((await stat(file)).size > MAX_BYTES) return null;
    const saved = JSON.parse(await readFile(file, 'utf8'));
    const age = Date.now() - saved.createdAt;
    if (saved.version !== VERSION || saved.key !== request.key || !Number.isFinite(saved.createdAt)
      || (saved.modelVersion !== undefined && typeof saved.modelVersion !== 'string')
      || !Number.isFinite(age) || age < 0 || age > TTL || !completeResponse(saved.data, request)) return null;
    return { data: saved.data, createdAt: saved.createdAt, modelVersion: saved.modelVersion };
  } catch { return null; }
}

export async function saveSceneObservation(request, data, signal, modelVersion) {
  if (!request || signal.aborted || !completeResponse(data, request)) return;
  const text = JSON.stringify({ version: VERSION, key: request.key, createdAt: Date.now(), modelVersion: typeof modelVersion === 'string' ? modelVersion.slice(0, 160) : undefined, data });
  if (Buffer.byteLength(text) > MAX_BYTES) return;
  const partial = path.join(request.directory, `${request.key}.${randomUUID()}.partial`);
  try {
    await mkdir(request.directory, { recursive: true, mode: 0o700 });
    await writeFile(partial, text, { mode: 0o600, flag: 'wx' });
    signal.throwIfAborted();
    await rename(partial, path.join(request.directory, `${request.key}.json`));
    const files = (await readdir(request.directory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
    if (files.length > MAX_ENTRIES) {
      const entries = await Promise.all(files.map(async (name) => ({ file: path.join(request.directory, name), modified: (await stat(path.join(request.directory, name))).mtimeMs })));
      entries.sort((a, b) => a.modified - b.modified);
      await Promise.all(entries.slice(0, entries.length - MAX_ENTRIES).map((entry) => rm(entry.file, { force: true })));
    }
  } catch {
    // An optional cache must never turn completed media inspection into failure.
  } finally { await rm(partial, { force: true }).catch(() => {}); }
}
