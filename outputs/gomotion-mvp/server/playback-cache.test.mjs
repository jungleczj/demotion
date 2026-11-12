import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat, utimes, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { retainTaskMedia } from './media-retention.mjs';

async function cacheEntry(folder, key, bytes, ageMs) {
  for (const extension of ['mp4', 'jpg']) {
    const file = path.join(folder, `${key}.${extension}`);
    // Actual disk files test eviction only; these bytes are never decoded.
    await writeFile(file, Buffer.alloc(bytes, 1));
    const time = new Date(Date.now() - ageMs);
    await utimes(file, time, time);
  }
}

test('disk pruning keeps saved task and warm cache files while removing expired unreferenced media', async () => {
  const { prunePlaybackCache } = await import('./playback-cache.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'gomotion-saved-playback-')), folder = path.join(root, 'playback');
  const saved = 'a'.repeat(64), expired = 'b'.repeat(64), warm = 'c'.repeat(64), fresh = 'd'.repeat(64);
  try {
    await mkdir(folder);
    for (const key of [saved, expired, warm]) await cacheEntry(folder, key, 4, 48 * 3600_000);
    await cacheEntry(folder, fresh, 4, 0);
    retainTaskMedia(root, [{ project: { scenes: [{ selected: { playbackKey: saved } }] } }]);
    await prunePlaybackCache(folder, { limit: 100, warm: new Map([[warm, Date.now() + 60000]]) });
    for (const key of [saved, warm, fresh]) for (const extension of ['mp4', 'jpg']) assert.equal((await stat(path.join(folder, `${key}.${extension}`))).size, 4);
    for (const extension of ['mp4', 'jpg']) await assert.rejects(stat(path.join(folder, `${expired}.${extension}`)), { code: 'ENOENT' });
    retainTaskMedia(root, []);
    await prunePlaybackCache(folder, { limit: 100 });
    await assert.rejects(stat(path.join(folder, `${saved}.mp4`)), { code: 'ENOENT' });
  } finally { retainTaskMedia(root, []); await rm(root, { recursive: true, force: true }); }
});

test('capacity pressure refuses a new reservation instead of deleting a saved task cache', async () => {
  const { prunePlaybackCache } = await import('./playback-cache.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'gomotion-full-playback-')), folder = path.join(root, 'playback');
  const saved = 'a'.repeat(64), unreferenced = 'b'.repeat(64);
  try {
    await mkdir(folder);
    for (const key of [saved, unreferenced]) await cacheEntry(folder, key, 12, 0);
    retainTaskMedia(root, [{ project: { scenes: [{ selected: { playbackKey: saved } }] } }]);
    await assert.rejects(prunePlaybackCache(folder, { limit: 20, reserve: 10 }), /视频缓存正在被使用/);
    assert.equal((await stat(path.join(folder, `${saved}.mp4`))).size, 12);
    assert.equal((await stat(path.join(folder, `${saved}.jpg`))).size, 12);
    await assert.rejects(stat(path.join(folder, `${unreferenced}.mp4`)), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(folder, `${unreferenced}.jpg`)), { code: 'ENOENT' });
  } finally { retainTaskMedia(root, []); await rm(root, { recursive: true, force: true }); }
});
