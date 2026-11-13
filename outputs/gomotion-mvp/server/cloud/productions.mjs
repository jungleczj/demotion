import { createHash, randomUUID } from 'node:crypto';
import { productionEstimate } from '../production-estimate.mjs';
import voices from '../../shared/voices.json' with { type: 'json' };
import languages from '../../shared/languages.json' with { type: 'json' };
import scriptLimits from '../../shared/script-limits.json' with { type: 'json' };
import { MAX_UPLOAD_FILES, MAX_CHECKPOINT_FILES } from './checkpoint-limits.mjs';

const active = (task) => ['queued', 'running'].includes(task?.status);
const idPattern = /^[a-f0-9-]{36}$/;
const error = (message, status = 400) => Object.assign(Error(message), { status });
const filePath = (task, file) => `files/${task.id}/${file.sha256}/${file.relativePath}`;
const taskKey = (id) => `tasks/${id}.json`;
const safePath = (value) => typeof value === 'string' && value.length < 240 && /^[a-zA-Z0-9/_ .-]+$/.test(value) && !value.startsWith('/') && value.split('/').every((p) => p && p !== '..' && p !== '.');
const validateFile = (file) => {
  if (!safePath(file?.relativePath) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 512 * 1024 * 1024 || !['video/mp4', 'audio/wav', 'image/jpeg', 'image/png', 'image/webp', 'application/json', 'text/plain', 'application/octet-stream'].includes(file.contentType)) throw error('文件清单无效');
};
function validateInput(input) {
  const p = input?.project;
  if (!idPattern.test(p?.id || '') || typeof p.script !== 'string' || p.script.trim().length < scriptLimits.minCharacters || p.script.length > scriptLimits.maxCharacters || !['landscape', 'portrait'].includes(p.format) || !voices.some((v) => `gemini:${v.key}` === p.voice) || !languages.some((l) => l.code === p.language)) throw error('请提供有效脚本、声音、语言与画幅');
  // Browser-supplied file paths, AI approvals and source receipts are never
  // trusted. The remote worker plans and reviews its own media from this input.
  const project = { id: p.id, title: String(p.title || 'Untitled').slice(0, 100), script: p.script.trim(), createdAt: p.createdAt || new Date().toISOString(), voice: p.voice, voiceStyle: ['documentary', 'story', 'conversation', 'explainer', 'gentle'].includes(p.voiceStyle) ? p.voiceStyle : 'documentary', language: p.language, format: p.format, fit: 'cover', subtitles: p.subtitles !== false, topic: String(p.topic || '').slice(0, 100), scenes: [] };
  const providers = [...new Set((Array.isArray(input.providers) ? input.providers : ['pixabay', 'coverr', 'commons', 'nasa', 'archive']).filter((p) => ['pixabay', 'coverr', 'commons', 'nasa', 'archive', 'pexels'].includes(p)))];
  return { project, providers };
}

