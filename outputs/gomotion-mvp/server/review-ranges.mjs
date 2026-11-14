export function reviewRanges(duration, seconds = 30, overlap = .2) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds) || seconds <= 0 || overlap < 0) throw new Error('审片时间范围无效');
  const ranges = [];
  for (let core = 0; core < duration; core += seconds) ranges.push({ offset: Math.max(0, core - overlap), end: Math.min(duration, core + seconds + overlap) });
  return ranges;
}

export async function reviewWithRetry(action, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    try { return await action(attempt); }
    catch (error) {
      if (signal.aborted || error.requestRetriesHandled || attempt || !/超时|连接失败|有效 JSON|HTTP 50[0234]/i.test(error.message || '')) throw error;
    }
  }
}
