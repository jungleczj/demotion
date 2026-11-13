import voices from '../shared/voices.json' with { type: 'json' };
import languages from '../shared/languages.json' with { type: 'json' };
import { requestNarration } from './narration-request.mjs';
import { createCloudAPI } from './cloud/api.mjs';
import scriptLimits from '../shared/script-limits.json' with { type: 'json' };
import { aiConfigFromEnv, narrationConfig, redactAISecrets } from './ai-services.mjs';
import { visionJSON } from './vision-client.mjs';

const styles = {
  documentary: 'Calm, warm documentary narration with measured phrasing and restrained expression.',
  story: 'Tell an engaging story with gentle changes of emphasis and a connected narrative flow.',
  conversation: 'Speak conversationally, like one person naturally talking to another. Avoid formal announcing.',
  explainer: 'Explain clearly and confidently, with distinct phrasing and natural emphasis on the key ideas.',
  gentle: 'Gentle, warm narration at a relaxed pace, without whispering or exaggeration.',
};
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const productionUnavailable = () => json({ error: '视频制作服务尚未就绪，脚本会自动保存，请稍后再试。', code: 'PRODUCTION_UNAVAILABLE' }, 503);

// This adapter intentionally imports no local HTTP server, FFmpeg worker or task
// pump. A function instance and its temporary disk cannot own durable tasks.
export function createVercelHandler({ env = process.env, fetchImpl = fetch, cloudAPI } = {}) {
  const cloud = cloudAPI === undefined ? createCloudAPI({ env }) : cloudAPI;
  const config = aiConfigFromEnv(env);
  const redact = (message) => {
    let value = redactAISecrets(message || '请求未完成，请稍后重试', config);
    for (const secret of [config.visionKey, env.PEXELS_API_KEY, env.PIXABAY_API_KEY, env.COVERR_API_KEY, env.YOUTUBE_API_KEY].filter(Boolean)) value = value.replaceAll(secret, '[redacted]');
    return value.replace(/https?:\/\/\S+/g, '[服务链接]').slice(0, 500);
  };
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const route = url.pathname === '/api/index' ? `/api/${url.searchParams.get('__gomotion_route') || ''}` : url.pathname;
      const method = request.method.toUpperCase();
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      const origin = request.headers.get('origin');
      if (mutation && origin && origin !== url.origin) return json({ error: '请求来源不匹配' }, 403);
      const body = async (limit = 6000) => {
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('请使用 JSON 请求', 415);
        if (Number(request.headers.get('content-length')) > limit) throw fail('请求内容过长', 413);
        const reader = request.body?.getReader();
        let bytes = 0;
        const parts = [];
        if (reader) try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > limit) { await reader.cancel(); throw fail('请求内容过长', 413); }
            parts.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
        catch { throw fail('请求不是有效的 JSON', 400); }
      };
      if (cloud) {
        const response = await cloud.handle(request, route, body);
        if (response) return response;
      }
      if (route === '/api/health' && method === 'GET') return json({ status: 'ok', runtime: 'vercel', productionReady: Boolean(cloud) });
      if (route === '/api/config' && method === 'GET') return json({
        runtime: 'vercel', render: Boolean(cloud), localVoice: false,
        aiConnected: Boolean(config.visionKey), llmBase: '', llmModel: '', textProvider: 'vision',
        pexelsConnected: Boolean(env.PEXELS_API_KEY), pixabayConnected: Boolean(env.PIXABAY_API_KEY), coverrConnected: Boolean(env.COVERR_API_KEY), youtubeConnected: Boolean(env.YOUTUBE_API_KEY), youtubeDiscovery: env.YOUTUBE_DISCOVERY !== 'false',
        sources: ['commons', 'archive', 'nasa', ...(env.PEXELS_API_KEY ? ['pexels'] : []), ...(env.PIXABAY_API_KEY ? ['pixabay'] : []), ...(env.COVERR_API_KEY ? ['coverr'] : [])],
        visionConfigured: Boolean(config.visionKey), visionEnabled: true, visionProvider: config.visionProvider, visionBase: config.visionBase, visionModel: config.visionModel,
      }, 200, cloud?.responseHeaders(request));
      if (route === '/api/config' && method === 'POST') return json({ error: '线上连接配置请保存到 Vercel 项目的环境变量中，并重新部署。此页面不会临时保存密钥。', code: 'ENV_CONFIGURATION_REQUIRED' }, 409);
      if (route === '/api/voices' && method === 'GET') return json({ voices: voices.map((v) => v.key), languages });
      if (route === '/api/narration' && method === 'POST') {
        const input = await body();
        const text = typeof input?.text === 'string' ? input.text.trim() : '';
        const voice = typeof input?.voice === 'string' && input.voice.startsWith('gemini:') ? input.voice.slice(7) : '';
        const language = languages.find((item) => item.code === input?.language);
        const style = input?.voiceStyle || 'documentary';
        if (!text || text.length > 500 || !voices.some((v) => v.key === voice) || !language || !Object.hasOwn(styles, style)) throw fail('试听文本、声音或语言无效，请重新选择', 400);
        if (!narrationConfig(config).visionKey) throw fail('声音服务尚未连接，请联系工作区管理员', 503);
        const prompt = `Speak fluent native ${language.speech}. The supplied narration is already in this language; do not translate or change any words. ${styles[style]} Read the exact narration as a human narrator, with natural phrasing and breaths. Do not add headings, music, sound effects or extra words. Read only the narration verbatim.\n\nNARRATION:\n${text}`;
        const result = await requestNarration(config, env.TTS_MODEL || 'gemini-2.5-flash-preview-tts', { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }, request.signal, { fetchImpl });
        const part = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
        if (!part || !/^audio\/(?:L16|pcm)(?:;|$)/i.test(part.mimeType || '')) throw fail('声音服务未返回可播放音频，请重试', 502);
        const rate = Number(part.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
        const pcm = Buffer.from(part.data, 'base64');
        if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || pcm.length < rate || pcm.length > Math.min(rate * 2 * 60, 3_000_000) || pcm.length % 2) throw fail('试听音频格式或长度无效，请重试', 502);
        const header = Buffer.alloc(44);
        header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
        header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
        header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
        header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
        // One response contains all audio. A later GET never depends on this
        // instance's temporary filesystem or on being routed to the same VM.
        return json({ url: `data:audio/wav;base64,${Buffer.concat([header, pcm]).toString('base64')}`, duration: pcm.length / (rate * 2) });
      }
      if (route === '/api/write' && method === 'POST') {
        const input = await body();
        const topic = typeof input?.topic === 'string' ? input.topic.trim() : '';
        const language = languages.find((item) => item.code === input?.language);
        if (!topic || topic.length > 300 || !language) throw fail('请填写主题并选择语言', 400);
        if (!config.visionKey) throw fail('写作服务尚未连接，请联系工作区管理员', 503);
        const output = await visionJSON(config,
          `Write original short documentary narration in ${language.speech}, 5-7 concise sentences about the supplied topic. Prefer visual verifiable statements. Avoid unsupported precise numbers. Return JSON {"title":"short title","script":"narration"}. No stage directions or headings inside script.`,
          [{ text: topic }], { controller: { signal: request.signal }, events: [], disableTransientRetries: true }, 'text-planning', { fetchImpl });
        if (typeof output.title !== 'string' || typeof output.script !== 'string' || !output.script.trim() || output.script.length > scriptLimits.maxCharacters) throw fail('未生成可用的脚本，请重试', 502);
        return json({ title: output.title.slice(0, 100), script: output.script });
      }
      if (/^\/api\/(?:productions|export|exports|render|narration-track|analyze)(?:\/|$)/.test(route)) return productionUnavailable();
      if (['/api/config', '/api/health', '/api/voices', '/api/narration', '/api/write'].includes(route)) return json({ error: '请求方法不支持' }, 405, { allow: route === '/api/config' ? 'GET, POST' : ['/api/narration', '/api/write'].includes(route) ? 'POST' : 'GET' });
      return json({ error: '接口不存在' }, 404);
    } catch (error) {
      return json({ error: redact(error.message), ...(error.code ? { code: error.code } : {}) }, Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502);
    }
  };
}
