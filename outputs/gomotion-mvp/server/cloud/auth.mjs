import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const signature = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createCloudAuth(secret, now = Date.now) {
  if (!secret || secret.length < 32) throw Error('Cloud session secret is missing');
  const sign = (value) => { const data = Buffer.from(JSON.stringify(value)).toString('base64url'); return `${data}.${signature(secret, data)}`; };
  const read = (token) => {
    try {
      const [data, mac, extra] = token.split('.');
      if (extra || !equal(mac, signature(secret, data))) return null;
      const value = JSON.parse(Buffer.from(data, 'base64url'));
      return value.exp > now() ? value : null;
    } catch { return null; }
  };
  return {
    session(request) {
      const token = request.headers.get('cookie')?.split(';').map((v) => v.trim()).find((v) => v.startsWith('gomotion-session='))?.slice(17);
      const old = read(token || '');
      if (old?.type === 'session' && /^[a-f0-9-]{36}$/.test(old.owner)) return { owner: old.owner };
      const owner = randomUUID();
      return { owner, cookie: `gomotion-session=${sign({ type: 'session', owner, exp: now() + 365 * 86400_000 })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` };
    },
    worker(task) { return sign({ type: 'worker', id: task.id, attempt: task.attempt, exp: now() + 46 * 60_000 }); },
    verifyWorker(request, task) { const value = read(request.headers.get('authorization')?.replace(/^Bearer /, '') || ''); return value?.type === 'worker' && value.id === task.id && value.attempt === task.attempt; },
  };
}
