import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat, rename, rm, readdir, utimes } from 'node:fs/promises';
import path from 'node:path';
import { workDirectory } from './runtime.mjs';
import scriptLimits from '../shared/script-limits.json' with { type: 'json' };
import { narrationConfig } from './ai-services.mjs';
import { probe, run } from './process.mjs';
import { requestNarration } from './narration-request.mjs';
import { sharedOperations } from './shared-operation.mjs';
import voiceCatalog from '../shared/voices.json' with { type: 'json' };
import languages from '../shared/languages.json' with { type: 'json' };
import { retainedMedia } from './media-retention.mjs';
import { estimateNarrationSeconds } from '../shared/narration-duration.mjs';
import { narrationPlan, ensureNarrationManifest, checkedNarrationArtifact, writeNarrationReceipt, assembleNarration, withNarrationSlot, activeNarrationDirectories, CHUNK_CONCURRENCY } from './narration-chunks.mjs';

export const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const folder = path.join(workDirectory, 'narration');
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
    if (old.file !== currentFile && !retainedMedia(old.file)) {
      try { await rm(old.file, { force: true }); await rm(old.file.replace(/\.wav$/u, '.json'), { force: true }); bytes -= old.info.size; } catch {}
    }
  }
  const chunksRoot = path.join(directory, 'chunks');
  const chunkDirectories = [];
  for (const key of await readdir(chunksRoot).catch(() => [])) {
    if (!/^[a-f0-9]{64}$/u.test(key)) continue;
    const target = path.join(chunksRoot, key), info = await stat(target).catch(() => null);
    if (!info?.isDirectory()) continue;
    let size = 0;
    for (const name of await readdir(target).catch(() => [])) { const child = await stat(path.join(target, name)).catch(() => null); if (child?.isFile()) size += child.size; }
    bytes += size; chunkDirectories.push({ target, info, size, key });
  }
  for (const old of chunkDirectories.sort((a, b) => a.info.mtimeMs - b.info.mtimeMs)) {
    if (bytes <= 96 * 1024 * 1024 && Date.now() - old.info.mtimeMs < 24 * 3600_000) continue;
    if (old.key !== path.basename(currentFile, '.wav') && !activeNarrationDirectories.has(old.target) && !retainedMedia(old.target, true)) {
      try { await rm(old.target, { recursive: true, force: true }); bytes -= old.size; } catch {}
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

async function recordNarration(text, voice, style, voiceStyle, config, file, signal) {
  const attempt = randomUUID();
  const data = await withNarrationSlot(signal, () => requestNarration(config, TTS_MODEL, { contents: [{ parts: [{ text: `${style}\n\nNARRATION:\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }, signal, { attemptTimeoutMs: Math.max(45000, Math.min(120000, estimateNarrationSeconds(text, voiceStyle) * 1000)) }));
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('配音服务未完整读完这一段旁白，已保留完成的录音');
  const parts = candidate?.content?.parts?.filter((part) => part.inlineData?.data).map((part) => part.inlineData);
  if (!parts?.length || parts.some((part) => !/audio\/(?:L16|pcm)/i.test(part.mimeType || ''))) throw new Error('Gemini 没有返回受支持的 PCM 音轨，未使用其他声音替代');
  const rate = Number(parts[0].mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
  if (!Number.isSafeInteger(rate) || rate < 8000 || rate > 96000 || parts.some((part) => (Number(part.mimeType.match(/rate=(\d+)/)?.[1]) || 24000) !== rate)) throw new Error('配音采样率无效');
  const pcm = Buffer.concat(parts.map((part) => Buffer.from(part.data, 'base64')));
  if (pcm.length < rate || pcm.length > rate * 2 * 180 || pcm.length % 2) throw new Error('配音片段长度无效，已保留完成的录音');
  const temporary = `${file}.${attempt}.raw.wav`, normalized = `${file}.${attempt}.normalized.wav`;
  try {
    await writeFile(temporary, wav(pcm, rate));
    const info = await normalizeNarration(temporary, normalized, signal);
    signal.throwIfAborted(); await rename(normalized, file);
    return { file, duration: info.duration };
  } finally { await Promise.all([temporary, normalized].map((file) => rm(file, { force: true }))); }
}

async function verifiedPreviousTrack(project, text, key, file, signal) {
  const track = project.narrationTrack, compact = (value) => String(value || '').replace(/\s+/gu, '');
  if (track?.processingVersion !== 2 || track.key !== key || track.voice !== project.voice || track.style !== (project.voiceStyle || 'documentary') || track.language !== (project.language || 'auto') || !Number.isFinite(track.duration) || !Array.isArray(track.scenes) || !track.scenes.length || compact(track.scenes.map((scene) => scene.text).join('')) !== compact(text)) return null;
  if (track.scenes.some((scene, index) => !Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.end <= scene.start || (index === 0 ? scene.start !== 0 : Math.abs(scene.start - track.scenes[index - 1].end) > .001))) return null;
  const end = track.scenes.at(-1).end;
  if (end < track.duration - .001 || end > track.duration + .3) return null;
  try {
    const audio = await probe(file, signal);
    if (!audio.hasAudio || audio.duration < .3 || Math.abs(audio.duration - track.duration) > .002) return null;
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', file, '-f', 'null', '-'], signal);
    await utimes(file, new Date(), new Date());
    return { key, file, duration: audio.duration, model: TTS_MODEL };
  } catch { signal?.throwIfAborted(); return null; }
}

const progressListeners = new Map(), progressSnapshots = new Map();
function announceProgress(key, value) { progressSnapshots.set(key, value); for (const listener of progressListeners.get(key) || []) { try { listener(value); } catch {} } }

async function longNarration(plan, voice, style, project, config, file, signal) {
  const { manifest, texts } = plan, key = manifest.key;
  const directory = path.join(folder, 'chunks', key);
  activeNarrationDirectories.set(directory, (activeNarrationDirectories.get(directory) || 0) + 1);
  const group = new AbortController(), groupSignal = AbortSignal.any([signal, group.signal]);
  try {
    await ensureNarrationManifest(directory, manifest);
    const chunks = new Array(texts.length), completed = new Set();
    const report = () => announceProgress(key, { version: 1, key, chunkKeys: manifest.chunks.map((chunk) => chunk.key), completed: completed.size, total: texts.length, updatedAt: new Date().toISOString() });
    report(); let next = 0;
    const worker = async () => {
      while (next < texts.length) {
        groupSignal.throwIfAborted(); const index = next++, chunk = manifest.chunks[index];
        const chunkFile = path.join(directory, `${chunk.key}.wav`), identity = `${key}:${chunk.key}`;
        chunks[index] = await checkedNarrationArtifact(chunkFile, identity, groupSignal, 180);
        if (!chunks[index]) {
          chunks[index] = await recordNarration(texts[index], voice, style, project.voiceStyle, config, chunkFile, groupSignal);
          // Finish the receipt even if another chunk fails at this instant. These
          // immutable bytes can be reused safely by the resumed task.
          await writeNarrationReceipt(chunkFile, identity, chunks[index].duration);
        }
        completed.add(index); report();
      }
    };
    const workers = Array.from({ length: Math.min(CHUNK_CONCURRENCY, texts.length) }, () => worker().catch((error) => { group.abort(error); throw error; }));
    const outcomes = await Promise.allSettled(workers);
    const failed = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failed) throw group.signal.reason || failed.reason;
    signal.throwIfAborted();
    const temporary = `${file}.${randomUUID()}.assembled.wav`;
    try {
      const info = await assembleNarration(chunks.map((chunk) => chunk.file), temporary, signal);
      const expected = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
      if (Math.abs(info.duration - expected) > .01) throw new Error('旁白拼接长度不完整，已保留完成的录音');
      signal.throwIfAborted(); await rename(temporary, file);
      await writeNarrationReceipt(file, key, info.duration);
      await pruneNarrationCache(folder, file);
      return { key, file, duration: info.duration, model: TTS_MODEL };
    } finally { await rm(temporary, { force: true }); }
  } finally { const users = activeNarrationDirectories.get(directory) - 1; if (users) activeNarrationDirectories.set(directory, users); else activeNarrationDirectories.delete(directory); }
}

export async function narrationAudio(scene, project, config, signal, onProgress) {
  const voice = project.voice?.split(':')[1];
  if (!project.voice?.startsWith('gemini:') || !voices.has(voice)) throw new Error('请选择 Gemini 神经配音并重新选材；旧版本机朗读不满足本片的人声要求');
  if (!narrationConfig(config).visionKey) throw new Error('自然配音需要已连接的声音服务');
  const text = String(scene.text || '');
  if (!text.trim() || text.length > scriptLimits.maxCharacters) throw new Error('配音文本需要 1–25,000 字符的台词');
  const language = languages.find((l) => l.code === project.language);
  const languageStyle = language ? `Speak fluent native ${language.speech}. The supplied narration is already in this language; do not translate or change any words.` : 'Speak in the language of the supplied narration, using standard Mandarin for Chinese.';
  const style = languageStyle + ' ' + (deliveryStyles[project.voiceStyle] || deliveryStyles.documentary) + ' Read the exact narration below as a human narrator. Natural human phrasing and breaths, medium pace, connected delivery consistent with the requested style. No announcer affectation, robotic rhythm, extra words, headings, music or sound effects. Do not read these instructions. Read only the narration verbatim.';
  const legacyKey = createHash('sha256').update(JSON.stringify({ text, voice, style, model: TTS_MODEL })).digest('hex');
  const key = createHash('sha256').update(`${legacyKey}:natural-pauses-v2`).digest('hex');
  const plan = narrationPlan(text, voice, style, TTS_MODEL, project.voiceStyle);
  if (plan.texts.length > 1) {
    // A previous complete, aligned film remains reusable after adding chunking.
    // Its exact request key and saved track identity must match; existence alone
    // never upgrades a legacy recording into an approved long track.
    const previousKey = createHash('sha256').update(`${legacyKey}:natural-pauses-v2`).digest('hex');
    const previous = await verifiedPreviousTrack(project, text, previousKey, narrationPath(previousKey), signal);
    if (previous) return previous;
    const key = plan.manifest.key, file = narrationPath(key);
    await mkdir(folder, { recursive: true });
    if (onProgress) { if (!progressListeners.has(key)) progressListeners.set(key, new Set()); progressListeners.get(key).add(onProgress); if (progressSnapshots.has(key)) onProgress(progressSnapshots.get(key)); }
    try {
      const cached = await checkedNarrationArtifact(file, key, signal);
      if (cached) { await utimes(file, new Date(), new Date()); onProgress?.({ version: 1, key, chunkKeys: plan.manifest.chunks.map((chunk) => chunk.key), completed: plan.texts.length, total: plan.texts.length, updatedAt: new Date().toISOString() }); return { key, ...cached, model: TTS_MODEL }; }
      return await recordingRequest(key, signal, (recordingSignal) => longNarration(plan, voice, style, project, config, file, recordingSignal));
    } finally { if (onProgress) progressListeners.get(key)?.delete(onProgress); if (!progressListeners.get(key)?.size) { progressListeners.delete(key); progressSnapshots.delete(key); } }
  }
  await mkdir(folder, { recursive: true });
  const file = narrationPath(key);
  const checkpointed = project.narrationRecording?.version === 1 && project.narrationRecording.key === key;
  try {
    if (checkpointed) {
      const verified = await checkedNarrationArtifact(file, key, signal, 600);
      if (verified) { await utimes(file, new Date(), new Date()); return { key, ...verified, model: TTS_MODEL }; }
    }
    if (!checkpointed && (await stat(file)).size > 44) {
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
      const { duration } = await recordNarration(text, voice, style, project.voiceStyle, config, file, recordingSignal);
      await pruneNarrationCache(folder, file);
      return { key, file, duration, model: TTS_MODEL };
  });
}
