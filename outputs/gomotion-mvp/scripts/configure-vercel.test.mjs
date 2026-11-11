import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentConfig } from './configure-vercel.mjs';

test('Vercel routes every API and media URL to the same real backend before the SPA fallback', () => {
  const config = deploymentConfig('https://api.example.com/');
  assert.deepEqual(config.rewrites, [{ source: '/api/:path*', destination: 'https://api.example.com/api/:path*' }, { source: '/(.*)', destination: '/index.html' }]);
  for (const route of ['config', 'voices', 'productions/project-id', 'narration/hash.wav', 'playback/hash.mp4', 'exports/export-id/video.mp4']) {
    assert.equal(config.rewrites[0].destination.replace(':path*', route), `https://api.example.com/api/${route}`);
  }
});

for (const backend of [undefined, 'http://api.example.com', 'https://user:password@api.example.com', 'https://api.example.com/path', 'https://api.example.com/?key=secret', 'https://localhost', 'https://127.0.0.1', 'https://gomotion-mvp.vercel.app']) test(`reject unusable backend ${backend?.replace(/password|secret/g, 'hidden')}`, () => {
  assert.throws(() => deploymentConfig(backend));
});
