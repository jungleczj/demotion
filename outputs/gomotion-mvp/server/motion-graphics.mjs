import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { mkdir, stat, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { assets, registerUpload } from './sources.mjs';
import { findSourceImagePlan } from './source-images.mjs';
import { validateMotionPlan, sourceLayout } from './motion-graphics-template.mjs';
import { outputProfile, mediaQualityError } from './media-quality.mjs';
import { ensurePlayback, verifiedAsset } from './playback.mjs';
import { run, probe } from './process.mjs';

async function fontPath() {
  const direct = '/System/Library/Fonts/PingFang.ttc';
  try { await stat(direct); return direct; } catch {}
  const root = '/System/Library/AssetsV2/com_apple_MobileAsset_Font8';
  try { for (const entry of await readdir(root)) { const file = path.join(root, entry, 'AssetData/PingFang.ttc'); try { await stat(file); return file; } catch {} } } catch {}
  return undefined;
}

async function assertMotionSourceFiles(plan, format, signal) {
  try {
    for (const source of plan.sourceAssets) {
      signal?.throwIfAborted();
      const actual = createHash('sha256').update(await readFile(source.localPath)).digest('hex');
      const decoded = createHash('sha256').update(await readFile(source.decodedPath)).digest('hex');
      if (actual !== source.sha256 || decoded !== source.decodedSha256) throw new Error('来源图片实际文件哈希不符，不能复用补片');
      const info = await probe(source.decodedPath, signal);
      if (info.width !== source.width || info.height !== source.height) throw new Error('来源图片实际尺寸不符，不能依赖元数据放大');
      if (sourceLayout(source, outputProfile(format)).scale > 1.001) throw new Error('来源图片实际清晰度不足，不能放大');
    }
  } catch (error) { if (signal?.aborted) throw signal.reason; throw error; }
}

export async function renderMotionGraphic({ file, plan, style, duration, format, signal, marker = '示意' }) {
  signal?.throwIfAborted();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error('动态图形时长无效');
  const profile = outputProfile(format);
  if (plan?.schemaVersion !== 2 || plan.type !== 'source-annotation') throw new Error('补片必须具有真实图片来源');
  const narration = typeof plan.narration === 'string' ? plan.narration : '';
  plan = validateMotionPlan(plan, { id: plan.sceneId, text: narration }, narration);
  await assertMotionSourceFiles(plan, format, signal);
  const fingerprint = createHash('sha256').update(JSON.stringify({ plan, style, duration, format, marker, version: 2 })).digest('hex');
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const saved = JSON.parse(await readFile(`${file}.source-plan.json`, 'utf8'));
    if (saved.fingerprint !== fingerprint) throw new Error('来源补片缓存不匹配');
    const info = await probe(file, signal);
    if (info.width === profile.width && info.height === profile.height && Math.abs(info.duration - duration) < .08) return info;
  } catch {}
  const fontFile = await fontPath();
  if (!fontFile && /[\u3400-\u9fff]/u.test(plan.title + plan.annotations.map((n) => n.label).join(''))) throw new Error('缺少中文图形字体，未生成无法阅读的示意');
  const partial = `${file}.partial.mp4`;
  try {
    await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./motion-graphics-worker.mjs', import.meta.url), { execArgv: [], workerData: { file: partial, plan, style, duration, profile, marker, fontFile } });
      let completed = false, failure, killTimer;
      const stop = (reason) => { failure ||= reason; worker.postMessage('abort'); killTimer ||= setTimeout(() => { void worker.terminate(); }, 2000); };
      const abort = () => stop(signal.reason || new Error('动态图形制作已取消'));
      const deadline = setTimeout(() => stop(new Error('动态图形制作超时')), 180000);
      worker.on('message', (result) => { if (result.error) failure ||= new Error(result.error); if (result.done) completed = true; });
      worker.on('error', (error) => { failure ||= error; });
      worker.on('exit', (code) => {
        clearTimeout(deadline); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
        if (failure || !completed || code !== 0) reject(failure || new Error(`动态图形进程中止（${code}）`)); else resolve();
      });
      signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    });
    const info = await probe(partial, signal);
    if (info.width !== profile.width || info.height !== profile.height || Math.abs(info.duration - duration) > .08) throw new Error('动态图形未通过实际尺寸和完整时长检查');
    const { rename } = await import('node:fs/promises');
    await rename(partial, file);
    await rename(`${partial}.png`, `${file}.png`).catch(() => {});
    await writeFile(`${file}.source-plan.json`, JSON.stringify({ fingerprint, plan }, null, 2));
    return info;
  } finally { await rm(partial, { force: true }); await rm(`${partial}.png`, { force: true }); }
}

