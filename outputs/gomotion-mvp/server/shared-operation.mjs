// One recording can serve an audition and an active production. Each caller
// owns its subscription; the upstream work stops only when all callers leave.
export function sharedOperations() {
  const pending = new Map();
  return function request(key, signal, action) {
    signal?.throwIfAborted();
    let entry = pending.get(key);
    if (!entry || entry.controller.signal.aborted) {
      entry = { controller: new AbortController(), clients: new Set(), settled: false };
      const current = entry;
      current.promise = Promise.resolve().then(() => {
        current.controller.signal.throwIfAborted();
        return action(current.controller.signal);
      }).finally(() => {
        current.settled = true;
        if (pending.get(key) === current) pending.delete(key);
      });
      current.promise.catch(() => {});
      pending.set(key, current);
    }
    const current = entry;
    return new Promise((resolve, reject) => {
      const client = {}; let finished = false;
      const finish = (success, value) => {
        if (finished) return;
        finished = true; signal?.removeEventListener('abort', abort); current.clients.delete(client);
        if (!current.clients.size && !current.settled) current.controller.abort(success ? new Error('配音已取消') : value || new Error('配音已取消'));
        success ? resolve(value) : reject(value);
      };
      const abort = () => finish(false, signal.reason || new Error('配音已取消'));
      current.clients.add(client);
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then((value) => finish(true, value), (error) => finish(false, error));
      if (signal?.aborted) abort();
    });
  };
}
