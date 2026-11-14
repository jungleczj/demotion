import { createHash } from 'node:crypto';

export const MUSIC_UPLOAD_MAX_BYTES = 3_000_000;
export const MUSIC_UPLOAD_BODY_BYTES = 4_010_000;
export const MUSIC_UPLOAD_EXTENSIONS = Object.freeze(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);
export const musicUploadId = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const fail = (message, status = 400) => Object.assign(Error(message), { status });

export function decodeMusicUpload(input) {
  if (typeof input?.name !== 'string' || !input.name.trim() || input.name.length > 180 || /[\x00-\x1f/\\]/.test(input.name)) throw fail('上传音乐文件名无效');
  const name = input.name.trim(), extension = name.split('.').at(-1).toLowerCase();
  if (!MUSIC_UPLOAD_EXTENSIONS.includes(extension)) throw fail('请选择 MP3、WAV、M4A、OGG、FLAC 或 AAC 音频');
  if (typeof input.data !== 'string' || !input.data || input.data.length > 4_000_000 || input.data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw fail('上传音频内容无效或超过 3MB', input?.data?.length > 4_000_000 ? 413 : 400);
  const bytes = Buffer.from(input.data, 'base64');
  if (bytes.toString('base64') !== input.data) throw fail('上传音频编码无效');
  if (!bytes.length || bytes.length > MUSIC_UPLOAD_MAX_BYTES) throw fail('上传音频不能超过 3MB', 413);
  return { name, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function musicUploadReceipt(id, name, metadata) {
  if (!musicUploadId(id) || !/^[a-f0-9]{64}$/.test(metadata?.sha256 || '') || metadata.fullDecode !== true || !Number.isSafeInteger(metadata.bytes) || metadata.bytes < 1 || metadata.bytes > MUSIC_UPLOAD_MAX_BYTES || !Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.duration > 1800) throw fail('上传音频未通过解码与完整性校验');
  return { id: `upload:${id}`, sourceId: id, provider: 'user-upload', kind: 'audio', title: name, name, author: '用户上传',
    license: 'User supplied', attribution: `用户上传：${name}`, rights: { userProvided: true },
    duration: metadata.duration, bytes: metadata.bytes, sha256: metadata.sha256, fullDecode: true,
    licenseEvidence: { method: 'uploaded-original-sha256', sha256: metadata.sha256 }, acquiredAt: new Date().toISOString() };
}

export function uploadReceiptError(receipt, upload) {
  if (!musicUploadId(upload?.id) || receipt?.id !== `upload:${upload.id}` || receipt.sourceId !== upload.id || receipt.provider !== 'user-upload' || receipt.kind !== 'audio' || receipt.license !== 'User supplied' || receipt.rights?.userProvided !== true || receipt.fullDecode !== true || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '') || receipt.licenseEvidence?.method !== 'uploaded-original-sha256' || receipt.licenseEvidence.sha256 !== receipt.sha256 || !receipt.name || receipt.title !== receipt.name || upload.sha256 && upload.sha256 !== receipt.sha256 || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > MUSIC_UPLOAD_MAX_BYTES || !Number.isFinite(receipt.duration) || receipt.duration <= 0 || receipt.duration > 1800) return '上传音乐凭据无效或散列不一致';
  return '';
}
