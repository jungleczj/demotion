import { useEffect, useState } from 'react';
import { ProductionTask, time } from '../types';

type Props = { task?: ProductionTask; duration: number; count: number; startedAt?: number };
export default function ProductionTiming({ task, duration, count, startedAt }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const video = task?.estimate.videoSeconds || Math.max(1, duration);
  const range = task?.estimate || { minSeconds: Math.max(60, Math.ceil((count * 8 + video * 1.5) / 60) * 60), maxSeconds: Math.max(120, Math.ceil((60 + count * 15 + video * 3) / 60) * 60) };
  const start = task?.startedAt || startedAt || task?.createdAt;
  const elapsed = start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const queued = task?.status === 'queued';
  return <span className="production-timing" title="制作时间为估算区间，会受素材匹配、网络和服务响应影响。">
    <span>成片约 {time(video)}</span><span>{queued ? '开始后预计' : task ? '预计制作' : '预计合成'} {Math.ceil(range.minSeconds / 60)}–{Math.ceil(range.maxSeconds / 60)} 分钟</span>
    {start && <span>{queued ? '已等待' : '已用'} {time(elapsed)}</span>}
    {!queued && elapsed > range.maxSeconds && <span>耗时超出预估，仍在制作</span>}
  </span>;
}
