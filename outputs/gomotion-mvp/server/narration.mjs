import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat, rename, rm, readdir, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { probe, run } from './process.mjs';
import { requestNarration } from './narration-request.mjs';
import { sharedOperations } from './shared-operation.mjs';
import voiceCatalog from '../shared/voices.json' with { type: 'json' };
import languages from '../shared/languages.json' with { type: 'json' };

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const folder = path.join(os.tmpdir(), 'gomotion-local-mvp', 'narration');
const recordingRequest = sharedOperations();
const voices = new Set(voiceCatalog.map((v) => v.key));
const deliveryStyles = { documentary: 'Calm, warm documentary narration with measured phrasing and restrained expression.', story: 'Tell an engaging story with gentle changes of emphasis and a connected narrative flow.', conversation: 'Speak conversationally, like one person naturally talking to another. Avoid formal announcing.', explainer: 'Explain clearly and confidently, with distinct phrasing and natural emphasis on the key ideas.', gentle: 'Gentle, warm narration at a relaxed pace, without whispering or exaggeration.' };
export const narrationPath = (key) => path.join(folder, `${key}.wav`);

export async function pruneNarrationCache(directory, currentFile) {
  // Temporary recordings belong to other active requests. Atomic publication
  // and eviction may race, so cleanup must never fail a finished recording.
  const names = await readdir(directory).catch(() => []);
  const files = (await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.wav$/.test(name)).map(async (name) => {
    const file = path.join(directory, name);
    const info = await stat(file).catch(() => null);
    return info?.isFile() ? { file, info } : null;
  }))).filter(Boolean);
  let bytes = files.reduce((sum, file) => sum + file.info.size, 0);
  for (const old of files.sort((a, b) => a.info.mtimeMs - b.info.mtimeMs)) {
    if (bytes <= 96 * 1024 * 1024 && Date.now() - old.info.mtimeMs < 24 * 3600_000) break;
    if (old.file !== currentFile) {
      try { await rm(old.file, { force: true }); bytes -= old.info.size; } catch {}
    }
  }
}

export async function normalizeNarration(input, output, signal) {
  // Keep ordinary pauses. Collapse only abnormal silence longer than two seconds.
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', 'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.12:stop_periods=-1:stop_duration=2:stop_threshold=-50dB:stop_silence=0.45', '-c:a', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-f', 'wav', output], signal);
  const info = await probe(output, signal);
  if (!info.hasAudio || info.duration < .3) throw new Error('配音未包含有效的人声');
  return info;
}

function wav(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function narrationAudio(scene, project, config, signal) {
  const voice = project.voice?.split(':')[1];
  if (!project.voice?.startsWith('gemini:') || !voices.has(voice)) throw new Error('请选择 Gemini 神经配音并重新选材；旧版本机朗读不满足本片的人声要求');
  if (config.visionProvider !== 'gemini' || !config.visionKey) throw new Error('自然配音需要已连接的 Gemini API key');
  const text = String(scene.text || '').trim();
  if (!text || text.length > 6000) throw new Error('每个配音镜头需要 1–6000 字符的台词');
  const language = languages.find((l) => l.code === project.language);
  const languageStyle = language ? `Speak fluent native ${language.speech}. The supplied narration is already in this language; do not translate or change any words.` : 'Speak in the language of the supplied narration, using standard Mandarin for Chinese.';
  const style = languageStyle + ' ' + (deliveryStyles[project.voiceStyle] || deliveryStyles.documentary) + ' Read the exact narration below as a human narrator. Natural human phrasing and breaths, medium pace, connected delivery consistent with the requested style. No announcer affectation, robotic rhythm, extra words, headings, music or sound effects. Do not read these instructions. Read only the narration verbatim.';
  const legacyKey = createHash('sha256').update(JSON.stringify({ text, voice, style, model: TTS_MODEL })).digest('hex');
  const key = createHash('sha256').update(`${legacyKey}:natural-pauses-v2`).digest('hex');
  await mkdir(folder, { recursive: true });
  const file = narrationPath(key);
  try {
    if ((await stat(file)).size > 44) {
      const info = await probe(file, signal);
      if (info.hasAudio && Number.isFinite(info.duration) && info.duration >= .3 && info.duration <= 600) {
        await utimes(file, new Date(), new Date());
        return { key, file, duration: info.duration, model: TTS_MODEL };
      }
    }
  } catch { signal?.throwIfAborted(); }
  return recordingRequest(key, signal, async (recordingSignal) => {
      const attempt = randomUUID();
      // Reuse an existing recording when upgrading its pause handling, without another TTS call.
      const legacy = narrationPath(legacyKey);
      let reuse = false;
      try { reuse = (await stat(legacy)).size > 44; } catch {}
      if (reuse) {
        const temporary = `${file}.${attempt}.normalized.wav`;
        try { const info = await normalizeNarration(legacy, temporary, recordingSignal); recordingSignal.throwIfAborted(); await rename(temporary, file); return { key, file, duration: info.duration, model: TTS_MODEL }; }
        // A malformed old cache is replaceable; cancellation must still stop.
        catch { recordingSignal.throwIfAborted(); }
        finally { await rm(temporary, { force: true }); }
      }
      const data = await requestNarration(config, TTS_MODEL, { contents: [{ parts: [{ text: `${style}\n\nNARRATION:\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }, recordingSignal);
      const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!part || !/audio\/(?:L16|pcm)/i.test(part.mimeType || '')) throw new Error('Gemini 没有返回受支持的 PCM 音轨，未使用其他声音替代');
      const rate = Number(part.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
      const pcm = Buffer.from(part.data, 'base64');
      if (pcm.length < rate || pcm.length > rate * 2 * 600 || pcm.length % 2) throw new Error('配音长度无效或超过 10 分钟，请拆短旁白');
      const temporary = `${file}.${attempt}.raw.wav`, normalized = `${file}.${attempt}.normalized.wav`;
      let duration;
      try {
        await writeFile(temporary, wav(pcm, rate));
        duration = (await normalizeNarration(temporary, normalized, recordingSignal)).duration;
        recordingSignal.throwIfAborted();
        await rename(normalized, file);
      } finally { await Promise.all([temporary, normalized].map((p) => rm(p, { force: true }))); }
      await pruneNarrationCache(folder, file);
      return { key, file, duration, model: TTS_MODEL };
  });
}
