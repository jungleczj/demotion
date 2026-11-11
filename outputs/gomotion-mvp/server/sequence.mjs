import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assets } from './sources.mjs';

// Only small catalog thumbnails are read. No candidate videos are downloaded.
const fingerprints = new Map();
async function fingerprint(asset, signal) {
  const key = `${asset.id}:${asset.thumbnail || asset.thumbnailPath || ''}`;
  if (fingerprints.has(key)) return fingerprints.get(key);
  let bytes;
  if (asset.thumbnailPath) bytes = await readFile(asset.thumbnailPath);
  else {
    if (!asset.thumbnail || !/^https:\/\//.test(asset.thumbnail)) return null;
    const response = await fetch(asset.thumbnail, { signal, headers: { 'User-Agent': 'GoMotionLocalMVP/0.1' } });
    if (!response.ok || !response.body) return null;
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { await response.body.cancel().catch(() => {}); return null; }
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > 2 * 1024 * 1024) return null;
  const raw = await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', 'pipe:0', '-vf', 'scale=24:24', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { signal, stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = []; let size = 0;
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size <= 1728) chunks.push(chunk); });
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.on('close', (code) => code === 0 && size === 1728 ? resolve(Buffer.concat(chunks)) : reject(new Error('缩略图不可分析')));
    child.stdin.end(bytes);
  });
  const histogram = new Array(24).fill(0);
  let brightness = 0, saturation = 0;
  for (let i = 0; i < raw.length; i += 3) {
    const r = raw[i] / 255, g = raw[i + 1] / 255, b = raw[i + 2] / 255;
    histogram[Math.min(7, Math.floor(r * 8))] += 1 / 576;
    histogram[8 + Math.min(7, Math.floor(g * 8))] += 1 / 576;
    histogram[16 + Math.min(7, Math.floor(b * 8))] += 1 / 576;
    brightness += (.2126 * r + .7152 * g + .0722 * b) / 576;
    saturation += (Math.max(r, g, b) - Math.min(r, g, b)) / 576;
  }
  const value = { histogram, brightness, saturation };
  fingerprints.set(key, value);
  if (fingerprints.size > 300) fingerprints.delete(fingerprints.keys().next().value);
  return value;
}

function difference(a, b) {
  if (!a || !b) return 0;
  return Math.min(1, a.histogram.reduce((sum, value, i) => sum + Math.abs(value - b.histogram[i]), 0) / 6
    + Math.abs(a.brightness - b.brightness) * .5 + Math.abs(a.saturation - b.saturation) * .3);
}
const score = (asset) => Number.isFinite(asset.score) ? Math.max(0, Math.min(100, asset.score)) : 50;
const meaningfulAuthor = (asset) => asset.author && !/contributor|本地上传|NASA$/i.test(asset.author);

function quality(asset, scene, format) {
  let value = score(asset);
  if (asset.width && asset.height) {
    const ratio = asset.width / asset.height;
    const target = format === 'portrait' ? 9 / 16 : 16 / 9;
    const retained = Math.min(ratio / target, target / ratio);
    value -= (1 - retained) * 18;
    if (Math.min(asset.width, asset.height) < 480) value -= 18;
  }
  if (asset.kind === 'image') value -= 12;
  if (asset.duration && asset.duration < scene.duration) value -= 12;
  return value;
}

function transition(previous, current, previousFeatures, currentFeatures, anchorFeatures) {
  if (!previous) return 0;
  let value = 0;
  if (previous.asset.kind !== current.asset.kind) value -= 18;
  if (previous.asset.provider === current.asset.provider) value += 2;
  if (meaningfulAuthor(previous.asset) && previous.asset.provider === current.asset.provider && previous.asset.author === current.asset.author) value += 7;
  value -= difference(previousFeatures, currentFeatures) * 26;
  value -= difference(anchorFeatures, currentFeatures) * 12;
  return value;
}

