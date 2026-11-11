import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ProductionTask, Project, Provider, productionActive } from '../types';

type Options = { onUpdate: (task: ProductionTask) => void; onFinished: (task: ProductionTask) => void };
export default function useProductionTasks(options: Options) {
  const callbacks = useRef(options); callbacks.current = options;
  const tasksRef = useRef<Record<string, ProductionTask>>({});
  const [tasks, setTasks] = useState<Record<string, ProductionTask>>({});
  const [connectionLost, setConnectionLost] = useState(false);
  function accept(incoming: ProductionTask[]) {
    const next = { ...tasksRef.current };
    for (const task of incoming.sort((a, b) => a.createdAt - b.createdAt)) {
      const old = next[task.project.id];
      if (old && (old.createdAt > task.createdAt || old.id === task.id && old.updatedAt >= task.updatedAt)) continue;
      next[task.project.id] = task;
      callbacks.current.onUpdate(task);
      if (old?.id === task.id && productionActive(old) && !productionActive(task)) callbacks.current.onFinished(task);
    }
    tasksRef.current = next; setTasks(next);
  }
  useEffect(() => {
    let stopped = false, cursor = 0;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<{cursor: number; tasks: ProductionTask[]}>(`/api/productions?after=${cursor}`, undefined, AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]));
        if (stopped) return;
        accept(result.tasks); cursor = result.cursor; setConnectionLost(false);
      } catch { if (!stopped) setConnectionLost(true); }
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    // Disconnecting the UI only stops polling. It never deletes a production task.
    return () => { stopped = true; clearTimeout(timer); abort.abort(); };
  }, []);
  async function submit(project: Project, providers: Provider[]) {
    const task = await api<ProductionTask>('/api/productions', { project, providers }, AbortSignal.timeout(20000));
    accept([task]); return task;
  }
  async function recover(project: Project, providers: Provider[]) {
    const task = await api<ProductionTask | null>('/api/productions/recover', { project, providers });
    if (task) accept([task]);
  }
  async function cancel(id: string) {
    const response = await fetch(`/api/productions/${id}`, { method: 'DELETE' });
    const task = await response.json();
    if (!response.ok) throw new Error(task.error || '停止任务未完成，请重试');
    accept([task as ProductionTask]);
  }
  return { tasks, submit, recover, cancel, connectionLost };
}
