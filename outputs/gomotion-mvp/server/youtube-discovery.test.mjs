import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticYouTubeDiscovery } from './youtube.mjs';

test('automatic references have a small daily budget, query cache and no automatic retry on quota failure', async () => {
  let calls = 0, stamp = Date.parse('2026-11-11T12:00:00Z');
  const discover = createAutomaticYouTubeDiscovery({ now: () => stamp, search: async () => { calls++; return { references: [{ videoId: 'abcdefghijk', needsOriginal: true }] }; } });
  const config = { youtubeKey: 'fixture', youtubeDiscoveryLimit: 1 };
  const first = await discover('penguin egg', config), repeated = await discover('penguin egg', config);
  assert.equal(first.references.length, 1); assert.deepEqual(first, repeated); assert.equal(calls, 1);
  assert.equal((await discover('other query', config)).skipped, 'automatic-budget');
  stamp += 86400000; await discover('other query', config); assert.equal(calls, 2);
  let failures = 0;
  const limited = createAutomaticYouTubeDiscovery({ search: async () => { failures++; throw Object.assign(new Error('quota exhausted'), { code: 'youtube-quota' }); } });
  await limited('penguin egg', { youtubeKey: 'fixture' });
  assert.equal((await limited('another phrase', { youtubeKey: 'fixture' })).skipped, 'automatic-budget'); assert.equal(failures, 1);
});

test('automatic reference subscribers cancel independently', async () => {
  let finish, calls = 0;
  const discovery = createAutomaticYouTubeDiscovery({ search: async (_query, _config, { signal }) => { calls++; return new Promise((resolve, reject) => { finish = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }); } });
  const controller = new AbortController(), config = { youtubeKey: 'fixture' };
  const a = discovery('same phrase', config, { signal: controller.signal });
  const b = discovery('same phrase', config);
  await Promise.resolve(); controller.abort(new Error('cancel subscription'));
  await assert.rejects(a, /cancel subscription/); finish({ references: [] });
  assert.deepEqual((await b).references, []); assert.equal(calls, 1);
});
