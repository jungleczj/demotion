// Share one source preparation across concurrent scenes. A longer request waits
// for the existing work before deciding whether the interval needs extending.
export function candidateMedia(media, load) {
  const pending = new Map();
  const covers = (item, required) => item && (item.duration + .05 >= required || item.sourceDuration <= item.duration + .05);
  return async function get(id, required) {
    while (true) {
      if (covers(media.get(id), required)) return media.get(id);
      if (pending.has(id)) { await pending.get(id); continue; }
      const operation = Promise.resolve().then(() => load(id, required)).then((item) => { media.set(id, item); return item; });
      pending.set(id, operation);
      try { return await operation; } finally { if (pending.get(id) === operation) pending.delete(id); }
    }
  };
}

export async function prepareCandidateBatch(ids, { get, signal, onError }) {
  signal.throwIfAborted();
  const outcomes = await Promise.allSettled(ids.map((id) => get(id)));
  signal.throwIfAborted();
  return outcomes.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [result.value];
    onError(ids[index], result.reason); return [];
  });
}
