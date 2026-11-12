import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { retainTaskMedia, retainedMedia } from './media-retention.mjs';
import { playbackKey as keyForPlayback } from './playback.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('legacy migration preserves receipt paths, source hashes and cached playback names and can repair its alias', async () => {
  const { initializeDataDirectory } = await import('./data-directory.mjs');
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-directory-migration-'));
  const directory = path.join(fixture, 'app/work'), legacyDirectory = path.join(fixture, 'old-temp/gomotion-local-mvp');
  try {
    await mkdir(path.join(legacyDirectory, 'productions'), { recursive: true });
    await mkdir(path.join(legacyDirectory, 'source-images'));
    await mkdir(path.join(legacyDirectory, 'playback'));
    const original = Buffer.from('source-image-bytes-kept-exactly');
    const source = { localPath: path.join(legacyDirectory, 'source-images/image.source'), decodedPath: path.join(legacyDirectory, 'source-images/image.png'), sha256: digest(original), decodedSha256: digest(original) };
    const playbackKey = keyForPlayback({ id: 'upload:existing', localPath: source.localPath }, 30);
    const asset = { id: 'upload:existing', ...source, playbackKey, sourceAssets: [source] };
    const tasks = [{ id: 'fixture-task', status: 'cancelled', project: { id: 'fixture-project', scenes: [{ selected: asset, motionGraphic: { sourceAssets: [source] } }] } }];
    const jobs = JSON.stringify(tasks), catalog = JSON.stringify([asset]);
    await writeFile(path.join(legacyDirectory, 'productions/jobs.json'), jobs);
    await writeFile(path.join(legacyDirectory, 'assets.json'), catalog);
    await writeFile(source.localPath, original);
    await writeFile(source.decodedPath, original);
    await writeFile(path.join(legacyDirectory, `playback/${playbackKey}.mp4`), 'existing-playback-cache');
    const result = await initializeDataDirectory({ directory, legacyDirectory });
    assert.equal(result.migrated, true);
    assert.equal(await readFile(path.join(directory, 'productions/jobs.json'), 'utf8'), jobs);
    assert.equal(await readFile(path.join(directory, 'assets.json'), 'utf8'), catalog);
    assert.equal(await realpath(legacyDirectory), await realpath(directory));
    assert.equal(digest(await readFile(source.localPath)), source.sha256);
    assert.equal(await readFile(path.join(directory, `playback/${playbackKey}.mp4`), 'utf8'), 'existing-playback-cache');
    retainTaskMedia(directory, tasks);
    assert.equal(retainedMedia(path.join(directory, 'source-images/image.source')), true, 'retention follows the compatibility alias into durable storage');
    assert.equal(await readFile(path.join(result.backupDirectory, 'productions/jobs.json'), 'utf8'), jobs, 'the original copy is kept as a migration backup');
    await rm(path.dirname(legacyDirectory), { recursive: true });
    await initializeDataDirectory({ directory, legacyDirectory: path.join(fixture, 'new-temp/gomotion-local-mvp') });
    assert.equal(await realpath(legacyDirectory), await realpath(directory), 'the saved alias is repaired even after TMPDIR changes');
    assert.equal(digest(await readFile(source.localPath)), source.sha256);
    assert.equal(keyForPlayback(asset, 30), playbackKey);
    assert.equal(await readFile(path.join(directory, `playback/${playbackKey}.mp4`), 'utf8'), 'existing-playback-cache');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('repairing a migrated alias refuses to replace a new occupant of the legacy path', async () => {
  const { initializeDataDirectory } = await import('./data-directory.mjs');
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-directory-occupied-'));
  const directory = path.join(fixture, 'app/work'), legacyDirectory = path.join(fixture, 'temp/gomotion-local-mvp');
  try {
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, 'original'), 'durable-source');
    await initializeDataDirectory({ directory, legacyDirectory });
    await rm(legacyDirectory);
    await mkdir(legacyDirectory);
    await writeFile(path.join(legacyDirectory, 'occupant'), 'leave-this-file-alone');
    await assert.rejects(initializeDataDirectory({ directory, legacyDirectory }), /旧数据路径已被其他文件占用/);
    assert.equal(await readFile(path.join(legacyDirectory, 'occupant'), 'utf8'), 'leave-this-file-alone');
    assert.equal(await readFile(path.join(directory, 'original'), 'utf8'), 'durable-source');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('an explicit data directory creates no temporary-directory migration or fabricated records', async () => {
  const { initializeDataDirectory } = await import('./data-directory.mjs');
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-directory-explicit-'));
  const directory = path.join(fixture, 'configured-volume'), unrelatedLegacy = path.join(fixture, 'temp/gomotion-local-mvp');
  try {
    await mkdir(unrelatedLegacy, { recursive: true });
    await writeFile(path.join(unrelatedLegacy, 'sentinel'), 'legacy-data-not-selected');
    await initializeDataDirectory({ directory });
    assert.equal(await readFile(path.join(unrelatedLegacy, 'sentinel'), 'utf8'), 'legacy-data-not-selected');
    await assert.rejects(stat(path.join(directory, 'sentinel')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(directory, 'productions/jobs.json')), { code: 'ENOENT' });
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('an existing durable directory and legacy files are never merged or overwritten', async () => {
  const { initializeDataDirectory } = await import('./data-directory.mjs');
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-directory-existing-'));
  const directory = path.join(fixture, 'app/work'), legacyDirectory = path.join(fixture, 'temp/gomotion-local-mvp');
  try {
    for (const folder of [directory, legacyDirectory]) await mkdir(path.join(folder, 'productions'), { recursive: true });
    await writeFile(path.join(directory, 'productions/jobs.json'), 'existing-stable-records');
    await writeFile(path.join(legacyDirectory, 'productions/jobs.json'), 'existing-legacy-records');
    const result = await initializeDataDirectory({ directory, legacyDirectory });
    assert.equal(result.migrated, false);
    assert.equal(result.legacyPreserved, true);
    assert.equal(await readFile(path.join(directory, 'productions/jobs.json'), 'utf8'), 'existing-stable-records');
    assert.equal(await readFile(path.join(legacyDirectory, 'productions/jobs.json'), 'utf8'), 'existing-legacy-records');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('a missing legacy directory creates storage without fabricating a jobs file', async () => {
  const { initializeDataDirectory } = await import('./data-directory.mjs');
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'gomotion-directory-missing-'));
  const directory = path.join(fixture, 'app/work');
  try {
    const result = await initializeDataDirectory({ directory, legacyDirectory: path.join(fixture, 'temp/gomotion-local-mvp') });
    assert.equal(result.migrated, false);
    assert.equal((await stat(directory)).isDirectory(), true);
    await assert.rejects(stat(path.join(directory, 'productions/jobs.json')), { code: 'ENOENT' });
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
