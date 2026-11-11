import { setTimeout as delay } from 'node:timers/promises';

function redact(value, config) {
  let text = String(value || '');
  if (config.visionKey) text = text.replaceAll(config.visionKey, '[redacted]');
  return text.replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
    .replace(/\bBearer\s+[\w.~+\/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bAIza[\w-]{20,}\b/g, '[redacted]')
    .replace(/\b((?:x-goog-)?api[_-]?key|authorization|key)\s*[:=]\s*["']?[^\s,;'"&}]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 600);
}

// Race even injected waits against abort; production waits also cancel their timer.
async function abortable(operation, signal) {
  signal.throwIfAborted();
  let onAbort;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }),
      new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}

function abortedError(signal) {
  return signal?.aborted
    ? Object.assign(new Error('配音已取消'), { name: 'AbortError', status: 499, code: 'TTS_CANCELLED' })
    : Object.assign(new Error('配音请求超时，请稍后重试'), { status: 502, code: 'TTS_TIMEOUT' });
}

function quotaKind(data, raw) {
  // A generic RESOURCE_EXHAUSTED or "check your plan and billing details" can
  // describe minute limits too. Stop only for explicit daily/billing evidence.
  const evidence = (data ? JSON.stringify(data) : raw).replace(/https?:\/\/[^\s<>"']+/gi, '');
  if (/daily|per[\s_-]?day|每日|每天|当日.{0,12}(?:限额|配额|额度)/i.test(evidence)) return 'daily';
  if (/insufficient[\s_-]?(?:funds|balance|credits|quota)|(?:billing|payment)[\s_-]?(?:disabled|not[\s_-]?(?:enabled|active)|required|hard[\s_-]?limit|account[\s_-]?(?:disabled|suspended|closed))|(?:billing|balance|credits?).{0,45}(?:exhausted|depleted|insufficient|suspended|disabled|past[\s_-]?due)|payment[\s_-]?required|prepayment.{0,30}(?:depleted|exhausted)|(?:余额|额度|费用).{0,8}(?:不足|耗尽|用尽)|欠费|计费.{0,8}(?:未启用|停用|禁用)/i.test(evidence)) return 'billing';
  return 'unknown';
}

async function providerError(response, config, signal) {
  let raw = '';
  try { raw = await abortable(() => response.text(), signal); }
  catch (error) { if (signal.aborted) throw error; }
  let data;
  try { data = JSON.parse(raw); } catch {}
  const kind = quotaKind(data, raw);
  const status = response.status;
  const detail = redact(data?.error?.message || (typeof data?.error === 'string' ? data.error : data?.message) || raw, config);
  const label = status === 401 || status === 403 ? '配音服务鉴权或权限被拒绝'
    : status === 402 || kind === 'billing' ? '配音服务计费或可用余额受限'
      : kind === 'daily' ? '配音服务每日配额已达到上限'
        : status === 429 ? '配音服务限流或配额受限' : '配音服务请求失败';
  return Object.assign(new Error(`${label}（HTTP ${status}）${detail ? `：${detail}` : ''}`), {
    status, quotaKind: kind, code: 'TTS_PROVIDER_ERROR',
    retryable: (status === 429 || [502, 503, 504].includes(status)) && kind === 'unknown',
  });
}

function connectionError(error, config) {
  const transient = /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_SOCKET)$/.test(error?.code || error?.cause?.code || '')
    || /fetch failed|failed to fetch|network (?:error|request failed)|socket hang up|connection reset|timed? ?out/i.test(error?.message || '')
    || error?.name === 'TimeoutError';
  const detail = redact(error?.message, config);
  return Object.assign(new Error(`配音服务连接失败${detail ? `：${detail}` : ''}`), { status: 502, code: 'TTS_CONNECTION_ERROR', retryable: transient });
}

function retryDelay(response, attempt, now) {
  const header = response?.headers?.get('retry-after')?.trim();
  if (header) {
    const ms = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000
      : /[a-z]/i.test(header) ? Date.parse(header) - now() : NaN;
    if (Number.isFinite(ms)) return Math.max(0, Math.min(10000, ms));
  }
  return 2000 * 2 ** (attempt - 1);
}

export async function requestNarration(config, model, payload, signal, {
  fetchImpl = fetch,
  sleepImpl = (ms, waitSignal) => delay(ms, undefined, { signal: waitSignal }),
  now = Date.now,
} = {}) {
  // One timeout budget spans all attempts and backoff, not 120 seconds per retry.
  const requestSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120000)]);
  const url = `${config.visionBase.replace(/\/$/, '')}/models/${model}:generateContent`;
  const body = JSON.stringify(payload);
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (requestSignal.aborted) throw abortedError(signal);
    let response, failure;
    try {
      response = await abortable(() => fetchImpl(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.visionKey },
        signal: requestSignal, body,
      }), requestSignal);
      if (response.ok) return await abortable(() => response.json(), requestSignal);
      failure = await providerError(response, config, requestSignal);
    } catch (error) {
      if (requestSignal.aborted) throw abortedError(signal);
      failure = connectionError(error, config);
    }
    failure.attempts = attempt;
    if (!failure.retryable || attempt === 3) throw failure;
    try { await abortable(() => sleepImpl(retryDelay(response, attempt, now), requestSignal), requestSignal); }
    catch (error) { if (requestSignal.aborted) throw abortedError(signal); throw connectionError(error, config); }
  }
}