async function filmStyle(project, folder, config, signal) {
  const style = { background: '#163341', accent: '#89c9da', text: '#f4f7f8', muted: '#bacbd1' };
  const scene = project.scenes.find((s) => s.selected && !s.motionGraphic);
  const asset = scene && assets.get(scene.selected.id);
  if (!asset) return style;
  try {
    const ready = await ensurePlayback(asset, config, false, signal);
    const file = path.join(folder, 'palette.rgb');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(scene.start || 0), '-i', ready.file, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', file], signal);
    const rgb = [...(await readFile(file)).subarray(0, 3)];
    const hex = (values) => `#${values.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
    style.background = hex(rgb.map((v) => Math.max(17, Math.min(52, v * .28))));
    style.accent = hex(rgb.map((v) => Math.min(224, 104 + v * .44)));
    await rm(file, { force: true });
  } catch (error) { if (signal?.aborted) throw error; }
  return style;
}

export function createMotionLimiter(limit) {
  let active = 0;
  const waiting = [];
  const release = () => { const next = waiting.shift(); if (next) next(release); else active--; };
  return async (operation) => {
    const done = active < limit ? (active++, release) : await new Promise((resolve) => waiting.push(resolve));
    try { return await operation(); } finally { done(); }
  };
}

export async function fillMissingWithMotion(job, project, work, config, options = {}) {
  job.events ||= [];
  const signal = job.controller.signal;
  const checkedScenes = [];
  for (const scene of project.scenes) {
    signal.throwIfAborted();
    const asset = assets.get(scene.selected?.id) || scene.selected;
    const graphic = scene.motionGraphic || scene.renderKind === 'motion-graphic' || asset?.renderKind === 'motion-graphic';
    let reason = asset && (asset.visualWatermark ? '原片有来源水印' : mediaQualityError(asset.width, asset.height, project.format, true));
    if (graphic && asset) {
      try {
        const plan = validateMotionPlan(scene.motionGraphic, scene, project.script);
        if (JSON.stringify(plan.sourceAssets) !== JSON.stringify(asset.sourceAssets) || JSON.stringify(plan.processingPlan) !== JSON.stringify(asset.processingPlan)) throw new Error('保存的来源图片与补片计划不一致');
        await assertMotionSourceFiles(plan, project.format, signal);
      } catch (error) { if (signal?.aborted) throw error; reason = error.message; }
    }
    if (!reason) { checkedScenes.push(scene); continue; }
    job.events.push({ stage: `saved-media-${scene.id}`, engine: 'media-quality', status: 'failed', detail: reason });
    checkedScenes.push({ ...scene, selected: null, motionGraphic: undefined, renderKind: undefined, preserveSelection: false, confirmed: false, visualObservation: undefined });
  }
  project = { ...project, scenes: checkedScenes };
  const missing = project.scenes.filter((scene) => !scene.selected);
  if (!missing.length) return project;
  const folder = path.join(work, `motion-${project.id}`);
  await mkdir(folder, { recursive: true });
  const style = project.motionStyle || await filmStyle(project, folder, config, signal);
  const results = new Map(), plans = [], warnings = [...(project.sequenceReport?.warnings || [])];
  const baseCalls = Number(job.calls) || 0, phaseController = new AbortController();
  const phaseSignal = AbortSignal.any([signal, phaseController.signal]);
  const budget = { calls: 0, limit: missing.length * 4, status: 'running' };
  (job.phaseBudgets ||= {}).sourceImages = budget;
  const phaseJob = { ...job, controller: { signal: phaseSignal }, callLimit: budget.limit, events: job.events };
  Object.defineProperty(phaseJob, 'calls', { get: () => budget.calls, set: (value) => { budget.calls = value; } });
  const withRenderSlot = createMotionLimiter(2);
  let cursor = 0, failure, checkpointQueue = Promise.resolve();
  const snapshot = () => {
    const scenes = project.scenes.map((s) => results.get(s.id) || s), gaps = scenes.filter((s) => !s.selected).map((s) => s.id);
    return { ...project, motionStyle: style, scenes, sequenceReport: { ...project.sequenceReport, complete: gaps.length === 0, missingScenes: gaps, summary: gaps.length ? '仍有画面未找到满足来源与内容要求的素材，已保留草稿' : '实拍与来源图片加工已覆盖全部旁白，成片继续实际视听审查', sourceBackedMotionVersion: 2, motionGraphicCount: scenes.filter((s) => s.motionGraphic?.schemaVersion === 2).length, sourceImageBudget: { ...budget }, warnings: [...new Set(warnings)], events: job.events.map((e) => ({ ...e })) } };
  };
  const processScene = async (scene) => {
    phaseSignal.throwIfAborted();
    const started = Date.now();
    const found = await findSourceImagePlan(scene, project, path.join(folder, 'source-images'), config, phaseJob, options);
    warnings.push(...found.warnings);
    if (!found.plan) {
      job.events.push({ stage: `motion-graphic-${scene.id}`, engine: 'source-image-reader', status: 'failed', detail: '未找到可追溯且可忠实加工的相关图片，保留缺口', attempted: found.attempted });
      return;
    }
    const plan = found.plan;
    const key = createHash('sha256').update(JSON.stringify({ plan, duration: scene.duration, format: project.format, style, version: 2 })).digest('hex');
    const file = path.join(folder, `${key}.mp4`);
    let asset;
    try {
      asset = await withRenderSlot(async () => {
        phaseSignal.throwIfAborted();
        const info = await renderMotionGraphic({ file, plan, style, duration: scene.duration, format: project.format, signal: phaseSignal, marker: project.language === 'zh-CN' ? '来源图片 · 标注示意' : 'Source image · annotated illustration' });
        const attribution = plan.sourceAssets.map((s) => s.attribution || `${s.author} · ${s.license} · ${s.sourceUrl}`).join('\n');
        const rendered = registerUpload({ title: plan.title, description: plan.explanation, localPath: file, thumbnailPath: `${file}.png`, width: info.width, height: info.height, duration: info.duration, kind: 'video', generated: true, renderKind: 'motion-graphic', sourceAssets: plan.sourceAssets, processingPlan: plan.processingPlan, sourcePlanVersion: 2, attribution });
        try {
          Object.assign(rendered, { url: `/api/media?id=${encodeURIComponent(rendered.id)}`, thumbnail: `/api/media?id=${encodeURIComponent(rendered.id)}&thumbnail=1`, author: plan.sourceAssets.map((s) => s.author).join('; '), license: plan.sourceAssets.map((s) => s.license).join('; '), licenseUrl: plan.sourceAssets[0].licenseUrl, sourceUrl: plan.sourceAssets[0].sourceUrl });
          await verifiedAsset(rendered, { ...config, outputFormat: project.format }, phaseSignal);
          phaseSignal.throwIfAborted();
          return rendered;
        } catch (error) { assets.delete(rendered.id); throw error; }
      });
    } catch (error) {
      if (asset) assets.delete(asset.id);
      await Promise.all([file, `${file}.png`, `${file}.source-plan.json`, ...plan.sourceAssets.flatMap((source) => [source.localPath, source.decodedPath])].map((target) => rm(target, { force: true })));
      throw error;
    }
    plans.push([scene.id, plan]);
    const observed = { assetId: asset.id, observed: plan.explanation, medium: 'source-backed annotated illustration', watermarkFree: true, sourceAssets: plan.sourceAssets, intervals: [{ start: 0, end: scene.duration, reason: plan.explanation }], uncertainties: ['来源图片标注示意，不是动作实拍；最终仍须读取实际成片画面和声音审查'] };
    results.set(scene.id, { ...scene, selected: asset, candidates: [asset], start: 0, trimEnd: scene.duration, confirmed: false, preserveSelection: true, visualObservation: observed, motionGraphic: plan, renderKind: 'motion-graphic', transitionType: 'dissolve', transitionDuration: .2, status: 'done' });
    job.events.push({ stage: `motion-graphic-${scene.id}`, engine: 'source-backed-motion-renderer', status: 'completed', durationMs: Date.now() - started, inputType: 'actual-source-image-and-validated-annotation', mediaCount: plan.sourceAssets.length });
    if (job.onCheckpoint) {
      const partial = snapshot();
      checkpointQueue = checkpointQueue.then(() => job.onCheckpoint({ scenes: partial.scenes, scenePlan: partial.scenes, narrationTrack: partial.narrationTrack, report: partial.sequenceReport }));
      await checkpointQueue;
    }
  };
  const worker = async () => {
    while (cursor < missing.length && !failure) {
      const scene = missing[cursor++];
      try { await processScene(scene); }
      catch (error) { failure ||= error; phaseController.abort(failure); throw error; }
    }
  };
  try {
    // Four scenes acquire/review images concurrently; at most two encode at once.
    await Promise.allSettled(Array.from({ length: Math.min(4, missing.length) }, worker));
    budget.status = failure ? 'failed' : 'completed';
    await checkpointQueue.catch(() => {});
    await writeFile(path.join(folder, 'plans.json'), JSON.stringify({ schemaVersion: 2, style, plans, warnings, sourceImageBudget: budget }, null, 2));
    if (failure) { failure.partialProject = snapshot(); throw failure; }
    return snapshot();
  } finally { job.calls = baseCalls + budget.calls; }
}
