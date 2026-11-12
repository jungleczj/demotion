import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { assets, trackSelection } from './sources.mjs';
import { ensurePlayback } from './playback.mjs';
import { TTS_MODEL } from './narration.mjs';
import { contentCrop } from './framing.mjs';
import { prepareNarrationTimeline } from './narration-timeline.mjs';
import { reviewExport } from './visual-review.mjs';
import { randomUUID } from 'node:crypto';
import { mediaQualityError, outputProfile } from './media-quality.mjs';
import { assertSourceFiles } from './source-provenance.mjs';
import { makeAss, captionFilter } from './captions.mjs';
import captionStyle from '../shared/caption-style.json' with { type: 'json' };
import { addBackgroundMusic, prepareBackgroundMusic } from './background-music.mjs';

export { run, probe } from './process.mjs';
import { run, probe } from './process.mjs';

function srtTime(seconds) { return new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23).replace('.', ','); }

export async function renderProject(job, project, directory, config = {}) {
  const started = performance.now();
  const timings = job.renderTimings = { narrationMs: 0, prepareInputsMs: 0, encodeMs: 0, assembleMs: 0, reviewMs: 0, totalMs: 0 };
  let currentPhase, phaseStart;
  const enterPhase = (next) => {
    const now = performance.now();
    if (currentPhase) timings[currentPhase] += now - phaseStart;
    currentPhase = next; phaseStart = now;
  };
  const signal = job.controller.signal;
  const folder = path.join(directory, job.id);
  await mkdir(folder, { recursive: true });
  const profile = { ...outputProfile(project.format), captionStyleVersion: captionStyle.version, audioMixVersion: 1 };
  const { width, height } = profile;
  config = { ...config, outputFormat: project.format };
  let total = 0;
  const manifest = [];
  const encodeTasks = [];
  const musicController = new AbortController();
  let musicPreparation;
  try {
    await Promise.all(project.scenes.map((scene) => assertSourceFiles(scene, assets.get(scene.selected?.id) || scene.selected, project.script, signal)));
    musicPreparation = prepareBackgroundMusic(path.join(directory, 'music-sources'), { signal: AbortSignal.any([signal, musicController.signal]), enabled: config.backgroundMusic !== false });
    enterPhase('narrationMs');
    const narrated = await prepareNarrationTimeline(project, config, job, folder);
    project = { ...project, scenes: narrated.scenes };
    enterPhase('prepareInputsMs');
    const preparedInputs = new Array(project.scenes.length), preparations = new Map();
    const preparationController = new AbortController();
    const preparationSignal = AbortSignal.any([signal, preparationController.signal]);
    let prepareCursor = 0, preparedCount = 0, preparationError;
    const prepareWorker = async () => {
      try {
        while (prepareCursor < project.scenes.length) {
          preparationSignal.throwIfAborted();
          const index = prepareCursor++, scene = project.scenes[index], asset = assets.get(scene.selected?.id);
          if (!asset) throw new Error(`镜头 ${index + 1} 的素材已失效，请重新搜索或上传`);
          if (asset.kind !== 'video') throw new Error(`镜头 ${index + 1} 必须使用可播放的动态视频，不能用静图填充`);
          if (!preparations.has(asset.id)) preparations.set(asset.id, (async () => {
            await trackSelection(asset, project.id, config, preparationSignal);
            preparationSignal.throwIfAborted();
            return ensurePlayback(asset, config, false, preparationSignal);
          })());
          const ready = await preparations.get(asset.id);
          const qualityError = mediaQualityError(ready.width, ready.height, project.format);
          if (qualityError) throw new Error(`镜头 ${index + 1}：${qualityError}`);
          preparedInputs[index] = { asset, input: ready.file, inputInfo: ready };
          preparedCount++; job.message = `准备镜头 ${preparedCount} / ${project.scenes.length}`;
          job.progress = 3 + Math.round(preparedCount / project.scenes.length * 7);
        }
      } catch (error) {
        if (!preparationSignal.aborted) { preparationError = error; preparationController.abort(error); }
        throw error;
      }
    };
    const preparationResults = await Promise.allSettled(Array.from({ length: Math.min(4, project.scenes.length) }, prepareWorker));
    const preparationFailure = preparationResults.find((result) => result.status === 'rejected');
    if (preparationFailure) throw preparationError || preparationFailure.reason;
    for (let index = 0; index < project.scenes.length; index++) {
      signal.throwIfAborted();
      const scene = project.scenes[index];
      const { asset, input, inputInfo } = preparedInputs[index];
      const prefix = path.join(folder, `scene-${index}`);
      const duration = scene.duration;
      const nextScene = project.scenes[index + 1];
      const outgoingFade = nextScene?.transitionType === 'dissolve' ? Math.round(Math.min(.3, Math.max(.15, Number(nextScene.transitionDuration) || .2)) * 30) / 30 : 0;
      const videoDuration = duration + outgoingFade;
      let start = Math.max(0, Math.min(Number(scene.start) || 0, Math.max(0, inputInfo.duration - .1)));
      const previous = manifest.at(-1);
      if (!scene.confirmed && !Number.isFinite(scene.trimEnd) && previous?.source.id === asset.id && Number(scene.start) > 0) {
        start = previous.sourceStart + previous.end - previous.start;
      }
      if (asset.kind === 'video' && inputInfo.duration && inputInfo.duration - start + .15 < duration) {
        throw new Error(`镜头 ${index + 1} 的素材仅剩 ${Math.max(0, inputInfo.duration - start).toFixed(1)} 秒，旁白需要 ${duration.toFixed(1)} 秒。请换更长的素材或调整起点；已停止导出，避免从头循环。`);
      }
      if (asset.kind === 'video' && Number.isFinite(scene.trimEnd) && start + duration > scene.trimEnd + .15) throw new Error(`镜头 ${index + 1} 的旁白超出了 AI 审核过的片段，请重新运行视觉选材或手动调整起点`);
      let scale = project.fit === 'contain'
        ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x101828`
        : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      encodeTasks.push(async () => {
        const crop = project.fit === 'cover' ? await contentCrop(input, inputInfo, start, duration, signal) : '';
        // Gentle retiming provides the dissolve handle entirely inside the approved shot.
        const filters = `setpts=${(videoDuration / duration).toFixed(8)}*(PTS-STARTPTS),${crop}${scale},setsar=1,fps=30,format=yuv420p`;
        const args = ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_threads', '1', '-ss', String(start), '-t', duration.toFixed(6), '-i', input];
        args.push('-map', '0:v:0', '-an', '-vf', filters, '-t', videoDuration.toFixed(6), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-threads', '2', '-movflags', '+faststart', `${prefix}.mp4`);
        await run('ffmpeg', args, signal);
      });
      manifest.push({ id: scene.id, text: scene.text, start: total, end: total + duration, renderKind: scene.motionGraphic ? 'motion-graphic' : 'footage', motionGraphic: scene.motionGraphic, source: { id: asset.id, title: asset.title, provider: asset.provider, kind: asset.kind, url: asset.sourceUrl, author: asset.author, license: asset.license, licenseUrl: asset.licenseUrl, renderKind: asset.renderKind, generated: asset.generated, sourceAssets: asset.sourceAssets, processingPlan: asset.processingPlan }, sourceStart: start, voice: project.voice, narrationModel: TTS_MODEL, narrationTrackKey: narrated.track.key, incomingTransition: scene.transitionType || 'cut', outgoingFade });
      total += duration;
    }
    let cursor = 0, completed = 0;
    const encodeWorker = async () => {
      while (cursor < encodeTasks.length) {
        signal.throwIfAborted();
        await encodeTasks[cursor++]();
        completed++; job.progress = 10 + Math.round(completed / encodeTasks.length * 80);
      }
    };
    enterPhase('encodeMs');
    const encoded = await Promise.allSettled(Array.from({ length: Math.min(4, encodeTasks.length) }, encodeWorker));
    const encodeFailure = encoded.find((r) => r.status === 'rejected');
    if (encodeFailure) throw encodeFailure.reason;
    job.progress = 93; job.message = '合成 MP4 与素材来源清单';
    enterPhase('assembleMs');
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1'];
    project.scenes.forEach((_, index) => args.push('-threads', '1', '-i', path.join(folder, `scene-${index}.mp4`)));
    args.push('-i', narrated.file);
    const graph = [];
    manifest.forEach((s, i) => {
      graph.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`);
    });
    let last = 'v0';
    for (let i = 1; i < manifest.length; i++) {
      const fade = manifest[i - 1].outgoingFade;
      const output = `join${i}`;
      graph.push(fade > 0 ? `[${last}][v${i}]xfade=transition=fade:duration=${fade.toFixed(6)}:offset=${manifest[i].start.toFixed(6)}[${output}raw]` : `[${last}][v${i}]concat=n=2:v=1:a=0[${output}raw]`);
      graph.push(`[${output}raw]fps=30,settb=AVTB,setpts=PTS-STARTPTS[${output}]`);
      last = output;
    }
    graph.push(`[${manifest.length}:a]apad,atrim=duration=${total.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);
    const captions = path.join(folder, 'captions.ass');
    const ass = makeAss('', 0, width, height) + manifest.map((s) => { const item = makeAss(s.text, s.end - s.start, width, height, s.start); return item.slice(item.indexOf('Dialogue:')); }).join('\n');
    await writeFile(captions, ass);
    if (project.subtitles) { graph.push(`[${last}]${await captionFilter(captions)}[vout]`); last = 'vout'; }
    args.push('-filter_complex', graph.join(';'), '-map', `[${last}]`, '-map', '[aout]', '-t', total.toFixed(6), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(folder, 'video.mp4'));
    await run('ffmpeg', args, signal);
    job.message = '为整片配入连续背景音乐';
    const music = await addBackgroundMusic(path.join(folder, 'video.mp4'), path.join(directory, 'music-sources'), { duration: total, signal, enabled: config.backgroundMusic !== false, preparation: musicPreparation });
    job.music = music;
    const rendered = await probe(path.join(folder, 'video.mp4'), signal);
    if (!rendered.hasAudio || Math.abs(rendered.duration - total) > .15) throw new Error('成片音轨或时长未通过完整覆盖检查，已停止输出');
    await writeFile(path.join(folder, 'captions.srt'), manifest.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n'));
    await writeFile(path.join(folder, 'sources.json'), JSON.stringify({ title: project.title, script: project.script, duration: total, width, height, captionStyleVersion: captionStyle.version, videoProfile: profile, music, createdAt: new Date().toISOString(), scenes: manifest }, null, 2));
    await Promise.all(project.scenes.map((_, index) => rm(path.join(folder, `scene-${index}.mp4`), { force: true })));
    await rm(captions, { force: true });
    job.message = 'AI 正在审查整片画面、转场和真实配音'; job.progress = 96;
    const audit = { id: randomUUID(), controller: job.controller, events: [], bytes: 0, mediaIndex: 0 };
    enterPhase('reviewMs');
    await reviewExport(audit, job.id, directory, config);
    enterPhase(undefined);
    if (signal.aborted) throw new Error('导出已取消');
    job.events = [...(job.events || []), ...audit.events];
    job.review = audit.review; job.reviewError = audit.error; job.videoProfile = profile;
    job.status = 'done'; job.progress = 100; job.message = audit.review?.passed ? '画面与声音审查通过，请试听完整成片' : '成片草稿尚未通过质量要求，请查看审片结果'; job.duration = total;
    if (music.status === 'unavailable') job.message += '；背景音乐未加入，已保留完整旁白';
    job.url = `/api/exports/${job.id}/video.mp4`;
    job.size = (await stat(path.join(folder, 'video.mp4'))).size;
  } catch (error) {
    job.status = signal.aborted ? 'cancelled' : 'error';
    job.error = signal.aborted ? '导出已取消' : error.message;
    await rm(folder, { recursive: true, force: true });
  } finally {
    musicController.abort();
    await musicPreparation;
    enterPhase(undefined);
    timings.totalMs = performance.now() - started;
  }
}
