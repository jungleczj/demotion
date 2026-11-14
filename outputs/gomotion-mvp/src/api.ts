export async function api<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `请求失败 (${response.status})`);
  return result;
}
export function downloadJSON(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
import type { AnalysisJob, MusicCatalog, MusicUpload, Project, Provider, Scene, SequenceResult, VideoReview } from './types';

export const MUSIC_UPLOAD_MAX_BYTES = 3_000_000;
export const MUSIC_UPLOAD_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
export const musicCatalog = (signal?: AbortSignal) => api<MusicCatalog>('/api/music/catalog', undefined, signal);

export async function uploadMusic(file: File, signal?: AbortSignal, limits = { maxBytes: MUSIC_UPLOAD_MAX_BYTES, acceptedExtensions: MUSIC_UPLOAD_EXTENSIONS }): Promise<MusicUpload> {
  if (!file.size) throw new Error('请选择一个有内容的音频文件。');
  if (file.size > limits.maxBytes) throw new Error(`音频不能超过 ${(limits.maxBytes / 1_000_000).toLocaleString()} MB。`);
  if (!limits.acceptedExtensions.includes(file.name.split('.').pop()?.toLowerCase() || '')) throw new Error(`请选择 ${limits.acceptedExtensions.map((extension) => extension.toUpperCase()).join('、')} 音频。`);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => { cleanup(); resolve(String(reader.result).split(',')[1] || ''); };
    reader.onerror = () => { cleanup(); reject(new Error('无法读取这个音频文件，请重新选择。')); };
    reader.onabort = () => { cleanup(); reject(new DOMException('已取消上传', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { cleanup(); reject(new DOMException('已取消上传', 'AbortError')); return; }
    reader.readAsDataURL(file);
  });
  return api<MusicUpload>('/api/music/upload', { name: file.name, data }, signal);
}


export class AnalysisError extends Error {
  constructor(public job: AnalysisJob) { super(job.error || job.message || '视觉 AI 未完成'); }
}

async function runAnalysis(endpoint: string, input: unknown, signal?: AbortSignal, onProgress?: (job: AnalysisJob) => void): Promise<AnalysisJob> {
  signal?.throwIfAborted();
  // Receive the job ID even if the user cancels during this short POST, so that
  // the accepted server job can always be cancelled rather than left running.
  const start = await api<{ id: string }>(endpoint, input, AbortSignal.timeout(15000));
  const cancel = () => { void fetch(`/api/analysis/${start.id}`, { method: 'DELETE' }).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); throw new DOMException('已取消', 'AbortError'); }
    while (true) {
      const job = await api<AnalysisJob>(`/api/analysis/${start.id}`, undefined, signal);
      onProgress?.(job);
      if (job.status === 'done' || job.status === 'incomplete') return job;
      if (job.status === 'error' || job.status === 'cancelled') throw new AnalysisError(job);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1500);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
  } finally { signal?.removeEventListener('abort', cancel); }
}

export async function analyzeProject(project: Project, signal?: AbortSignal, onProgress?: (job: AnalysisJob) => void, providers?: Provider[]): Promise<SequenceResult> {
  const job = await runAnalysis('/api/analysis', { project, providers }, signal, onProgress);
  if (!job.result) throw new AnalysisError(job);
  return job.result;
}

export async function reviewVideo(exportId: string, signal?: AbortSignal, onProgress?: (job: AnalysisJob) => void): Promise<VideoReview> {
  const job = await runAnalysis('/api/review', { exportId }, signal, onProgress);
  if (!job.review) throw new AnalysisError(job);
  return job.review;
}

// Recovery may replace one long scene with several new IDs. Apply its full plan.
export function sequenceScenes(project: Project, result: SequenceResult): Scene[] {
  const patches = new Map(result.scenes.map((scene) => [scene.id, scene]));
  return (result.scenePlan || project.scenes).map((scene, index) => ({
    ...scene, ...patches.get(scene.id), index, status: 'done',
  }));
}

export function coverageNotice(project: Project): string {
  const missing = project.scenes.filter((s) => !s.selected).length;
  const report = project.sequenceReport;
  const reason = report?.stopReason === 'quota' ? '服务额度暂不可用，补找已暂停。' : report?.stopReason === 'connection' ? '服务连接暂不可用，补找已暂停。' : report ? `已自动重试 ${report.retries || 0} 轮，` : '';
  return `${reason}仍有 ${missing} 个画面未找到。草稿已保留，可连续预览已有画面。`;
}
