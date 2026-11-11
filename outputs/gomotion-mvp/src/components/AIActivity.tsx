import type { AIEvent, AnalysisJob, Project } from '../types';

const statusLabel: Record<string, string> = { completed: '完成', running: '进行中', failed: '失败', skipped: '跳过', fallback: '已回退', pending: '等待' };
function Events({ events }: { events: AIEvent[] }) {
  return <ol className="ai-events">{events.map((event, i) => <li key={`${event.stage}-${i}`}><span className={`ai-event-status ${event.status}`}>{statusLabel[event.status] || event.status}</span><div><strong>{event.stage}</strong><small>{event.engine}{event.model ? ` · ${event.model}` : ''}{event.inputType ? ` · ${event.inputType}` : ''}{event.mediaCount ? ` · ${event.mediaCount} 项媒体` : ''}{event.durationMs ? ` · ${(event.durationMs / 1000).toFixed(1)}s` : ''}</small>{event.detail && <p>{event.detail}</p>}</div></li>)}</ol>;
}

export default function AIActivity({ project, job }: { project: Project; job: AnalysisJob | null }) {
  const report = project.sequenceReport;
  const catalogEvents: AIEvent[] = project.scenes.flatMap((scene, i) => scene.searchMethod ? [{ stage: `catalog-scene-${i + 1}`, engine: scene.searchMethod === 'ai-metadata' ? 'text-ai' : scene.searchMethod === 'semantic-query-api' ? 'stock-api' : 'metadata-rules', status: ['ai-metadata', 'semantic-query-api'].includes(scene.searchMethod) ? 'completed' : 'fallback', inputType: 'catalog-text', detail: '目录初筛；此步骤没有读取画面' }] : []);
  const currentEvents = job?.events || report?.events || [];
  const key = (event: AIEvent) => `${event.stage}:${event.at || ''}:${event.durationMs || ''}:${event.status}`;
  const currentKeys = new Set(currentEvents.map(key));
  const historyEvents = (project.aiTrace || []).filter((event) => !currentKeys.has(key(event)));
  const events = [...catalogEvents, ...currentEvents];
  return <div className="ai-activity">
    {job?.status === 'running' && <div className="ai-job-progress" role="status"><span>{job.message}</span><strong>{job.progress}%</strong><progress value={job.progress} max="100"/></div>}
    {project.visualError && job?.status !== 'running' && <p role="alert" className="ai-job-error">视觉内容审核未完成：{project.visualError}。目录候选不能视为已匹配旁白。</p>}
    {job?.status === 'error' && <p role="alert" className="ai-job-error">{job.error} · 原项目未被覆盖</p>}
    {report?.summary && <p className="ai-edit-summary">{report.summary}</p>}
    {!!report?.warnings.length && <details><summary>{report.warnings.length} 项需要复核</summary><ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    {!!events.length && <details className="ai-trace"><summary>查看本次选材执行记录{report?.usage ? ` · ${report.usage.totalTokens.toLocaleString()} tokens` : ''}</summary><Events events={events}/></details>}
    {!!historyEvents.length && <details className="ai-trace"><summary>脚本规划与历史尝试记录（包含此前失败）</summary><Events events={historyEvents}/></details>}
  </div>;
}
