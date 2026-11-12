import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeDataDirectory } from './data-directory.mjs';

// One volume must own jobs, source receipts, playback and narration together.
export const workDirectory = process.env.GOMOTION_DATA_DIR
  ? path.resolve(process.env.GOMOTION_DATA_DIR)
  : fileURLToPath(new URL('../work', import.meta.url));

export async function initializeWorkDirectory() {
  const result = await initializeDataDirectory({ directory: workDirectory,
    legacyDirectory: process.env.GOMOTION_DATA_DIR ? undefined : path.join(os.tmpdir(), 'gomotion-local-mvp') });
  if (result.legacyPreserved) console.warn(`本地数据目录已存在，旧数据未合并或覆盖。当前：${workDirectory}；旧目录：${path.join(os.tmpdir(), 'gomotion-local-mvp')}`);
  return result;
}

export function allowedOrigins(port, value = process.env.APP_ORIGINS || '') {
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  for (const entry of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    const url = new URL(entry);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== entry) throw new Error('APP_ORIGINS 必须为逗号分隔的完整来源地址，不含路径或凭证');
    origins.add(url.origin);
  }
  return origins;
}
