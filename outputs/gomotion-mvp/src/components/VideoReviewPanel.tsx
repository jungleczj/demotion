import { useEffect, useRef, useState } from 'react';
import { Eye, LoaderCircle } from 'lucide-react';
import { reviewVideo } from '../api';
import type { VideoReview } from '../types';
import { time } from '../types';

type Props = { exportId: string; initial?: VideoReview; onResult: (review: VideoReview) => void; onScene: (index: number) => void };
export default function VideoReviewPanel({ exportId, initial, onResult, onScene }: Props) {
  const [review, setReview] = useState(initial);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { setReview(initial); }, [initial]);
  async function start() {
    const abort = new AbortController(); controller.current = abort;
    setRunning(true); setError(''); setMessage('准备成片画面和实际配音…');
    try {
      const result = await reviewVideo(exportId, abort.signal, (job) => setMessage(`${job.message} · ${job.progress}%`));
      if (!abort.signal.aborted) { setReview(result); onResult(result); }
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { setRunning(false); }
  }
  return <section className="video-review-panel" aria-label="成片 AI 画面与声音审查"><button className="secondary" disabled={running} onClick={start}>{running ? <LoaderCircle className="spin" size={15}/> : <Eye size={15}/>} {review ? '重新运行 AI 审片' : 'AI 检查实际成片'}</button>
    {running && <><p role="status">{message}</p><button className="text-button" onClick={() => controller.current?.abort()}>取消审片</button></>}
    {error && <p className="ai-job-error" role="alert">{error}</p>}
    {review && <><strong>{review.passed ? '画面与声音检查通过' : '未通过成片质量要求'}</strong><p>{review.summary}</p><small>{review.model} · 已检查前 {review.analyzedUntil.toFixed(1)} 秒 / 共 {review.totalDuration.toFixed(1)} 秒</small><ol>{review.issues.map((issue, i) => <li key={i}><button className="text-button" onClick={() => onScene(issue.sceneIndex - 1)}>{time(issue.time)} · 镜头 {issue.sceneIndex}</button><strong>{issue.description}</strong><p>{issue.suggestion}</p></li>)}</ol>{review.limitations.map((note, i) => <small key={i}>{note}</small>)}</>}
  </section>;
}