export function createCloudProductions({ store, executor, auth, callbackOrigin, now = Date.now, dailyLimit = 20, maxActive = 8 }) {
  const change = (id, fn) => store.change(taskKey(id), fn);
  const get = async (id) => (await store.read(taskKey(id)))?.value;
  const touch = (task) => { task.updatedAt = Math.max(now(), (task.updatedAt || 0) + 1); return task; };
  const view = (task) => {
    const project = structuredClone(task.project);
    if (project.exportId && task.files?.[`${project.exportId}/video.mp4`]) project.exportUrl = `/api/exports/${project.exportId}/video.mp4`;
    else delete project.exportUrl;
    if (project.narrationTrack && !task.files?.[`narration/${project.narrationTrack.key}.wav`]) delete project.narrationTrack;
    return { id: task.id, project, status: task.status, phase: task.phase, progress: task.progress, message: task.message, createdAt: task.createdAt, updatedAt: task.updatedAt, startedAt: task.startedAt, finishedAt: task.finishedAt, estimate: task.estimate, retry: task.retry || 0, retryLimit: 3 };
  };
  const indexTasks = async (owner) => {
    const index = (await store.read('index.json'))?.value;
    const ids = (index?.tasks || []).filter((t) => t.owner === owner).map((t) => t.id);
    return (await Promise.all(ids.map(get))).filter(Boolean);
  };
  async function register(task) {
    try { await store.change('index.json', async (old) => {
      const index = old || { tasks: [], admissions: {} };
      const day = new Date(now()).toISOString().slice(0, 10);
      const admission = `${task.id}-${task.attempt}`;
      if (index.admissions[admission] === day) return;
      // Admission shares the index CAS, so distinct project submissions cannot
      // both claim the last slot after reading the same earlier task count.
      const others = await Promise.all(index.tasks.filter((t) => t.owner === task.owner && t.id !== task.id).map((t) => get(t.id)));
      const reserved = others.filter((t) => active(t) && (!t.admissionPending || index.admissions[`${t.id}-${t.attempt}`]));
      if (reserved.length >= maxActive) throw error('已有多个视频制作中，请稍后提交。', 409);
      index.admissions = Object.fromEntries(Object.entries(index.admissions).filter(([, date]) => date === day));
      if (Object.keys(index.admissions).length >= dailyLimit) throw error('今天的制作名额已用完，请明天继续。', 429);
      index.admissions[admission] = day;
      index.tasks = [...index.tasks.filter((t) => t.id !== task.id), { id: task.id, owner: task.owner, createdAt: task.createdAt }].slice(-100);
      return index;
    });
      await change(task.id, (t) => {
        if (t.attempt !== task.attempt || !t.admissionPending) return;
        t.admissionPending = false; return touch(t);
      });
    } catch (failure) {
      // A rejected reservation must not remain active and bypass admission on
      // its next retry. Never alter an execution another caller already owns.
      if ([409, 429].includes(failure.status)) await change(task.id, (t) => {
        if (t.attempt !== task.attempt || !active(t) || t.execution || t.launchUntil > now()) return;
        t.status = 'error'; t.finishedAt = now(); t.message = '这次制作未能开始，脚本已保留，请稍后重试。'; return touch(t);
      });
      throw failure;
    }
  }
  async function launch(id) {
    const lease = randomUUID();
    let claimed = false;
    const task = await change(id, (t) => {
      claimed = false;
      if (!t || !active(t) || t.admissionPending || t.retiredExecutions?.length || t.execution || t.launchUntil > now() || t.cancelRequested) return;
      claimed = true; t.launchLease = lease; t.launchUntil = now() + 90_000; return touch(t);
    });
    if (!claimed) return task;
    try {
      const checkpoint = task.checkpoint ? { task: task.checkpoint, files: await Promise.all(Object.values(task.files || {}).map(async (f) => ({ ...f, url: await store.download(f.blobRef) }))) } : undefined;
      const execution = await executor.start({ task, callbackURL: `${callbackOrigin}/api/cloud-callback/${id}`, workerToken: auth.worker(task), checkpoint });
      const saved = await change(id, (current) => {
        if (current.attempt !== task.attempt || current.launchLease !== lease) return;
        current.execution = execution; current.launchUntil = 0; current.heartbeatAt = now(); return touch(current);
      });
      if (saved.attempt !== task.attempt || saved.cancelRequested || !active(saved)) await executor.stop(execution).catch(() => {});
      return saved;
    } catch {
      return change(id, (current) => {
        if (current.attempt !== task.attempt || current.launchLease !== lease || current.cancelRequested) return;
        current.launchUntil = 0; current.message = '启动制作暂未完成，正在重试'; current.launchFailures = (current.launchFailures || 0) + 1;
        if (current.launchFailures >= 3) { current.status = 'error'; current.finishedAt = now(); current.message = '制作服务暂时无法启动，脚本已保留，请稍后重试。'; }
        return touch(current);
      });
    }
  }
  async function owned(owner, id) {
    if (!idPattern.test(id)) throw error('制作任务不存在', 404);
    const task = await get(id);
    if (!task || task.owner !== owner) throw error('制作任务不存在', 404);
    return task;
  }
  async function cleanRetired(task) {
    for (const execution of task.retiredExecutions || []) {
      // Persist the reference until stop succeeds. A request may disappear
      // after the recovery CAS or after stop; either path can safely resume.
      try { await executor.stop(execution); } catch { return get(task.id); }
      const identity = JSON.stringify(execution);
      await change(task.id, (t) => {
        t.retiredExecutions = (t.retiredExecutions || []).filter((e) => JSON.stringify(e) !== identity);
        return touch(t);
      });
    }
    return get(task.id);
  }
  async function reconcile(task) {
    if (task.retiredExecutions?.length) task = await cleanRetired(task);
    if (task.retiredExecutions?.length) return task;
    if (!active(task) || task.cancelRequested) return task;
    if (!task.execution) {
      if (task.admissionPending) await register(task);
      return launch(task.id);
    }
    if (now() - (task.heartbeatAt || task.updatedAt) < 90_000 || now() - (task.inspectedAt || 0) < 15_000) return task;
    await change(task.id, (t) => { if (t.attempt !== task.attempt) return; t.inspectedAt = now(); return t; });
    const state = await executor.state?.(task.execution);
    if (!['stopped', 'exited'].includes(state) && now() - (task.heartbeatAt || task.updatedAt) < 5 * 60_000) return task;
    if (!['stopped', 'exited', 'running'].includes(state)) return task;
    let claimed = false;
    let recovered = await change(task.id, (t) => {
      claimed = false;
      if (t.attempt !== task.attempt || !active(t) || t.cancelRequested || t.heartbeatAt > task.heartbeatAt) return;
      claimed = true;
      if (state === 'running') t.retiredExecutions = [...(t.retiredExecutions || []), t.execution];
      t.recoveries = (t.recoveries || 0) + 1;
      if (t.recoveries > 3) { t.status = 'incomplete'; t.finishedAt = now(); t.message = '多次尝试仍未完成，已保留制作进度，请稍后重试。'; return touch(t); }
      t.attempt++; t.admissionPending = true; t.execution = undefined; t.launchUntil = 0; t.heartbeatAt = now(); t.status = 'queued'; t.message = '正在从已保存的进度继续制作';
      return touch(t);
    });
    // Fence the old attempt before stopping it. A heartbeat arriving while the
    // executor state is awaited must be able to invalidate this recovery.
    if (!claimed) return recovered;
    if (recovered.retiredExecutions?.length) recovered = await cleanRetired(recovered);
    if (!active(recovered) || recovered.retiredExecutions?.length) return recovered;
    await register(recovered);
    return launch(recovered.id);
  }
  return {
    async list(owner, after = 0) {
      const tasks = await indexTasks(owner);
      const current = await Promise.all(tasks.map(reconcile));
      // Per-task clocks are not a global change cursor. All records are already
      // read above; return their snapshot so equal or skewed clocks lose no state.
      return { cursor: Math.max(after, ...current.map((t) => t.updatedAt || 0)), tasks: current.map(view) };
    },
    async get(owner, id) { return view(await reconcile(await owned(owner, id))); },
    async submit(owner, raw) {
      const input = validateInput(raw);
      const count = (await indexTasks(owner)).filter(active).length;
      const hash = createHash('sha256').update(`${owner}/${input.project.id}`).digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const task = await change(id, (old) => {
        if (old && (active(old) || old.status === 'done' && old.fingerprint === fingerprint)) return;
        if (count >= maxActive) throw error('已有多个视频制作中，请稍后提交。', 409);
        const resume = old?.fingerprint === fingerprint && old?.checkpoint;
        return { id, owner, input, fingerprint, project: resume ? old.checkpoint.project : input.project, ...(resume ? { checkpoint: old.checkpoint } : {}), ...(old?.retiredExecutions?.length ? { retiredExecutions: old.retiredExecutions } : {}), attempt: (old?.attempt || 0) + 1, admissionPending: true, status: 'queued', phase: 'queued', progress: 0, message: resume ? '正在从已保存的进度继续制作' : '等待开始制作', createdAt: now(), updatedAt: Math.max(now(), (old?.updatedAt || 0) + 1), estimate: productionEstimate(input.project), files: resume ? old.files : {}, sequences: {} };
      });
      if (!active(task)) return view(task);
      await register(task);
      return view(await launch(id));
    },
    async recover(owner, raw) {
      const tasks = await indexTasks(owner);
      const task = tasks.find((t) => t.project.id === raw?.project?.id);
      return task ? view(await reconcile(task)) : null;
    },
    async cancel(owner, id) {
      await owned(owner, id);
      const task = await change(id, (t) => {
        if (!active(t)) return;
        t.cancelRequested = true; t.status = 'cancelled'; t.message = '已停止制作，草稿已保留'; t.finishedAt = now(); return touch(t);
      });
      // Persist first; a late worker callback cannot resurrect a stopped task.
      if (task.execution) await executor.stop(task.execution).catch(() => {});
      return view(task);
    },
    async callback(request, id, input) {
      const task = await get(id);
      if (!task || !auth.verifyWorker(request, task)) throw error('任务凭据无效', 401);
      if (task.cancelRequested || !active(task)) return { cancelRequested: true };
      if (input?.version !== 1 || input.taskId !== id || input.attempt !== task.attempt || !Number.isSafeInteger(input.sequence) || input.sequence < 1) throw error('任务状态格式无效');
      const { type, payload = {} } = input;
      if (type === 'heartbeat') {
        await change(id, (t) => { if (t.attempt !== task.attempt || !active(t)) return; t.heartbeatAt = now(); return t; });
        return { cancelRequested: false };
      }
      if (type === 'upload-request') {
        if (!Array.isArray(payload.files) || payload.files.length > MAX_UPLOAD_FILES) throw error('文件清单无效');
        payload.files.forEach(validateFile);
        const uploads = await Promise.all(payload.files.map(async (file) => {
          const old = task.files[file.relativePath];
          if (old?.sha256 === file.sha256) return { relativePath: file.relativePath, blobRef: old.blobRef, exists: true };
          return { relativePath: file.relativePath, ...await store.upload(filePath(task, file), file) };
        }));
        return { uploads, cancelRequested: false };
      }
      if (!['progress', 'checkpoint', 'complete', 'failed'].includes(type)) throw error('任务状态类型无效');
      const files = payload.files || [];
      if (!Array.isArray(files) || files.length > MAX_CHECKPOINT_FILES) throw error('文件清单无效');
      for (const file of files) {
        validateFile(file);
        if (file.blobRef !== filePath(task, file)) throw error('文件不属于本任务', 403);
        if (task.files[file.relativePath]?.sha256 !== file.sha256) await store.verify(file.blobRef, file);
      }
      const incoming = payload.task;
      if (incoming && (incoming.project?.id !== task.project.id || !Array.isArray(incoming.project.scenes))) throw error('制作状态不属于本项目');
      const saved = await change(id, (t) => {
        if (t.attempt !== task.attempt || !active(t) || t.cancelRequested || input.sequence <= (t.lastTaskSequence || 0)) return;
        t.lastTaskSequence = input.sequence; t.heartbeatAt = now();
        for (const file of files) t.files[file.relativePath] = file;
        if (incoming) {
          if (['checkpoint', 'complete'].includes(type)) t.project = incoming.project;
          t.phase = incoming.phase; t.progress = incoming.progress; t.message = incoming.message; t.startedAt ||= incoming.startedAt || now(); t.estimate = incoming.estimate || productionEstimate(incoming.project); t.retry = incoming.retry || 0;
          // A progress update is never allowed to advertise a file that has not
          // been durably committed and checked in this control plane.
          if (['checkpoint', 'complete'].includes(type)) t.checkpoint = incoming;
        }
        t.status = 'running';
        if (type === 'complete') {
          if (!incoming || active(incoming)) throw error('制作尚未完成', 409);
          const video = `${incoming.project.exportId}/video.mp4`;
          if (incoming.status === 'done' && (!t.files[video] || !incoming.project.videoReview?.passed || !incoming.project.sequenceReport?.complete || incoming.project.scenes.some((s) => !s.selected))) throw error('成片尚未通过完整性检查', 409);
          t.status = incoming.status; t.finishedAt = now();
        }
        if (type === 'failed') { t.status = 'error'; t.finishedAt = now(); t.failure = payload.failure; t.message = '这次制作未能完成，已保留草稿，请重试。'; }
        return touch(t);
      });
      if (!active(saved) && saved.execution) await executor.stop(saved.execution).catch(() => {});
      return { cancelRequested: Boolean(saved.cancelRequested), accepted: saved.lastTaskSequence === input.sequence };
    },
    async file(owner, id, relativePath, request) {
      const task = await owned(owner, id);
      const publicFile = /^(?:[a-f0-9-]{36}\/(?:video\.mp4|captions\.srt|sources\.json)|narration\/[a-f0-9]{64}\.wav|playback\/[a-f0-9]{64}\.(?:mp4|jpg))$/.test(relativePath || '');
      const file = publicFile && safePath(relativePath) && task.files?.[relativePath];
      if (!file) throw error('文件尚未准备好', 404);
      return request && store.serve ? store.serve(file.blobRef, request) : store.download(file.blobRef);
    },
    async media(owner, assetId, thumbnail, request) {
      for (const task of (await indexTasks(owner)).reverse()) {
        const asset = task.project.scenes.find((s) => s.selected?.id === assetId)?.selected;
        if (!asset) continue;
        const relative = asset.playbackKey ? `playback/${asset.playbackKey}.${thumbnail ? 'jpg' : 'mp4'}` : (thumbnail ? asset.thumbnailPath : asset.localPath)?.replace('/vercel/sandbox/work/', '');
        if (task.files[relative]) return this.file(owner, task.id, relative, request);
      }
      throw error('该素材尚未准备好', 404);
    },
    async narration(owner, key, request) {
      for (const task of (await indexTasks(owner)).reverse()) if (task.project.narrationTrack?.key === key && task.files[`narration/${key}.wav`]) return this.file(owner, task.id, `narration/${key}.wav`, request);
      throw error('旁白尚未准备好', 404);
    },
    async playback(owner, key, request) {
      const relative = `playback/${key}.mp4`;
      for (const task of (await indexTasks(owner)).reverse()) if (task.files[relative]) return this.file(owner, task.id, relative, request);
      throw error('视频尚未准备好', 404);
    },
    async exported(owner, exportId, name, request) {
      const task = (await indexTasks(owner)).find((t) => t.project.exportId === exportId);
      if (!task) throw error('导出文件不存在', 404);
      if (name) return this.file(owner, task.id, `${exportId}/${name}`, request);
      return { id: exportId, status: task.status === 'done' || task.files[`${exportId}/video.mp4`] ? 'done' : 'rendering', progress: task.progress, message: task.message, url: view(task).project.exportUrl, review: task.project.videoReview, duration: task.project.narrationTrack?.duration, size: task.files[`${exportId}/video.mp4`]?.size };
    },
  };
}
