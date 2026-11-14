const geminiBase = 'https://generativelanguage.googleapis.com/v1beta';
const geminiReviewModel = 'gemini-3.8-flash';
export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const narrationModel = (config) => config.ttsModel || DEFAULT_TTS_MODEL;

// Each credential belongs to one service. A compatible text/image key is never
// a fallback for audio, even when the audio service has not been configured.
export function aiConfigFromEnv(env = process.env) {
  const visionProvider = env.VISION_PROVIDER || 'gemini';
  const legacyGemini = visionProvider === 'gemini';
  const visionKey = env.VISION_API_KEY || (legacyGemini ? env.GEMINI_API_KEY : '') || '';
  const visionBase = env.VISION_BASE_URL || (legacyGemini ? geminiBase : 'https://api.deepseek.com');
  const visionModel = env.VISION_MODEL || (legacyGemini ? geminiReviewModel : 'deepseek-flash');
  return {
    visionEnabled: true, visionProvider, visionKey, visionBase, visionModel,
    textProvider: env.TEXT_AI_PROVIDER || 'vision',
    llmKey: env.LLM_API_KEY || env.SECRET_DEEPSEEK_API_KEY || '',
    llmBase: env.LLM_BASE_URL || 'https://api.deepseek.com', llmModel: env.LLM_MODEL || 'deepseek-flash',
    ttsModel: (env.TTS_MODEL || DEFAULT_TTS_MODEL).trim().replace(/^models\//, ''),
    narrationKey: env.NARRATION_API_KEY || env.GEMINI_API_KEY || (legacyGemini ? visionKey : ''),
    narrationBase: env.NARRATION_BASE_URL || (legacyGemini ? visionBase : geminiBase),
    reviewProvider: env.REVIEW_PROVIDER || 'gemini',
    reviewKey: env.REVIEW_API_KEY || env.GEMINI_API_KEY || (legacyGemini ? visionKey : ''),
    reviewBase: env.REVIEW_BASE_URL || (legacyGemini ? visionBase : geminiBase),
    reviewModel: env.REVIEW_MODEL || (legacyGemini ? visionModel : geminiReviewModel),
  };
}

export function narrationConfig(config) {
  const legacyGemini = !config.visionProvider || config.visionProvider === 'gemini';
  return { ...config, visionProvider: 'gemini', visionKey: config.narrationKey ?? (legacyGemini ? config.visionKey : ''), visionBase: config.narrationBase || (legacyGemini ? config.visionBase : geminiBase) || geminiBase };
}

export function audioReviewConfig(config) {
  const legacyGemini = config.visionProvider === 'gemini';
  return { ...config, visionEnabled: true, visionProvider: config.reviewProvider || 'gemini', visionKey: config.reviewKey ?? (legacyGemini ? config.visionKey : ''), visionBase: config.reviewBase || (legacyGemini ? config.visionBase : geminiBase) || geminiBase, visionModel: config.reviewModel || (legacyGemini ? config.visionModel : geminiReviewModel) || geminiReviewModel };
}

export function redactAISecrets(message, config) {
  let text = String(message || '');
  for (const key of [config.visionKey, config.llmKey, config.narrationKey, config.reviewKey].filter(Boolean)) text = text.replaceAll(key, '[redacted]');
  return text;
}
