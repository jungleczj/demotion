import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRangeBridge, RangeUnsupportedError } from './range-bridge.mjs';

const body = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
function source(overrides = {}) {
  return async (url, options) => {
    assert.equal(url, 'https://fixed-media.example/approved.mp4');
    assert.equal(options.redirect, 'manual');
    const [start, end] = options.headers.Range.slice(6).split('-').map(Number);
    return new Response(body.subarray(start, end + 1), { status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': String(end - start + 1), 'Content-Type': 'video/mp4', ETag: 'fixed-v1', ...overrides } });
  };
}
function localGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, (response) => {
      const chunks = []; response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    }); request.on('error', reject); request.end();
  });
}

test('loopback bridge serves one fixed source, validates ranges and reuses bounded blocks', async () => {
  const bridge = await createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', blockSize: 8, fetchImpl: source() });
  try {
    assert.equal(bridge.address.address, '127.0.0.1');
    assert.match(new URL(bridge.url).pathname, /^\/[a-f0-9]{48}$/);
    assert.equal((await localGet(bridge.url + '?url=https://other.example')).status, 404);
    assert.equal((await localGet(bridge.url.replace(/\/[a-f0-9]{48}$/, '/wrong'))).status, 404);
    assert.equal((await localGet(bridge.url, { method: 'POST' })).status, 405);
    assert.equal((await localGet(bridge.url, { headers: { Range: 'bytes=1-2,4-5' } })).status, 416);
    const first = await localGet(bridge.url, { headers: { Range: 'bytes=4-17' } });
    assert.equal(first.status, 206); assert.equal(first.headers['content-range'], `bytes 4-17/${body.length}`);
    assert.equal(first.headers['content-length'], '14'); assert.equal(first.headers['content-type'], 'video/mp4');
    assert.deepEqual(first.body, body.subarray(4, 18));
    const received = bridge.stats.upstreamBodyBytes;
    assert.deepEqual((await localGet(bridge.url, { headers: { Range: 'bytes=4-17' } })).body, first.body);
    assert.equal(bridge.stats.upstreamBodyBytes, received);
    assert.deepEqual((await localGet(bridge.url, { headers: { Range: 'bytes=-4' } })).body, body.subarray(-4));
    const head = await localGet(bridge.url, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.headers['content-length'], String(body.length)); assert.equal(head.body.length, 0);
  } finally { await bridge.close(); }
});

test('HTTP 200 is rejected rather than represented as a range', async () => {
  let cancelled = false;
  const fetchImpl = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200, headers: { 'Content-Length': '36' } });
  await assert.rejects(createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', fetchImpl }), (error) => error instanceof RangeUnsupportedError && error.stats.fallbackRequired);
  assert.equal(cancelled, true);
});

test('later 200 responses and changed range headers fail closed', async () => {
  let count = 0;
  const fetchImpl = async (...args) => ++count === 1 ? source()(...args) : new Response(body, { status: 200 });
  const bridge = await createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', blockSize: 8, fetchImpl });
  try {
    assert.equal((await localGet(bridge.url, { headers: { Range: 'bytes=0-7' } })).status, 502);
    assert.equal(bridge.stats.fallbackRequired, true);
    assert.equal(bridge.stats.upstreamBodyBytes, 1);
  } finally { await bridge.close(); }
  await assert.rejects(createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', fetchImpl: source({ 'Content-Range': `bytes 1-1/${body.length}` }) }), RangeUnsupportedError);
});

test('enforces cumulative body budget and rejects non-HTTPS or credential sources', async () => {
  await assert.rejects(createRangeBridge({ sourceUrl: 'http://fixed-media.example/file' }), /HTTPS/);
  await assert.rejects(createRangeBridge({ sourceUrl: 'https://user:password@fixed-media.example/file' }), /HTTPS/);
  const bridge = await createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', blockSize: 8, byteLimit: 9, fetchImpl: source() });
  try {
    assert.equal((await localGet(bridge.url, { headers: { Range: 'bytes=0-7' } })).status, 206);
    assert.equal((await localGet(bridge.url, { headers: { Range: 'bytes=8-15' } })).status, 502);
    assert.equal(bridge.stats.upstreamBodyBytes, 9);
  } finally { await bridge.close(); }
});

test('caller cancellation closes loopback connections and prevents new reads', async () => {
  const controller = new AbortController();
  const bridge = await createRangeBridge({ sourceUrl: 'https://fixed-media.example/approved.mp4', signal: controller.signal, blockSize: 8, fetchImpl: source() });
  controller.abort(new Error('cancelled by test'));
  await assert.rejects(localGet(bridge.url));
  await bridge.close();
});
