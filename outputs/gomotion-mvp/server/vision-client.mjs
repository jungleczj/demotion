const cleanJSON = (text) => JSON.parse(String(text || '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim());

export function visionConfigured(config) {
  return Boolean(config.visionEnabled && config.visionKey && config.visionModel);
}

export async function visionJSON(config, system, parts, job, stage) {
  if (!visionConfigured(config)) throw Object.assign(new Error('请在设置 → AI 服务中配置并启用视觉模型'), { status: 409 });
  job.controller.signal.throwIfAborted();
  job.calls = (job.calls || 0) + 1;
  if (job.calls > (job.callLimit || 36)) throw new Error('本轮自动处理已达到上限，已保留草稿');
  const event = { stage, engine: config.visionProvider, model: config.visionModel, status: 'running', inputType: parts.some((p) => p.mime?.startsWith('audio/')) ? 'audio' : parts.some((p) => p.mime === 'video/mp4') ? 'video' : parts.some((p) => p.mime) ? 'timestamped-images' : 'text', mediaCount: parts.filter((p) => p.mime).length, at: new Date().toISOString() };
  job.events.push(event);
  const started = Date.now();
  const timeout = stage.startsWith('rendered-') ? 120000 : stage.startsWith('visual-scene-') || stage === 'whole-film-edit' || stage === 'narration-alignment' ? 60000 : 45000;
  const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(timeout)]);
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
    }
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
      if (response.status !== 429 || job.disableTransientRetries || attempt === 2) break;
      let detail = '';
      try { detail = String((await response.clone().json()).error?.message || ''); } catch {}
      if (/daily|per.day|per_day|billing|credits|payment|insufficient|每日|余额/i.test(detail)) break;
      const delay = Math.min(10000, Math.max(1000, Number(response.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1)));
      await response.body?.cancel(); event.transientRetries = attempt + 1;
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    event.httpStatus = response.status;
    if (!response.ok) {
      let providerDetail = '';
      try {
        const errorBody = await response.json();
        providerDetail = String(errorBody.error?.message || '').replaceAll(config.visionKey, '[密钥已隐藏]').replace(/https?:\/\/\S+/g, '[服务链接]').slice(0, 450);
      } catch {}
      throw new Error(`视觉 AI 请求失败（HTTP ${response.status}）${response.status === 401 || response.status === 403 ? '，鉴权或模型权限被拒绝' : response.status === 402 ? '，预付费额度不足' : response.status === 429 ? '，额度或速率受限' : '，请检查模型与接口'}${providerDetail ? `：${providerDetail}` : ''}`);
    }
    const result = await response.json();
    const text = config.visionProvider === 'gemini'
      ? result.candidates?.[0]?.content?.parts?.filter((p) => !p.thought && p.text).map((p) => p.text).join('')
      : result.choices?.[0]?.message?.content;
    const usage = result.usageMetadata || result.usage || {};
    event.usage = { inputTokens: usage.promptTokenCount || usage.prompt_tokens || 0, outputTokens: usage.candidatesTokenCount || usage.completion_tokens || 0, totalTokens: usage.totalTokenCount || usage.total_tokens || 0 };
    if (!text) throw new Error(`视觉 AI 没有返回可用文本（${result.candidates?.[0]?.finishReason || result.promptFeedback?.blockReason || 'EMPTY_RESPONSE'}）`);
    const data = cleanJSON(text);
    event.status = 'completed'; event.durationMs = Date.now() - started;
    return data;
  } catch (error) {
    event.status = 'failed'; event.durationMs = Date.now() - started;
    const code = String(error.cause?.code || error.code || '').replace(/[^A-Z0-9_]/g, '').slice(0, 70);
    event.errorCode = code || undefined;
    event.detail = job.controller.signal.aborted ? '已取消' : error instanceof SyntaxError ? '模型未返回有效 JSON' : error.message.startsWith('视觉 AI') ? error.message : code === 'UND_ERR_CONNECT_TIMEOUT' || error.name === 'TimeoutError' ? `视觉 AI 网络连接超时${code ? `（${code}）` : ''}，请检查服务使用的代理` : `视觉 AI 连接失败${code ? `（${code}）` : ''}`;
    throw new Error(event.detail);
  }
}
