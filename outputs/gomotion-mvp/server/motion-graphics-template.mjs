import path from 'node:path';
import { backgroundSVG } from './visual-backgrounds.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const compact = (s) => String(s || '').replace(/\s+/gu, '');
const bounded = (s, max) => String(s || '').trim().slice(0, max);
const digest = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
export function validateAnnotation(annotation, scene, sourceId) {
  const { label, quote, region, observed } = annotation || {};
  if (annotation?.sourceAssetId !== sourceId || !nonempty(label) || label.length > 32 || !nonempty(quote) || quote.length > 240 || !compact(scene.text).includes(compact(quote)) || !compact(quote).includes(compact(label)) || !nonempty(observed)) throw new Error('图片标注必须引用当前旁白原文并有实际画面依据');
  if (!Array.isArray(region) || region.length !== 4 || region.some((n) => typeof n !== 'number' || !Number.isFinite(n)) || region[0] < 0 || region[1] < 0 || region[2] < .015 || region[3] < .015 || region[0] + region[2] > 1 || region[1] + region[3] > 1) throw new Error('图片标注区域无效');
  return { sourceAssetId: sourceId, label: label.trim(), quote: quote.trim(), region: [...region], observed: bounded(observed, 500) };
}

export function validateMotionPlan(raw, scene, _story) {
  if (raw?.schemaVersion !== 2 || raw.type !== 'source-annotation' || !Array.isArray(raw.sourceAssets) || raw.sourceAssets.length !== 1) throw new Error('补片必须使用可追溯的真实图片来源，不接受自行绘图');
  if (raw.sceneId !== scene.id) throw new Error('来源补片没有对应当前镜头');
  if (raw.mechanism || raw.nodes || raw.svg || raw.actions || raw.relationships) throw new Error('来源补片不能自行创造动作、机制或关系');
  const sourceAssets = raw.sourceAssets.map((asset) => {
    if (['id', 'provider', 'sourceId', 'sourceUrl', 'author', 'license', 'licenseUrl', 'localPath', 'decodedPath'].some((key) => !nonempty(asset?.[key])) || !/^https:\/\//.test(asset.sourceUrl) || !/^https:\/\//.test(asset.licenseUrl) || !path.isAbsolute(asset.localPath) || !path.isAbsolute(asset.decodedPath) || !digest(asset.sha256) || !digest(asset.decodedSha256) || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width <= 0 || asset.height <= 0) throw new Error('真实来源信息、许可或实际文件不完整');
    const review = asset.contentReview;
    if (!review || ['actualRead', 'matched', 'exactSubject', 'clear', 'watermarkFree', 'licenseUsable'].some((key) => review[key] !== true) || review.inputSha256 !== asset.sha256 || review.reviewedImageSha256 !== asset.decodedSha256 || !nonempty(review.observed)) throw new Error('来源图片缺少与实际文件哈希一致的读取和内容审查');
    if (!Array.isArray(review.annotations) || review.annotations.length < 2 || review.annotations.length > 4) throw new Error('来源图片需要 2–4 个实际读取支持的标注');
    return { ...asset, contentReview: { ...review, annotations: review.annotations.map((a) => validateAnnotation(a, scene, asset.id)) } };
  });
  if (!Array.isArray(raw.annotations) || raw.annotations.length < 2 || raw.annotations.length > 4) throw new Error('来源补片需要 2–4 个有依据的标注，不能只平移静图');
  const annotations = raw.annotations.map((a) => {
    const asset = sourceAssets.find((s) => s.id === a?.sourceAssetId);
    if (!asset) throw new Error('标注引用了未取得的来源');
    const annotation = validateAnnotation(a, scene, asset.id);
    if (!asset.contentReview.annotations.some((approved) => JSON.stringify(approved) === JSON.stringify(annotation))) throw new Error('标注区域未通过实际图片内容审查');
    return annotation;
  });
  if (new Set(annotations.map((a) => JSON.stringify(a.region))).size < 2 || new Set(annotations.map((a) => a.label)).size < 2) throw new Error('来源补片需要两个不同的可见信息区域与标注');
  const title = bounded(raw.title, 40), explanation = bounded(raw.explanation, 500);
  if (!title || !compact(scene.text).includes(compact(title)) || !explanation) throw new Error('来源补片标题必须来自当前原旁白，且须保留画面说明');
  return { schemaVersion: 2, sceneId: scene.id, narration: scene.text, type: 'source-annotation', title, explanation, sourceAssets, annotations, processingPlan: { kind: 'source-annotation', operations: ['source-image', 'evidence-highlight', 'label-reveal'], preserveMarks: true, noInventedMotion: true, sourceAssetIds: sourceAssets.map((s) => s.id) } };
}

const clamp = (n) => Math.min(1, Math.max(0, n));
const ease = (n) => 1 - (1 - clamp(n)) ** 3;
export function graphicTextLines(value, size, maxWidth = 800) {
  const lines = []; let line = '', used = 0;
  for (const c of String(value)) {
    const advance = size * (/[\u3400-\u9fff]/u.test(c) ? 1 : .59);
    if (line && used + advance > maxWidth) { lines.push(line.trim()); line = ''; used = 0; }
    line += c; used += advance;
  }
  if (line) lines.push(line.trim());
  return lines;
}
function text(value, x, y, size, color, anchor = 'middle', maxWidth = 800) {
  const lines = graphicTextLines(value, size, maxWidth);
  return `<text x="${x}" y="${y}" font-family="PingFang SC,Arial,sans-serif" font-size="${size}" font-weight="500" text-anchor="${anchor}" fill="${color}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.35 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
}
export function sourceLayout(asset, profile) {
  const portrait = profile.height > profile.width, w = profile.width, h = profile.height;
  const box = portrait ? { x: w * .06, y: h * .16, width: w * .88, height: h * .49 } : { x: w * .035, y: h * .19, width: w * .72, height: h * .72 };
  const scale = Math.min(box.width / asset.width, box.height / asset.height);
  return { x: box.x + (box.width - asset.width * scale) / 2, y: box.y + (box.height - asset.height * scale) / 2, width: asset.width * scale, height: asset.height * scale, scale };
}
export function motionSVG(plan, style, progress, profile, marker = '示意', drawText = text, sourceImages = new Map(), layer = 'all') {
  const { width: w, height: h } = profile, portrait = h > w, p = clamp(progress);
  const color = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value || '') ? value : fallback;
  const background = color(style.background, '#163341'), accent = color(style.accent, '#89c9da'), textColor = color(style.text, '#f4f7f8'), muted = color(style.muted, '#bacbd1');
  const contents = [];
  if (layer !== 'overlay') {
    contents.push(backgroundSVG(style.theme, w, h, background));
    for (const asset of plan.sourceAssets) {
      const image = sourceImages.get(asset.id), rect = sourceLayout(asset, profile);
      if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(image || '')) throw new Error('未读取来源图片的真实像素');
      contents.push(`<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="xMidYMid meet" href="${image}"/>`);
    }
  }
  if (layer !== 'source') {
    contents.push(drawText(plan.title, w * .5, h * .095, portrait ? 31 : 36, textColor, 'middle', w * .86));
    plan.annotations.forEach((a, i) => {
      const source = plan.sourceAssets.find((s) => s.id === a.sourceAssetId), image = sourceLayout(source, profile);
      const [rx, ry, rw, rh] = a.region, x = image.x + rx * image.width, y = image.y + ry * image.height, width = rw * image.width, height = rh * image.height;
      const step = p * plan.annotations.length - i, reveal = ease(step * 2.2), active = clamp(1 - Math.max(0, step - .75));
      const perimeter = 2 * (width + height);
      contents.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="none" stroke="${accent}" stroke-width="${3 + active * 2}" opacity="${reveal * (.5 + .5 * active)}" stroke-dasharray="${perimeter}" stroke-dashoffset="${perimeter * (1 - reveal)}"/>`);
      const tx = portrait ? w * .1 : w * .79, ty = portrait ? h * (.72 + i * .055) : h * (.30 + i * .16);
      contents.push(`<g opacity="${reveal}"><rect x="${tx - 9}" y="${ty - 23}" width="3" height="31" fill="${accent}"/>${drawText(a.label, tx + 5, ty, portrait ? 23 : 24, textColor, 'start', portrait ? w * .76 : w * .17)}</g>`);
    });
    contents.push(drawText(marker, w * .94, h * .955, 16, muted, 'end', w * .8));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${contents.join('')}</svg>`;
}
