import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRanges, reviewWithRetry } from './review-ranges.mjs';

test('actual audio/video review covers all time with overlapping boundaries', () => {
  for (const duration of [0.2, 30, 30.1, 79.4, 900]) {
    const ranges = reviewRanges(duration);
    assert.equal(ranges[0].offset, 0); assert.equal(ranges.at(-1).end, duration);
    ranges.forEach((range, i) => {
      assert.ok(range.end > range.offset); assert.ok(range.end - range.offset <= 30.40001);
      if (i) assert.ok(range.offset < ranges[i - 1].end);
    });
  }
  assert.throws(() => reviewRanges(0));
});

test('retries a transient review once but never retries quota or cancellation', async () => {
  let calls = 0;
  assert.equal(await reviewWithRetry(async () => { if (++calls === 1) throw new Error('视觉 AI 网络连接超时'); return 'read'; }, new AbortController().signal), 'read');
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(reviewWithRetry(async () => { calls++; throw new Error('视觉 AI 请求失败（HTTP 429）'); }, new AbortController().signal), /429/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(reviewWithRetry(async () => { calls++; throw new Error('网络连接超时'); }, new AbortController().signal), /超时/);
  assert.equal(calls, 2);
  const controller = new AbortController(); controller.abort(new Error('已取消'));
  await assert.rejects(reviewWithRetry(async () => { calls++; }, controller.signal), /取消/); assert.equal(calls, 2);
});
