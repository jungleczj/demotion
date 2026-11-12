import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';

const receiptName = 'productions/.legacy-data-directory.json';
async function entry(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

async function restoreLegacyAlias(directory) {
  let receipt;
  try { receipt = JSON.parse(await readFile(path.join(directory, receiptName), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const legacy = receipt.legacyDirectory;
  if (receipt.version !== 1 || typeof legacy !== 'string' || !path.isAbsolute(legacy) || inside(directory, legacy) || inside(legacy, directory)) throw new Error('本地数据迁移凭据无效，已保留所有数据，请检查数据目录');
  const existing = await entry(legacy);
  if (existing) {
    if (existing.isSymbolicLink() && await realpath(legacy) === await realpath(directory)) return;
    throw new Error(`旧数据路径已被其他文件占用，已保留两份数据：${legacy}`);
  }
  await mkdir(path.dirname(legacy), { recursive: true });
  await symlink(directory, legacy, 'dir');
}

// Only a previously absent destination is migrated. Keep the original tree as
// a backup, and preserve the absolute path strings used by receipts/cache keys.
export async function initializeDataDirectory({ directory, legacyDirectory }) {
  directory = path.resolve(directory);
  const existing = await entry(directory);
  if (existing) {
    const physicalDirectory = await realpath(directory);
    if (!(await lstat(physicalDirectory)).isDirectory()) throw new Error(`数据目录不是文件夹：${directory}`);
    await restoreLegacyAlias(directory);
    const legacyPreserved = Boolean(legacyDirectory && path.resolve(legacyDirectory) !== directory && (await entry(legacyDirectory))?.isDirectory());
    return { directory, migrated: false, legacyPreserved };
  }
  const legacy = legacyDirectory && path.resolve(legacyDirectory);
  if (!legacy || !await entry(legacy)) {
    await mkdir(directory, { recursive: true });
    return { directory, migrated: false };
  }
  if (inside(directory, legacy) || inside(legacy, directory) || !(await lstat(legacy)).isDirectory()) throw new Error('旧数据路径不能安全迁移，已保留原文件，请显式设置 GOMOTION_DATA_DIR');
  await mkdir(path.dirname(directory), { recursive: true });
  const staging = `${directory}.migration-${randomUUID()}`;
  const backupDirectory = `${legacy}.migration-backup-${randomUUID()}`;
  try {
    await cp(legacy, staging, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, verbatimSymlinks: true });
    await mkdir(path.join(staging, 'productions'), { recursive: true });
    await writeFile(path.join(staging, receiptName), JSON.stringify({ version: 1, legacyDirectory: legacy, backupDirectory }), { flag: 'wx' });
    // A concurrent initializer must never cause existing durable files to be
    // replaced by this snapshot. rename also rejects a nonempty destination.
    if (await entry(directory)) throw new Error('数据目录在迁移期间已创建，已保留原文件，请重新启动');
    await rename(staging, directory);
    await rename(legacy, backupDirectory);
    try { await symlink(directory, legacy, 'dir'); }
    catch (error) {
      if (!await entry(legacy)) await rename(backupDirectory, legacy);
      throw error;
    }
    return { directory, migrated: true, backupDirectory };
  } finally { await rm(staging, { recursive: true, force: true }); }
}