export async function selectSequence(project, signal) {
  const scenes = project.scenes;
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 12) throw new Error('请提供 1–12 个镜头');
  const choices = scenes.map((scene) => {
    const input = scene.confirmed ? [scene.selected] : [...(scene.candidates || []), scene.selected];
    const seen = new Set();
    const resolved = input.filter(Boolean).flatMap((candidate) => {
      const original = assets.get(candidate.id);
      if (!original || seen.has(original.id)) return [];
      seen.add(original.id);
      return [{ ...original, score: score(candidate), reason: String(candidate.reason || '').slice(0, 250), matchMethod: candidate.matchMethod }];
    }).sort((a, b) => score(b) - score(a));
    const best = score(resolved[0] || {});
    // Consistency may break ties; it must not rescue a clearly irrelevant result.
    return resolved.filter((asset) => scene.confirmed || score(asset) >= best - 12).slice(0, 5);
  });
  const unique = [...new Map(choices.flat().map((asset) => [asset.id, asset])).values()];
  const features = new Map(); let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      signal?.throwIfAborted();
      const asset = unique[cursor++];
      try { features.set(asset.id, await fingerprint(asset, AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(6500)]))); }
      catch { features.set(asset.id, null); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  signal?.throwIfAborted();
  let beam = [{ value: 0, path: [], anchor: null }];
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const next = [];
    for (const state of beam) {
      const previous = state.path.at(-1);
      if (!choices[index].length) { next.push({ ...state, path: [...state.path, null] }); continue; }
      for (const asset of choices[index]) {
        let start = scene.confirmed || asset.id === scene.selected?.id ? Math.max(0, Number(scene.start) || 0) : 0;
        let value = quality(asset, scene, project.format);
        const same = previous?.asset.id === asset.id;
        if (same && !scene.confirmed) {
          const continuation = previous.start + Math.max(3, Number(scenes[index - 1].duration) || 6);
          // Reuse only when there is enough known footage; never restart the clip.
          if (asset.duration >= continuation + scene.duration) { start = continuation; value += 8; }
          else value -= 65;
        } else if (state.path.some((entry) => entry?.asset.id === asset.id)) value -= 30;
        const current = { asset, start };
        value += transition(previous, current, features.get(previous?.asset.id), features.get(asset.id), state.anchor);
        next.push({ value: state.value + value, path: [...state.path, current], anchor: state.anchor || features.get(asset.id) || null });
      }
    }
    beam = next.sort((a, b) => b.value - a.value).slice(0, 16);
  }
  const path = beam[0].path;
  const notes = [];
  const result = scenes.map((scene, index) => {
    const chosen = path[index];
    if (!chosen) return { id: scene.id, selected: null, start: scene.start || 0, continuityNote: '候选不足，未替你补入无关画面' };
    const previous = path[index - 1];
    const colorDifference = difference(features.get(previous?.asset.id), features.get(chosen.asset.id));
    const note = scene.confirmed ? '保留你锁定的素材' : previous?.asset.id === chosen.asset.id && chosen.start > previous.start
      ? '沿用上一段原片的后续画面，保持连续'
      : features.get(chosen.asset.id) ? '已结合整片候选的缩略图色彩、比例和作者选材；主体一致性仍需预览'
      : '缩略图无法分析，当前仅依据目录信息选材';
    if (choices[index].length < 2 && !scene.confirmed) notes.push(`镜头 ${index + 1} 缺少可比较的相关候选`);
    if (previous && colorDifference > .5) notes.push(`镜头 ${index + 1} 与上一镜头色彩差异较大，建议人工替换`);
    if (scene.exact) notes.push(`镜头 ${index + 1} 涉及具体实体，仍须核对真实画面`);
    return { id: scene.id, selected: chosen.asset, start: chosen.start, continuityNote: note };
  });
  return { scenes: result, report: { analyzed: [...features.values()].filter(Boolean).length, candidates: unique.length, warnings: notes, method: 'thumbnail-color-and-metadata' } };
}
