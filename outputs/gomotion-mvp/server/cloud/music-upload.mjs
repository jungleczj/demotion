import { createHash, randomUUID } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { decodeMusicUpload, musicUploadReceipt, uploadReceiptError, musicUploadId } from '../music-upload-input.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const indexKey = (owner, id) => `music-upload-index/${owner}/${id}.json`;
const ownerValid = (owner) => musicUploadId(owner);

// Functions have no FFmpeg binary. Validate in a short isolated copy of the
// existing FFmpeg snapshot, without loading provider credentials or models.
export function createSandboxMusicValidator({ env = process.env, sdk = Sandbox } = {}) {
  return async (bytes, signal) => {
    if (!env.GOMOTION_SANDBOX_SNAPSHOT) throw fail('音频上传服务尚未就绪，请稍后重试', 503);
    const sandbox = await sdk.create({ source: { type: 'snapshot', snapshotId: env.GOMOTION_SANDBOX_SNAPSHOT }, persistent: false, timeout: 90_000, resources: { vcpus: 2 } });
    try {
      signal?.throwIfAborted();
      await sandbox.writeFiles([{ path: '/vercel/sandbox/upload.audio', content: bytes }]);
      // Keep this self contained: a snapshot prepared before this feature still
      // has Node and FFmpeg and needs no new application module for validation.
      const code = `import {execFileSync} from 'node:child_process'; import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto';
const file='/vercel/sandbox/upload.audio', args=['-format_whitelist','mp3,wav,mov,ogg,flac,aac','-protocol_whitelist','file'];
const data=JSON.parse(execFileSync('ffprobe',['-v','error',...args,'-show_entries','format=duration:stream=codec_type:stream_disposition=attached_pic','-of','json',file],{timeout:20000,encoding:'utf8'}));
const duration=Number(data.format?.duration); if(!data.streams?.some(s=>s.codec_type==='audio')||data.streams.some(s=>s.codec_type==='video'&&s.disposition?.attached_pic!==1)||!Number.isFinite(duration)||duration<=0||duration>1800) throw Error('Invalid independent audio');
execFileSync('ffmpeg',['-nostdin','-v','error','-xerror','-err_detect','explode',...args,'-i',file,'-map','0:a:0','-f','null','-'],{timeout:45000,stdio:['ignore','pipe','pipe']});
const bytes=readFileSync(file); console.log(JSON.stringify({duration,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fullDecode:true}));`;
      const command = await sandbox.runCommand({ cmd: 'node', args: ['--input-type=module', '-e', code] });
      signal?.throwIfAborted();
      if (command.exitCode !== 0) throw fail('上传文件不是可完整解码的独立音频，请选择其他音频');
      let metadata;
      try { metadata = JSON.parse(await command.stdout()); }
      catch { throw fail('音频校验未返回有效凭据，请重试', 502); }
      if (metadata.sha256 !== digest(bytes) || metadata.bytes !== bytes.length) throw fail('上传原件完整性校验失败');
      return metadata;
    } finally { await sandbox.stop().catch(() => {}); }
  };
}

export function createCloudMusicUploads({ store, validate = createSandboxMusicValidator(), fetchImpl = globalThis.fetch } = {}) {
  const persist = async (name, bytes, type, signal) => {
    const file = { size: bytes.length, contentType: type, sha256: digest(bytes) };
    const grant = await store.upload(name, file);
    if (!grant.exists) {
      if (!grant.url) throw fail('上传存储暂不可用，请重试', 503);
      const response = await fetchImpl(grant.url, { method: 'PUT', headers: { 'content-type': type, 'content-length': String(bytes.length), 'x-content-type': type }, body: bytes, signal });
      if (!response.ok) { await response.body?.cancel(); throw fail('上传保存失败，请重试', 502); }
      await response.body?.cancel();
    }
    const blobRef = grant.blobRef || name;
    await store.verify(blobRef, file);
    return { blobRef, ...file };
  };
  return {
    async save(owner, input, signal) {
      if (!ownerValid(owner)) throw fail('上传会话无效', 403);
      const decoded = decodeMusicUpload(input), id = randomUUID();
      const metadata = await validate(decoded.bytes, signal);
      if (metadata.sha256 !== decoded.sha256 || metadata.bytes !== decoded.bytes.length) throw fail('上传音频散列不一致');
      const receipt = musicUploadReceipt(id, decoded.name, metadata);
      const audio = await persist(`music-uploads/${owner}/${id}.audio`, decoded.bytes, 'application/octet-stream', signal);
      const proof = await persist(`music-uploads/${owner}/${id}.audio.json`, Buffer.from(JSON.stringify(receipt)), 'application/json', signal);
      await store.change(indexKey(owner, id), () => ({ owner, id, receipt, audio, proof }));
      return { id, name: receipt.name, sha256: receipt.sha256 };
    },
  };
}

// Only this server-created ledger resolves an upload. Browser IDs and optional
// hashes cannot introduce local paths, external URLs or another owner's Blob.
export async function musicUploadCheckpoint(store, owner, upload) {
  if (!ownerValid(owner) || !musicUploadId(upload?.id)) throw fail('上传音乐标识无效');
  const saved = (await store.read(indexKey(owner, upload.id)))?.value;
  if (!saved || saved.owner !== owner || saved.id !== upload.id) throw fail('上传音乐不存在，请重新上传', 404);
  const error = uploadReceiptError(saved.receipt, upload);
  if (error) throw fail(error);
  if (saved.audio?.blobRef !== `music-uploads/${owner}/${upload.id}.audio` || saved.proof?.blobRef !== `music-uploads/${owner}/${upload.id}.audio.json` || saved.audio.sha256 !== saved.receipt.sha256 || saved.audio.size !== saved.receipt.bytes || saved.audio.contentType !== 'application/octet-stream' || saved.proof.contentType !== 'application/json' || saved.proof.sha256 !== digest(Buffer.from(JSON.stringify(saved.receipt)))) throw fail('上传音乐存储凭据无效');
  const files = [];
  for (const [suffix, stored] of [['.audio', saved.audio], ['.audio.json', saved.proof]]) {
    await store.verify(stored.blobRef, stored);
    files.push({ relativePath: `music-uploads/${upload.id}${suffix}`, sha256: stored.sha256, size: stored.size, contentType: stored.contentType, blobRef: stored.blobRef, url: await store.download(stored.blobRef) });
  }
  return { files };
}
