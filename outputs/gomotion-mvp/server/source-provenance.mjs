import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateMotionPlan } from './motion-graphics-template.mjs';

const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const compact = (value) => String(value || '').replace(/\s+/gu, '');
const web = (value) => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };
const annotationKey = (value) => JSON.stringify([value.sourceAssetId, value.label, value.quote, value.region, value.observed]);
const region = (value) => Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[0] >= 0 && value[1] >= 0 && value[2] > 0 && value[3] > 0 && value[0] + value[2] <= 1.001 && value[1] + value[3] <= 1.001;

// This checks the provenance receipt, not the truth of a model's judgement.
// Actual source pixels are read by the image-selection stage and the rendered
// result still requires the ordinary audiovisual review.
export function sourceProvenanceError(scene, asset = scene.selected, story = scene.text || '') {
  const diagram = scene.motionGraphic || scene.renderKind === 'motion-graphic' || asset?.renderKind === 'motion-graphic' || asset?.generated;
  if (!diagram) return null;
  const plan = scene.motionGraphic;
  if (plan?.schemaVersion !== 2 || plan.type !== 'source-annotation') return '补片缺少新版真实素材来源记录，需重新制作';
  if (plan.sceneId !== scene.id || plan.narration !== scene.text) return '补片来源计划没有对应当前镜头与原旁白';
  try { validateMotionPlan(plan, scene, story); }
  catch (error) { return `补片未通过实际图片来源检查：${error.message}`; }
  const bases = plan.sourceAssets;
  if (!Array.isArray(bases) || !bases.length) return '补片没有可追溯的基础素材';
  if (!Array.isArray(asset?.sourceAssets) || asset.sourceAssets.length !== bases.length) return '补片文件与基础素材记录不一致';
  const processing = plan.processingPlan;
  if (processing?.kind !== 'source-annotation' || processing.preserveMarks !== true || processing.noInventedMotion !== true || !Array.isArray(processing.operations)
    || !['source-image', 'evidence-highlight', 'label-reveal'].every((operation) => processing.operations?.includes(operation))
    || processing.operations.some((operation) => !['source-image', 'evidence-highlight', 'label-reveal'].includes(operation))
    || JSON.stringify(processing) !== JSON.stringify(asset.processingPlan)) return '补片加工计划不完整或超出来源加工范围';
  const ids = new Set();
  for (const base of bases) {
    if (!text(base.id) || ids.has(base.id) || !text(base.provider) || base.provider === 'upload' || !text(base.sourceId)
      || !web(base.sourceUrl) || !text(base.author) || !text(base.license) || !web(base.licenseUrl)
      || !path.isAbsolute(base.localPath || '') || !path.isAbsolute(base.decodedPath || '') || !hash(base.sha256) || !hash(base.decodedSha256)
      || !(base.width > 0 && base.height > 0)) return '基础素材的来源、许可或实际文件记录不完整';
    ids.add(base.id);
    const same = asset.sourceAssets.find((candidate) => candidate?.id === base.id);
    if (!same || ['provider', 'sourceId', 'sourceUrl', 'author', 'license', 'licenseUrl', 'sha256', 'decodedSha256', 'localPath', 'decodedPath'].some((key) => same[key] !== base[key])) return '补片文件与来源凭据不一致';
    if (!isDeepStrictEqual(base.contentReview, same.contentReview)) return '补片实际图片审查凭据与已注册来源不一致';
    const review = base.contentReview;
    if (!review || ['actualRead', 'matched', 'exactSubject', 'clear', 'watermarkFree', 'licenseUsable'].some((key) => review[key] !== true)
      || review.inputSha256 !== base.sha256 || review.reviewedImageSha256 !== base.decodedSha256 || !text(review.observed)) return '基础素材未通过实际图片内容与许可检查';
  }
  if (!Array.isArray(plan.annotations) || plan.annotations.length < 2) return '补片缺少实际素材支持的分层标注';
  for (const annotation of plan.annotations) {
    const source = bases.find((base) => base.id === annotation.sourceAssetId);
    if (!source || !text(annotation.label) || !text(annotation.quote) || !compact(scene.text).includes(compact(annotation.quote)) || !compact(annotation.quote).includes(compact(annotation.label))
      || !text(annotation.observed) || !region(annotation.region)
      || !source.contentReview.annotations?.some((approved) => annotationKey(approved) === annotationKey(annotation))) return '补片标注缺少原文及实际图像证据';
  }
  return null;
}

export async function assertSourceFiles(scene, asset = scene.selected, story = scene.text || '', signal) {
  signal?.throwIfAborted();
  const error = sourceProvenanceError(scene, asset, story);
  if (error) throw new Error(error);
  if (!scene.motionGraphic) return;
  await Promise.all(scene.motionGraphic.sourceAssets.flatMap((base) => [[base.localPath, base.sha256], [base.decodedPath, base.decodedSha256]]).map(async ([file, expected]) => {
    signal?.throwIfAborted();
    const digest = createHash('sha256');
    try {
      const info = await stat(file);
      if (!info.isFile() || !info.size || info.size > 64 * 1024 * 1024) throw new Error('invalid source file');
      for await (const bytes of createReadStream(file, { signal })) digest.update(bytes);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('补片基础素材文件已失效，需重新获取来源素材');
    }
    if (digest.digest('hex') !== expected) throw new Error('补片基础素材与已审核文件不一致，需重新审核');
  }));
}
