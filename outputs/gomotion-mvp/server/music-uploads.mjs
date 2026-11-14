import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateMusicFile } from './music-sources.mjs';
import { decodeMusicUpload, musicUploadReceipt, uploadReceiptError, musicUploadId, MUSIC_UPLOAD_MAX_BYTES } from './music-upload-input.mjs';

export async function saveMusicUpload(input, directory, { signal } = {}) {
  const decoded = decodeMusicUpload(input), id = randomUUID(), folder = path.resolve(directory);
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `${id}.audio`), temporary = `${file}.part`;
  try {
    await writeFile(temporary, decoded.bytes, { flag: 'wx', mode: 0o600 });
    let metadata;
    try { metadata = await validateMusicFile(temporary, signal, MUSIC_UPLOAD_MAX_BYTES, { uploaded: true }); }
    catch (error) { signal?.throwIfAborted(); throw Object.assign(Error('上传文件不是可完整解码的独立音频，请选择其他音频'), { status: error.code === 'ENOENT' ? 503 : 400 }); }
    const receipt = musicUploadReceipt(id, decoded.name, { ...metadata, fullDecode: true });
    await rename(temporary, file);
    await writeFile(`${file}.json`, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    return { id, name: receipt.name, sha256: receipt.sha256 };
  } catch (error) { await rm(file, { force: true }); throw error; }
  finally { await rm(temporary, { force: true }); }
}

export async function acquireUploadedMusic(upload, directory, { signal } = {}) {
  if (!musicUploadId(upload?.id)) throw Object.assign(Error('上传音乐标识无效'), { status: 400 });
  const file = path.join(path.resolve(directory), `${upload.id}.audio`);
  let receipt;
  try { receipt = JSON.parse(await readFile(`${file}.json`, 'utf8')); }
  catch { throw Object.assign(Error('上传音乐不存在，请重新上传'), { status: 404 }); }
  const error = uploadReceiptError(receipt, upload);
  if (error) throw Object.assign(Error(error), { status: 400 });
  const actual = await validateMusicFile(file, signal, MUSIC_UPLOAD_MAX_BYTES, { uploaded: true });
  if (actual.sha256 !== receipt.sha256 || actual.bytes !== receipt.bytes) throw Error('上传音乐原件散列已变化');
  return { ...receipt, ...actual, localPath: file, cacheHit: true, downloadedBytes: 0 };
}
