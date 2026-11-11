export function previewCancellation(response, timeoutMs = 125000) {
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableFinished) controller.abort(new Error('试听已停止')); };
  response.once('close', disconnected);
  if (response.destroyed) disconnected();
  const timer = setTimeout(() => controller.abort(new Error('试听准备超时')), timeoutMs);
  return { signal: controller.signal, dispose() { clearTimeout(timer); response.removeListener('close', disconnected); } };
}
