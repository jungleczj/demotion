import { sceneCacheRequest, readSceneObservation, saveSceneObservation } from './scene-observation-cache.mjs';
import { redactAISecrets } from './ai-services.mjs';
import { quotaKind } from './provider-quota.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const cleanJSON = (text) => JSON.parse(String(text || '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim());

function retryDelay(response, providerError, attempt) {
  const header = response?.headers.get('retry-after')?.trim();
  const headerMs = /^\d*\.?\d+$/.test(header || '') ? Number(header) * 1000
    : header ? Date.parse(header) - Date.now() : NaN;
  const retryInfo = Array.isArray(providerError?.details)
    ? providerError.details.find((detail) => detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')
    : undefined;
  const seconds = String(retryInfo?.retryDelay || '').match(/^(\d+(?:\.\d+)?)s$/)?.[1]
    ?? providerError?.message?.match?.(/\bretry in (\d+(?:\.\d+)?)s\b/i)?.[1];
  const hints = [headerMs, Number(seconds) * 1000].filter(Number.isFinite);
  return hints.length ? Math.ceil(Math.max(0, ...hints)) : 2000 * (attempt + 1);
}

export function visionConfigured(config) {
  return Boolean(config.visionEnabled && config.visionKey && config.visionModel);
}

export async function visionJSON(config, system, parts, job, stage, { fetchImpl = fetch, sleepImpl = (ms, waitSignal) => delay(ms, undefined, { signal: waitSignal }) } = {}) {
  if (!visionConfigured(config)) throw Object.assign(new Error('请在设置 → AI 服务中配置并启用视觉模型'), { status: 409 });
  job.controller.signal.throwIfAborted();
  const event = { stage, engine: config.visionProvider, model: config.visionModel, status: 'running', inputType: parts.some((p) => p.mime?.startsWith('audio/')) ? 'audio' : parts.some((p) => p.mime === 'video/mp4') ? 'video' : parts.some((p) => p.mime) ? 'timestamped-images' : 'text', mediaCount: parts.filter((p) => p.mime).length, at: new Date().toISOString() };
  job.events.push(event);
  const started = Date.now();
  const timeout = stage.startsWith('rendered-') ? 120000 : stage.startsWith('visual-scene-') || stage === 'whole-film-edit' || stage === 'narration-alignment' ? 60000 : 45000;
  let signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(timeout)]);
  let cooldownBudgetUsed = 0;
  let cooldownElapsed = 0;
  try {
    let endpoint, payload, headers;
    if (config.visionProvider === 'gemini') {
      endpoint = `${config.visionBase.replace(/\/$/, '')}/models/${encodeURIComponent(config.visionModel.replace(/^models\//, ''))}:generateContent`;
      headers = { 'x-goog-api-key': config.visionKey };
      payload = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: parts.map((part) => part.mime ? { inlineData: { mimeType: part.mime, data: part.data } } : { text: part.text }) }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 5000, ...(/^gemini-3[.-]/.test(config.visionModel.replace(/^models\//, '')) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
      };
    } else {
      if (parts.some((p) => p.mime === 'video/mp4' || p.mime?.startsWith('audio/'))) throw new Error('兼容视觉接口需要抽帧输入');
      endpoint = `${config.visionBase.replace(/\/$/, '')}/chat/completions`;
      headers = { Authorization: `Bearer ${config.visionKey}` };
      payload = { model: config.visionModel, messages: [{ role: 'system', content: system }, { role: 'user', content: parts.map((part) => part.mime ? { type: 'image_url', image_url: { url: `data:${part.mime};base64,${part.data}` } } : { type: 'text', text: part.text }) }], response_format: { type: 'json_object' }, max_tokens: 5000 };
      if (new URL(config.visionBase).hostname === 'api.deepseek.com') payload.thinking = { type: 'disabled' };
    }
    const body = JSON.stringify(payload);
    const cache = sceneCacheRequest(config, stage, endpoint, body, parts);
    const cached = await readSceneObservation(cache);
    job.controller.signal.throwIfAborted();
    if (cached) {
      event.status = 'completed'; event.cacheHit = true; event.durationMs = Date.now() - started;
      event.cacheSourceAt = new Date(cached.createdAt).toISOString(); event.cacheSourceModelVersion = cached.modelVersion;
      event.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      event.detail = '复用完全相同输入的已完成画面观察，本次未请求模型；仍执行现时选材校验';
      return cached.data;
    }
    let response, providerError;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      if ((job.calls || 0) >= (job.callLimit || 36)) throw Object.assign(new Error('本轮自动处理已达到上限，已保留草稿'), { code: 'VISION_CALL_LIMIT' });
      job.calls = (job.calls || 0) + 1; event.attempts = attempt + 1;
      response = undefined;
      providerError = undefined;
      try {
        response = await fetchImpl(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body, signal });
      } catch (error) {
        if (signal.aborted) throw error;
        const transient = /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_SOCKET)$/.test(error.cause?.code || error.code || '') || /fetch failed|failed to fetch|socket hang up/i.test(error.message || '');
        if (!transient || job.disableTransientRetries || attempt === 2) throw error;
      }
      if (response && !response.ok) {
        try { providerError = (await response.json()).error; } catch { signal.throwIfAborted(); }
        event.httpStatus = response.status;
        if (response.status === 429) event.quotaKind = quotaKind(providerError);
      }
      if (response && (![429, 502, 503, 504].includes(response.status) || job.disableTransientRetries || attempt === 2)) break;
      if (response?.status === 429 && ['daily', 'billing'].includes(event.quotaKind)) break;
      const waitMs = retryDelay(response, providerError, attempt);
      const remaining = timeout - (Date.now() - started - cooldownElapsed);
      const minuteLimit = response?.status === 429 && event.quotaKind === 'minute';
      // Allow one minute window of server-directed cooldown in addition to the
      // existing processing budget. Other failures still share the old deadline.
      if (minuteLimit ? cooldownBudgetUsed + waitMs > 65000 || remaining <= 0 : waitMs >= remaining) break;
      event.transientRetries = attempt + 1;
      if (minuteLimit) {
        const coolingSince = Date.now();
        signal.throwIfAborted();
        await sleepImpl(waitMs, AbortSignal.any([job.controller.signal, AbortSignal.timeout(waitMs + 5000)]));
        cooldownBudgetUsed += waitMs;
        cooldownElapsed += Date.now() - coolingSince;
        event.cooldownMs = cooldownElapsed;
        signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(remaining)]);
      } else await sleepImpl(waitMs, signal);
    }
    event.httpStatus = response.status;
    if (!response.ok) {
      const providerDetail = redactAISecrets(providerError?.message, config).replace(/https?:\/\/\S+/g, '[服务链接]').slice(0, 450);
      const quotaDetail = { minute: '达到每分钟请求上限', daily: '达到每日配额', billing: '计费或可用余额受限' }[event.quotaKind] || '额度或速率受限';
      throw Object.assign(new Error(`视觉 AI 请求失败（HTTP ${response.status}）${response.status === 401 || response.status === 403 ? '，鉴权或模型权限被拒绝' : response.status === 402 ? '，预付费额度不足' : response.status === 429 ? `，${quotaDetail}` : '，请检查模型与接口'}${providerDetail ? `：${providerDetail}` : ''}`), { status: response.status });
    }
    const result = await response.json();
    const text = config.visionProvider === 'gemini'
      ? result.candidates?.[0]?.content?.parts?.filter((p) => !p.thought && p.text).map((p) => p.text).join('')
      : result.choices?.[0]?.message?.content;
    const usage = result.usageMetadata || result.usage || {};
    event.usage = { inputTokens: usage.promptTokenCount || usage.prompt_tokens || 0, outputTokens: usage.candidatesTokenCount || usage.completion_tokens || 0, totalTokens: usage.totalTokenCount || usage.total_tokens || 0 };
    if (!text) throw new Error(`视觉 AI 没有返回可用文本（${result.candidates?.[0]?.finishReason || result.promptFeedback?.blockReason || 'EMPTY_RESPONSE'}）`);
    const data = cleanJSON(text);
    job.controller.signal.throwIfAborted();
    const finishedNormally = config.visionProvider === 'gemini' ? result.candidates?.[0]?.finishReason === 'STOP' : result.choices?.[0]?.finish_reason === 'stop';
    if (finishedNormally) await saveSceneObservation(cache, data, job.controller.signal, result.modelVersion || result.model);
    job.controller.signal.throwIfAborted();
    event.status = 'completed'; event.durationMs = Date.now() - started;
    return data;
  } catch (error) {
    event.status = 'failed'; event.durationMs = Date.now() - started;
    const rawCode = error.cause?.code || error.code;
    const code = typeof rawCode === 'string' ? rawCode.replace(/[^A-Z0-9_]/g, '').slice(0, 70) : '';
    event.errorCode = code || undefined;
    event.detail = job.controller.signal.aborted ? '已取消' : signal.aborted ? '视觉 AI 请求处理超时，已保留草稿，请稍后重试' : code === 'VISION_CALL_LIMIT' ? error.message : error instanceof SyntaxError ? '模型未返回有效 JSON' : error.message.startsWith('视觉 AI') ? error.message : code === 'UND_ERR_CONNECT_TIMEOUT' ? `视觉 AI 网络连接超时（${code}），请检查服务使用的代理` : `视觉 AI 连接失败${code ? `（${code}）` : ''}`;
    // This layer owns the request limit/deadline. A film-review wrapper must
    // not multiply its attempts or start another full deadline after failure.
    throw Object.assign(new Error(event.detail), { status: error.status, requestRetriesHandled: true, modelEvent: event });
  }
}
