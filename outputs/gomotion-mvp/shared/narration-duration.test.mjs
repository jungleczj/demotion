import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateNarrationSeconds as estimate } from './narration-duration.mjs';

test('live duration supports empty, Chinese, English and mixed input', () => {
  assert.equal(estimate(''), 0); assert.equal(estimate('  \n '), 0);
  assert.equal(estimate('海洋生物'), 1);
  assert.equal(estimate('one two three four five six seven eight nine ten'), 4);
  assert.equal(estimate('海洋生物 one two three four five six seven eight nine ten'), 5);
  assert.ok(estimate('、、、') < estimate('one two three four five six seven eight nine ten'));
  assert.ok(estimate('这是一个较长的中文说明。'.repeat(20)) > estimate('这是一个较长的中文说明。'));
});

test('delivery pace changes duration while shared text is deterministic', () => {
  const text = '海洋的故事远不止我们眼前的这一片蓝色。'.repeat(4);
  assert.ok(estimate(text, 'gentle') > estimate(text, 'documentary'));
  assert.ok(estimate(text, 'story') >= estimate(text, 'documentary'));
  assert.ok(estimate(text, 'conversation') <= estimate(text, 'documentary'));
  assert.equal(estimate(text), estimate(text));
});
