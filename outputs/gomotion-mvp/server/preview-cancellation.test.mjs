import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { previewCancellation } from './preview-cancellation.mjs';

test('stopping a preview aborts its backend request, completing one does not', () => {
  const cancelled = new EventEmitter(), first = previewCancellation(cancelled);
  cancelled.emit('close'); assert.equal(first.signal.aborted, true); assert.match(first.signal.reason.message, /已停止/); first.dispose();
  const completed = new EventEmitter(); completed.writableFinished = true;
  const second = previewCancellation(completed); completed.emit('close'); assert.equal(second.signal.aborted, false); second.dispose();
});

test('disposing a finished operation removes its cancellation listener', async () => {
  const response = new EventEmitter(), operation = previewCancellation(response, 5);
  operation.dispose(); response.emit('close');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(operation.signal.aborted, false); assert.equal(response.listenerCount('close'), 0);
});

test('a client that disconnected before preview setup never starts an active preview', () => {
  const response = new EventEmitter(); response.destroyed = true;
  const operation = previewCancellation(response);
  try { assert.equal(operation.signal.aborted, true); }
  finally { operation.dispose(); }
});

test('preview timeout aborts with a retryable preparation message', async () => {
  const response = new EventEmitter(), operation = previewCancellation(response, 5);
  try {
    await new Promise((resolve) => operation.signal.addEventListener('abort', resolve, { once: true }));
    assert.match(operation.signal.reason.message, /超时/);
  } finally { operation.dispose(); }
});
