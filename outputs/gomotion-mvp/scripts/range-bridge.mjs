import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { configureNetwork } from '../server/network.mjs';

export class RangeUnsupportedError extends Error {
  constructor(message, stats) { super(message); this.name = 'RangeUnsupportedError'; this.stats = stats; }
}

function contentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value || '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  return [start, end, total].every(Number.isSafeInteger) && start >= 0 && end >= start && total > end ? { start, end, total } : null;
}

function requestRange(value, total) {
  if (!value) return { start: 0, end: total - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) return null;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, total - suffix); end = total - 1; if (suffix <= 0) return null; }
  else { start = Number(match[1]); end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1; }
  return [start, end].every(Number.isSafeInteger) && start >= 0 && start < total && end >= start ? { start, end, partial: true } : null;
}

// One fixed HTTPS resource, never a caller-controlled forwarding URL. Node fetch
// uses the application's configured CONNECT proxy; FFmpeg only sees loopback.
export async function createRangeBridge({ sourceUrl, signal, timeoutMs = 120000, byteLimit = 48 * 1024 * 1024,
  blockSize = 1024 * 1024, cacheLimit = 32 * 1024 * 1024, fetchImpl = globalThis.fetch } = {}) {
  const source = new URL(sourceUrl);
  if (source.protocol !== 'https:' || source.username || source.password || source.hash) throw new Error('Range bridge requires one fixed HTTPS media URL without credentials or fragment');
  if (![byteLimit, blockSize, cacheLimit, timeoutMs].every((n) => Number.isSafeInteger(n) && n > 0) || blockSize > byteLimit || byteLimit > 48 * 1024 * 1024) throw new Error('Invalid bridge resource limits');
  if (fetchImpl === globalThis.fetch) configureNetwork();
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const stats = { upstreamBodyBytes: 0, downstreamBodyBytes: 0, upstreamRequests: [], downstreamRequests: [], cacheHits: 0,
    cachedBytes: 0, rangeSupported: false, fallbackRequired: false, byteLimit, blockSize, cacheLimit, errors: [] };
  const cache = new Map(), pending = new Map();
  let server, origin, closed = false, reservedBytes = 0;
  const failRange = (message) => { stats.fallbackRequired = true; return new RangeUnsupportedError(message, stats); };
  async function upstream(start, end, expectedTotal) {
    combined.throwIfAborted();
    const expectedBytes = end - start + 1;
    if (stats.upstreamBodyBytes + reservedBytes + expectedBytes > byteLimit) throw new Error('Range bridge cumulative body budget would be exceeded');
    reservedBytes += expectedBytes;
    let reservation = expectedBytes;
    const detail = { range: `bytes=${start}-${end}`, status: null, receivedBytes: 0, durationMs: 0 };
    stats.upstreamRequests.push(detail);
    const started = performance.now();
    let response;
    try {
      response = await fetchImpl(source.href, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: combined,
        headers: { Range: detail.range, 'Accept-Encoding': 'identity', 'User-Agent': 'GoMotionLocalMVP/0.1 range-experiment' } });
      detail.status = response.status;
      // A 200 response is never re-labelled as partial content. The caller must
      // close this bridge and use its bounded complete-download path instead.
      if (response.status === 200) throw failRange('Source ignored Range (HTTP 200); complete-download fallback required');
      if (response.status !== 206 || !response.body) throw failRange(`Source did not supply partial media (HTTP ${response.status})`);
      const range = contentRange(response.headers.get('content-range'));
      if (!range || range.start !== start || range.end !== end || expectedTotal && range.total !== expectedTotal) throw failRange('Invalid or changed Content-Range; complete-download fallback required');
      const encoding = response.headers.get('content-encoding');
      if (encoding && encoding !== 'identity') throw failRange('Encoded range body cannot preserve byte offsets');
      const length = response.headers.get('content-length');
      if (length !== null && Number(length) !== end - start + 1) throw failRange('Range Content-Length does not match requested byte interval');
      const validator = response.headers.get('etag') || response.headers.get('last-modified');
      if (origin?.validator && validator !== origin.validator) throw failRange('Source validator changed during range reads');
      const chunks = [];
      for await (const chunk of response.body) {
        detail.receivedBytes += chunk.byteLength; stats.upstreamBodyBytes += chunk.byteLength;
        const released = Math.min(reservation, chunk.byteLength); reservation -= released; reservedBytes -= released;
        if (stats.upstreamBodyBytes > byteLimit) { controller.abort(new Error('Range bridge exceeded cumulative body budget')); throw controller.signal.reason; }
        if (detail.receivedBytes > end - start + 1) throw failRange('Upstream range body exceeded its declared interval');
        chunks.push(Buffer.from(chunk));
      }
      if (detail.receivedBytes !== end - start + 1) throw failRange('Truncated upstream range body');
      return { body: Buffer.concat(chunks), total: range.total, validator, type: response.headers.get('content-type') || 'application/octet-stream' };
    } finally {
      detail.durationMs = Math.round((performance.now() - started) * 1000) / 1000;
      reservedBytes -= reservation;
      if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => {});
    }
  }

  // Probe with a genuine one-byte GET. Accept-Ranges alone is insufficient.
  const probe = await upstream(0, 0);
  origin = { total: probe.total, type: probe.type, validator: probe.validator };
  stats.rangeSupported = true; stats.sourceBytes = origin.total;
  async function block(index) {
    if (cache.has(index)) { const data = cache.get(index); cache.delete(index); cache.set(index, data); stats.cacheHits++; return data; }
    if (!pending.has(index)) pending.set(index, (async () => {
      const start = index * blockSize, end = Math.min(origin.total - 1, start + blockSize - 1);
      const result = await upstream(start, end, origin.total);
      while (stats.cachedBytes + result.body.length > cacheLimit && cache.size) {
        const key = cache.keys().next().value; stats.cachedBytes -= cache.get(key).length; cache.delete(key);
      }
      if (result.body.length <= cacheLimit) { cache.set(index, result.body); stats.cachedBytes += result.body.length; }
      return result.body;
    })().finally(() => pending.delete(index)));
    return pending.get(index);
  }

  const tokenPath = `/${randomBytes(24).toString('hex')}`;
  server = http.createServer(async (req, res) => {
    const localHost = `127.0.0.1:${server.address()?.port}`;
    if (req.url !== tokenPath || req.headers.host !== localHost) { res.writeHead(404, { 'Content-Length': '0' }); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': '0' }); res.end(); return; }
    const range = requestRange(req.headers.range, origin.total);
    if (!range) { res.writeHead(416, { 'Content-Range': `bytes */${origin.total}`, 'Content-Length': '0' }); res.end(); return; }
    const detail = { method: req.method, range: req.headers.range || null, start: range.start, end: range.end, sentBytes: 0 };
    stats.downstreamRequests.push(detail);
    try {
      combined.throwIfAborted();
      // Fetch and validate the first block before committing a successful header.
      let data = req.method === 'GET' ? await block(Math.floor(range.start / blockSize)) : null;
      const headers = { 'Content-Type': origin.type, 'Content-Length': String(range.end - range.start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${origin.total}`;
      res.writeHead(range.partial ? 206 : 200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      for (let cursor = range.start; cursor <= range.end && !res.destroyed;) {
        combined.throwIfAborted();
        const index = Math.floor(cursor / blockSize);
        data ||= await block(index);
        if (res.destroyed) break;
        const offset = cursor - index * blockSize;
        const end = Math.min(data.length, range.end - index * blockSize + 1);
        const piece = data.subarray(offset, end);
        if (!piece.length) throw new Error('Empty media block');
        const writable = res.write(piece); detail.sentBytes += piece.length; stats.downstreamBodyBytes += piece.length;
        cursor += piece.length; data = null;
        if (!writable && !res.destroyed) await new Promise((resolve) => {
          const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
          res.once('drain', done); res.once('close', done);
        });
      }
      if (!res.destroyed) res.end();
    } catch (error) {
      stats.errors.push(error.message);
      if (!res.headersSent) { res.writeHead(502, { 'Content-Length': '0' }); res.end(); }
      else res.destroy(error);
    }
  });
  const onAbort = () => { server.closeAllConnections(); server.close(); };
  combined.addEventListener('abort', onAbort, { once: true });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}${tokenPath}`, address, stats,
    async close() {
      if (closed) return; closed = true;
      combined.removeEventListener('abort', onAbort);
      controller.abort(new Error('Range bridge closed'));
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await Promise.allSettled([...pending.values()]); cache.clear(); stats.cachedBytes = 0;
    } };
}
