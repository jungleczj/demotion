import { createBlobStore } from './blob-store.mjs';
import { createCloudAuth } from './auth.mjs';
import { createSandboxExecutor } from './executor.mjs';
import { createCloudProductions } from './productions.mjs';
import { createCloudMusicUploads, createSandboxMusicValidator } from './music-upload.mjs';
import { MUSIC_UPLOAD_BODY_BYTES } from '../music-upload-input.mjs';

export const cloudConfigured = (env) => Boolean(env.GOMOTION_CLOUD_ENABLED === '1' && (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN) && env.GOMOTION_SANDBOX_SNAPSHOT && env.GOMOTION_CLOUD_SECRET?.length >= 32 && (env.GEMINI_API_KEY || env.VISION_API_KEY));
export function createCloudAPI({ env = process.env, store, executor, now, musicValidator, fetchImpl = globalThis.fetch } = {}) {
  if (!cloudConfigured(env) && (!store || !executor)) return null;
  const auth = createCloudAuth(env.GOMOTION_CLOUD_SECRET, now);
  store ||= createBlobStore({ env, prefix: `gomotion/${env.VERCEL_ENV === 'preview' ? 'preview' : 'production'}/v1` });
  executor ||= createSandboxExecutor({ env });
  const musicUploads = createCloudMusicUploads({ store, validate: musicValidator || createSandboxMusicValidator({ env }), fetchImpl });
  return {
    responseHeaders(request) { const { cookie } = auth.session(request); return cookie ? { 'set-cookie': cookie } : {}; },
    async handle(request, route, body) {
      const url = new URL(request.url), method = request.method;
      const origin = env.GOMOTION_CALLBACK_ORIGIN || url.origin;
      const manager = createCloudProductions({ store, executor, auth, callbackOrigin: origin, now, dailyLimit: Number(env.GOMOTION_DAILY_PRODUCTIONS) || 20 });
      const reply = (value, status = 200, headers = {}) => {
        let encoded = JSON.stringify(value);
        for (const [key, secret] of Object.entries(env)) if (/KEY$|SECRET$|TOKEN$/.test(key) && secret) encoded = encoded.replaceAll(secret, '[redacted]');
        return new Response(encoded, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
      };
      const callback = /^\/api\/cloud-callback\/([a-f0-9-]{36})$/.exec(route);
      if (callback && method === 'POST') return reply(await manager.callback(request, callback[1], await body(MAX_CHECKPOINT_BYTES)));
      const { owner, cookie } = auth.session(request);
      const json = (value, status) => reply(value, status, cookie ? { 'set-cookie': cookie } : {});
      const redirect = (target) => target instanceof Response ? target : new Response(null, { status: 307, headers: { location: target, 'cache-control': 'private, no-store', ...(cookie ? { 'set-cookie': cookie } : {}) } });
      if (route === '/api/music/upload' && method === 'POST') return json(await musicUploads.save(owner, await body(MUSIC_UPLOAD_BODY_BYTES), request.signal));
      if (route === '/api/productions') {
        if (method === 'GET') return json(await manager.list(owner, Math.max(0, Number(url.searchParams.get('after')) || 0)));
        if (method === 'POST') return json(await manager.submit(owner, await body(500_000)), 202);
      }
      if (route === '/api/productions/recover' && method === 'POST') return json(await manager.recover(owner, await body(500_000)));
      const task = /^\/api\/productions\/([a-f0-9-]{36})$/.exec(route);
      if (task && method === 'GET') return json(await manager.get(owner, task[1]));
      if (task && method === 'DELETE') return json(await manager.cancel(owner, task[1]));
      const file = /^\/api\/cloud-files\/([a-f0-9-]{36})$/.exec(route);
      if (file && ['GET', 'HEAD'].includes(method)) return redirect(await manager.file(owner, file[1], url.searchParams.get('path'), request));
      if (route === '/api/media' && ['GET', 'HEAD'].includes(method)) return redirect(await manager.media(owner, url.searchParams.get('id'), url.searchParams.has('thumbnail'), request));
      const playback = /^\/api\/playback\/([a-f0-9]{64})\.mp4$/.exec(route);
      if (playback && ['GET', 'HEAD'].includes(method)) return redirect(await manager.playback(owner, playback[1], request));
      if (route === '/api/playback' && method === 'POST') {
        const input = await body();
        await manager.media(owner, input.id, false);
        return json({ url: `/api/media?id=${encodeURIComponent(input.id)}` });
      }
      const audio = /^\/api\/narration\/([a-f0-9]{64})(?:\.wav)?$/.exec(route);
      if (audio && ['GET', 'HEAD'].includes(method)) return redirect(await manager.narration(owner, audio[1], request));
      const exported = /^\/api\/exports\/([a-f0-9-]{36})(?:\/(video\.mp4|captions\.srt|sources\.json))?$/.exec(route);
      if (exported && ['GET', 'HEAD'].includes(method)) {
        const result = await manager.exported(owner, exported[1], exported[2], request);
        return exported[2] ? redirect(result) : json(result);
      }
      if (route === '/api/export' && method === 'POST') {
        const project = await body(500_000);
        if (project.exportId) {
          const saved = await manager.exported(owner, project.exportId);
          if (saved.status === 'done') return json({ id: saved.id }, 202);
        }
        const task = await manager.submit(owner, { project });
        return task.project.exportId ? json({ id: task.project.exportId }, 202) : json({ error: '已开始重新制作，请在当前视频页面查看进度。', code: 'PRODUCTION_STARTED' }, 409);
      }
      return null;
    },
  };
}
import { MAX_CHECKPOINT_BYTES } from './checkpoint-limits.mjs';
