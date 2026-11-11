import * as blob from '@vercel/blob';
import { createHash } from 'node:crypto';

const conflict = (error) => error instanceof blob.BlobPreconditionFailedError || /Precondition\s*failed|conditional request|conflicting operation|already exists|already_exists/i.test(`${error.name} ${error.message}`);
const missing = (error) => error instanceof blob.BlobNotFoundError || error.name === 'BlobNotFoundError' || /requested blob does not exist|blob.*not found/i.test(error.message || '');
export function createBlobStore({ sdk = blob, prefix = 'gomotion/v1', env = process.env } = {}) {
  const auth = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  const pathname = (name) => {
    if (!/^[a-zA-Z0-9/_ .-]+$/.test(name) || name.split('/').some((p) => p === '..' || !p)) throw Error('Invalid storage path');
    return `${prefix}/${name}`;
  };
  return {
    async read(name) {
      let result, metadata;
      try {
        // Obtain the storage version before reading the body. A CDN may expose
        // a representation ETag; only the control-plane version is usable for
        // conditional writes. A concurrent newer body causes a safe CAS retry.
        metadata = await sdk.head(pathname(name), auth);
        result = await sdk.get(pathname(name), { ...auth, access: 'private', useCache: false, headers: { 'accept-encoding': 'identity' } });
      }
      catch (error) { if (missing(error)) return null; throw error; }
      if (!result) return null;
      return { value: await new Response(result.stream).json(), etag: metadata.etag };
    },
    async change(name, update) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const old = await this.read(name);
        const next = await update(old ? structuredClone(old.value) : null);
        if (next === undefined) return old?.value;
        try {
          await sdk.put(pathname(name), JSON.stringify(next), { ...auth, access: 'private', addRandomSuffix: false, contentType: 'application/json', allowOverwrite: Boolean(old), ...(old ? { ifMatch: old.etag } : {}) });
          return next;
        } catch (error) { if (!conflict(error)) throw error; await new Promise((resolve) => setTimeout(resolve, Math.min(25 * 2 ** attempt, 400))); }
      }
      throw Object.assign(Error('任务状态更新繁忙，请重试'), { status: 409 });
    },
    async upload(name, file) {
      const path = pathname(name);
      try {
        const old = await sdk.head(path, auth);
        if (old.size !== file.size || old.contentType !== file.contentType) throw Object.assign(Error('同名文件完整性检查未通过'), { status: 409 });
        return { exists: true, blobRef: name };
      } catch (e) { if (!missing(e)) throw e; }
      const signed = await sdk.issueSignedToken({ ...auth, pathname: path, operations: ['put'], maximumSizeInBytes: file.size, allowedContentTypes: [file.contentType], validUntil: Date.now() + 15 * 60_000 });
      const { presignedUrl } = await sdk.presignUrl(signed, { access: 'private', operation: 'put', pathname: path, addRandomSuffix: false, allowOverwrite: false, maximumSizeInBytes: file.size, allowedContentTypes: [file.contentType] });
      return { url: presignedUrl, blobRef: name };
    },
    async verify(name, expected) {
      const result = await sdk.head(pathname(name), auth);
      if (result.size !== expected.size || result.contentType !== expected.contentType) throw Object.assign(Error('文件上传未完成'), { status: 409 });
      // Hash the private object, not merely a caller supplied filename. This also
      // protects source-image receipts and resumed checkpoints against mutation.
      const body = await sdk.get(pathname(name), { ...auth, access: 'private', useCache: false });
      const hash = createHash('sha256');
      for await (const chunk of body.stream) hash.update(chunk);
      if (hash.digest('hex') !== expected.sha256) throw Object.assign(Error('文件完整性检查未通过'), { status: 409 });
    },
    async download(name) {
      const path = pathname(name);
      const signed = await sdk.issueSignedToken({ ...auth, pathname: path, operations: ['get'], validUntil: Date.now() + 15 * 60_000 });
      return (await sdk.presignUrl(signed, { access: 'private', operation: 'get', pathname: path })).presignedUrl;
    },
    async serve(name, request) {
      const metadata = await sdk.head(pathname(name), auth);
      const headers = { 'content-type': metadata.contentType, 'content-length': String(metadata.size), 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' };
      if (request.method === 'HEAD') return new Response(null, { headers });
      const range = request.headers.get('range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || !match[1] && !match[2] || match[1] && Number(match[1]) >= metadata.size || match[1] && match[2] && Number(match[2]) < Number(match[1])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${metadata.size}` } });
      }
      const result = await sdk.get(pathname(name), { ...auth, access: 'private', headers: { ...(range ? { range } : {}), 'accept-encoding': 'identity' }, abortSignal: request.signal });
      if (!result) return Response.json({ error: '文件不存在' }, { status: 404 });
      for (const key of ['content-range', 'content-length', 'content-type']) if (result.headers.has(key)) headers[key] = result.headers.get(key);
      // Same-origin streaming keeps private Blob credentials and URLs server
      // side, supports browser byte ranges and avoids buffering a whole movie.
      return new Response(result.stream, { status: headers['content-range'] ? 206 : 200, headers });
    },
  };
}
