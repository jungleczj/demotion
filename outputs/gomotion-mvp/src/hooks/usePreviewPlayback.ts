import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { api } from '../api';
import { userMessage } from '../userMessage';
import type { NarrationTrack, Project, Scene } from '../types';

type Mode = 'scene' | 'film' | 'available';
type Slot = 0 | 1;
type PreviewSlot = { index: number; scene: Scene } | null;
type Options = {
  project: Project; active: number; elapsed: number; voiceEnabled: boolean;
  video: RefObject<HTMLVideoElement | null>;
  setActive: (index: number) => void; setElapsed: (seconds: number) => void;
  onError: (message: string) => void; onPrepared: (project: Project) => void;
};

export const sceneOffset = (project: Project, index: number) => project.scenes.slice(0, index).reduce((sum, scene) => sum + scene.duration, 0);
export function sceneAt(project: Project, seconds: number) {
  let end = 0;
  return project.scenes.findIndex((scene, index) => { end += scene.duration; return seconds < end || index === project.scenes.length - 1; });
}
export const nextVideoScene = (project: Project, index: number) => project.scenes.findIndex((scene, i) => i > index && scene.selected?.kind === 'video');
export function validNarration(project: Project) {
  const track = project.narrationTrack;
  return track && track.processingVersion === 2 && track.voice === project.voice && track.style === (project.voiceStyle || 'documentary')
    && (track.language || 'auto') === (project.language || 'auto') && track.scenes.length === project.scenes.length
    && track.scenes.every((scene, i) => scene.id === project.scenes[i].id && scene.text === project.scenes[i].text) ? track : null;
}

function draftNarration(project: Project, mode: Mode) {
  const complete = validNarration(project);
  if (complete || mode !== 'available') return complete;
  const track = project.narrationTrack;
  if (!track || track.processingVersion !== 2 || track.voice !== project.voice || track.style !== (project.voiceStyle || 'documentary')
    || (track.language || 'auto') !== (project.language || 'auto')) return null;
  const compact = (text: string) => text.replace(/\s+/gu, '');
  if (compact(track.scenes.map((scene) => scene.text).join('')) !== compact(project.scenes.map((scene) => scene.text).join(''))) return null;
  const spans = new Map(track.scenes.map((scene) => [scene.id, scene]));
  const selected = project.scenes.flatMap((scene, index) => {
    if (scene.selected?.kind !== 'video') return [];
    const span = spans.get(scene.id);
    return [{ index, span: span && span.text === scene.text && Number.isFinite(span.start) && span.start >= 0
      && Math.abs(span.end - span.start - scene.duration) < .025 && span.end <= track.duration + .3 ? span : null }];
  });
  if (selected.some(({ span }) => !span)) return null;
  const byIndex = new Map(selected.map(({ index, span }) => [index, span!]));
  return { ...track, scenes: project.scenes.map((scene, index) => byIndex.get(index) || { id: scene.id, text: scene.text, start: NaN, end: NaN }) };
}

function waitUntil(ready: () => boolean, signal: AbortSignal, timeout = 30000) {
  return new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + timeout;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: unknown) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(); };
    const cancel = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'));
    const check = () => {
      if (signal.aborted) { cancel(); return; }
      try {
        if (ready()) { finish(); return; }
        if (performance.now() >= deadline) throw new Error('视频加载或定位超时，请重试');
        timer = setTimeout(check, 20);
      } catch (error) { finish(error); }
    };
    signal.addEventListener('abort', cancel, { once: true }); check();
  });
}

// A loaded URL is not a decoded frame. Keep the outgoing slot visible until
// seek has completed and the incoming video has submitted its target frame.
export async function decodedVideoFrame(video: HTMLVideoElement, target: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (Math.abs(video.currentTime - target) > .025) video.currentTime = target;
  await waitUntil(() => {
    if (video.error) throw new Error('视频解码或加载失败，请更换素材');
    return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < .15;
  }, signal, 10000);
  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise<void>((resolve, reject) => {
      let callback = 0, settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); signal.removeEventListener('abort', cancel);
        video.cancelVideoFrameCallback(callback); video.pause();
        error ? reject(error) : resolve();
      };
      const cancel = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('视频首帧解码超时，请重试')), 10000);
      signal.addEventListener('abort', cancel, { once: true });
      callback = video.requestVideoFrameCallback(() => finish());
      // Both draft slots stay muted. Playing the hidden slot makes a decoded
      // frame available even on engines that do not present paused seek frames.
      void video.play().catch(finish);
      if (signal.aborted) cancel();
    });
  } else {
    // Older browsers expose loadeddata/seeked, but no compositor callback.
    await new Promise<void>((resolve, reject) => {
      let first = 0, second = 0;
      const cancel = () => { cancelAnimationFrame(first); cancelAnimationFrame(second); reject(signal.reason); };
      signal.addEventListener('abort', cancel, { once: true });
      first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { signal.removeEventListener('abort', cancel); resolve(); }); });
      if (signal.aborted) cancel();
    });
  }
  signal.throwIfAborted();
  if (video.error || video.readyState < 2 || video.seeking) throw new Error('视频首帧无法解码，请更换素材');
}

export default function usePreviewPlayback(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState('');
  const [slots, setSlots] = useState<[PreviewSlot, PreviewSlot]>([null, null]);
  const [visibleSlot, setVisibleSlot] = useState<Slot | null>(null);
  const firstVideo = useRef<HTMLVideoElement>(null);
  const secondVideo = useRef<HTMLVideoElement>(null);
  const draftVideos = [firstVideo, secondVideo] as const;
  const assigned = useRef<[PreviewSlot, PreviewSlot]>([null, null]);
  const visible = useRef<Slot | null>(null);
  const context = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const request = useRef<AbortController | null>(null);
  const idleRequest = useRef<AbortController | null>(null);
  const frame = useRef(0);
  const busy = useRef(false);
  const position = useRef(options.elapsed);
  const renderedElement = useRef<HTMLVideoElement | null>(null);
  const clock = useRef<(() => number) | null>(null);
  const audioReady = useRef<Promise<void>>(Promise.resolve());

  function updatePosition(seconds: number) { position.current = seconds; latest.current.setElapsed(seconds); }
  function release() {
    request.current?.abort(); request.current = null;
    idleRequest.current?.abort(); idleRequest.current = null;
    cancelAnimationFrame(frame.current);
    try { source.current?.stop(); } catch {}
    source.current?.disconnect(); source.current = null;
    renderedElement.current?.pause(); latest.current.video.current?.pause();
    draftVideos.forEach((ref) => ref.current?.pause());
    clock.current = null; busy.current = false;
  }
  function stop() {
    if (busy.current) {
      const movie = renderedElement.current;
      if (latest.current.project.exportUrl && movie) updatePosition(movie.currentTime);
      else if (clock.current) updatePosition(Math.min(clock.current(), latest.current.project.scenes.reduce((sum, scene) => sum + scene.duration, 0)));
    }
    release(); setPlaying(false); setPreparing(false);
  }
  function show(slot: Slot, index: number) {
    const previous = visible.current;
    visible.current = slot; setVisibleSlot(slot); latest.current.setActive(index);
    // Mutating opacity in the same task avoids exposing the old element while
    // React commits the highlighted scene and caption. Neither element unmounts.
    draftVideos.forEach((ref, i) => { if (ref.current) ref.current.style.opacity = i === slot ? '1' : '0'; });
    if (previous !== null && previous !== slot) draftVideos[previous].current?.pause();
  }
  async function loadSlot(slot: Slot, project: Project, index: number, local: number, signal: AbortSignal) {
    const scene = project.scenes[index];
    const entry = { index, scene };
    assigned.current[slot] = entry;
    setSlots((current) => { const next = [...current] as [PreviewSlot, PreviewSlot]; next[slot] = entry; return next; });
    await waitUntil(() => {
      const element = draftVideos[slot].current;
      if (!element || element.dataset.assetId !== scene.selected?.id) return false;
      if (element.dataset.playbackError) throw new Error('视频解码或加载失败，请更换素材');
      if (element.dataset.loadedAssetId !== scene.selected?.id) return false;
      if (element.error) throw new Error('视频解码或加载失败，请更换素材');
      return element.readyState >= 2 && element.videoWidth > 0 && Number.isFinite(element.duration);
    }, signal);
    const element = draftVideos[slot].current!;
    const available = Math.max(0, element.duration - scene.start);
    if (available < .1) throw new Error('镜头起点超出视频长度，请调整素材起点');
    await decodedVideoFrame(element, scene.start + Math.min(local, Math.max(0, available - .05)), signal);
    return { element, available, slot, index };
  }
  function fail(error: unknown, abort: AbortController) {
    if (abort.signal.aborted) return;
    stop();
    const detail = error as Error;
    const text = detail.name === 'NotAllowedError' ? '浏览器拦截了播放，请再点击播放按钮。' : userMessage(detail.message);
    setMessage(text); latest.current.onError(text);
  }

  function seekTo(seconds: number) {
    stop();
    const { project } = latest.current;
    const total = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const target = Math.max(0, Math.min(seconds, total));
    const index = sceneAt(project, target);
    updatePosition(target); if (index >= 0) latest.current.setActive(index);
    if (project.exportUrl) {
      if (latest.current.video.current?.readyState) latest.current.video.current.currentTime = target;
    } else if (index >= 0) void displayPaused(project, index, target - sceneOffset(project, index));
  }
  async function displayPaused(project: Project, index: number, local: number) {
    idleRequest.current?.abort();
    if (project.scenes[index]?.selected?.kind !== 'video') { visible.current = null; setVisibleSlot(null); return; }
    const abort = new AbortController(); idleRequest.current = abort;
    const current = visible.current;
    const element = current === null ? null : draftVideos[current].current;
    if (current !== null && assigned.current[current]?.index === index && element?.readyState && Math.abs(element.currentTime - project.scenes[index].start - local) < .12) return;
    const slot: Slot = current === 0 ? 1 : 0;
    try {
      await loadSlot(slot, project, index, local, abort.signal);
      abort.signal.throwIfAborted(); show(slot, index);
    } catch (error) { if (!abort.signal.aborted) setMessage(userMessage((error as Error).message)); }
  }

  async function startRendered() {
    release();
    const abort = new AbortController(); request.current = abort;
    const { project } = latest.current;
    const movie = latest.current.video.current;
    if (!movie) return;
    renderedElement.current = movie; busy.current = true; setPreparing(true); setMessage('正在准备播放…');
    movie.muted = !latest.current.voiceEnabled;
    const duration = Number.isFinite(movie.duration) ? movie.duration : project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const start = position.current >= duration - .08 ? 0 : position.current;
    if (movie.readyState && Math.abs(movie.currentTime - start) > .04) movie.currentTime = start;
    // Invoke play in the click stack, before any await, including cold loads.
    const starting = movie.play();
    try {
      await starting; abort.signal.throwIfAborted();
      setPreparing(false); setPlaying(true); setMessage('正在播放完整视频');
      let lastUpdate = 0;
      const tick = (now: number) => {
        if (abort.signal.aborted) return;
        if (now - lastUpdate >= 100 || movie.ended) {
          lastUpdate = now; updatePosition(movie.currentTime);
          const index = sceneAt(project, movie.currentTime);
          if (index >= 0 && index !== latest.current.active) latest.current.setActive(index);
        }
        if (movie.ended) { stop(); setMessage('播放结束'); return; }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) { fail(error, abort); }
  }

  async function startDraft(project: Project, index: number, local: number, mode: Mode, abort: AbortController) {
    try {
      const track = draftNarration(project, mode);
      const narration = track && context.current ? (async () => {
        let buffer = buffers.current.get(track.key);
        if (!buffer) {
          const response = await fetch(track.url, { signal: abort.signal });
          if (!response.ok) throw new Error('真实配音文件读取失败');
          buffer = await context.current!.decodeAudioData(await response.arrayBuffer());
          buffers.current.set(track.key, buffer);
          if (buffers.current.size > 4) buffers.current.delete(buffers.current.keys().next().value!);
        }
        return buffer;
      })() : Promise.resolve(null);
      const current = visible.current;
      const slot: Slot = current !== null && assigned.current[current]?.index === index ? current : current === 0 ? 1 : 0;
      const [initial, spoken] = await Promise.all([loadSlot(slot, project, index, local, abort.signal), narration]);
      abort.signal.throwIfAborted();
      let playingScene = initial;
      let sceneDuration = playableDuration(index, initial.available);
      local = Math.min(local, Math.max(0, sceneDuration - .05));
      const ctx = context.current;
      if (spoken && ctx) { await audioReady.current; if (ctx.state !== 'running') throw new Error('浏览器未启用声音，请再点击播放'); }
      const seconds = () => spoken && ctx ? ctx.currentTime : performance.now() / 1000;
      let anchorTime = seconds();
      let anchorPosition = sceneOffset(project, index) + local;
      clock.current = () => anchorPosition + seconds() - anchorTime;
      const startAudio = (sceneIndex: number, sceneLocal: number) => {
        try { source.current?.stop(); } catch {}
        source.current?.disconnect(); source.current = null;
        if (!spoken || !track || !ctx || !gain.current) return;
        const audioPosition = track.scenes[sceneIndex].start + sceneLocal;
        if (!Number.isFinite(audioPosition) || audioPosition >= spoken.duration) return;
        const node = ctx.createBufferSource(); node.buffer = spoken; node.connect(gain.current);
        node.start(0, audioPosition); source.current = node;
      };
      await initial.element.play(); abort.signal.throwIfAborted();
      startAudio(index, local); anchorTime = seconds(); show(initial.slot, index);
      setPreparing(false); setPlaying(true);
      setMessage(mode === 'available' ? spoken ? '草稿预览 · 仅播放已有画面' : '草稿预览 · 仅画面，旁白尚待准备' : mode === 'scene' ? '正在播放当前镜头' : '正在播放完整视频');
      type Ready = Awaited<ReturnType<typeof loadSlot>>;
      let warm: { index: number; promise: Promise<Ready> } | null = null;
      let switching = false;
      let lastUpdate = 0;
      function playableDuration(sceneIndex: number, available: number) {
        const duration = project.scenes[sceneIndex].duration;
        if (mode === 'film' && available + .1 < duration) throw new Error(`镜头 ${sceneIndex + 1} 长度不足，整片不能有画面缺口`);
        return Math.min(duration, available);
      }
      const warmNext = () => {
        const next = mode === 'scene' ? -1 : nextVideoScene(project, playingScene.index);
        if (next < 0) { warm = null; return; }
        const slot: Slot = playingScene.slot === 0 ? 1 : 0;
        const promise = loadSlot(slot, project, next, 0, abort.signal);
        // Background failures are only reported if playback reaches that slot.
        void promise.catch(() => {}); warm = { index: next, promise };
      };
      warmNext();
      const switchScene = async (next: number) => {
        const incoming = await (warm?.index === next ? warm.promise : loadSlot(playingScene.slot === 0 ? 1 : 0, project, next, 0, abort.signal));
        abort.signal.throwIfAborted();
        const offset = sceneOffset(project, next);
        const duration = playableDuration(next, incoming.available);
        let local = Math.max(0, clock.current!() - offset);
        // If loading was late, seek to the narration's current position. The
        // outgoing frame remains on screen during this seek and decode too.
        if (Math.abs(incoming.element.currentTime - project.scenes[next].start - local) > .12) {
          local = Math.min(local, Math.max(0, duration - .05));
          await decodedVideoFrame(incoming.element, project.scenes[next].start + local, abort.signal);
        }
        await incoming.element.play(); abort.signal.throwIfAborted();
        playingScene = incoming; sceneDuration = duration;
        show(incoming.slot, next); updatePosition(Math.max(offset, clock.current!()));
        switching = false; warmNext();
      };
      const tick = (now: number) => {
        if (abort.signal.aborted) return;
        const current = clock.current!();
        const offset = sceneOffset(project, playingScene.index);
        const end = offset + sceneDuration;
        if (now - lastUpdate >= 100) { lastUpdate = now; updatePosition(Math.min(current, end)); }
        if (current >= end && !switching) {
          playingScene.element.pause();
          const next = mode === 'scene' ? -1 : nextVideoScene(project, playingScene.index);
          if (next < 0) { updatePosition(end); clock.current = null; stop(); setMessage(mode === 'available' ? '已有画面预览结束 · 完整视频尚待补齐' : '播放结束'); return; }
          switching = true;
          const nextOffset = sceneOffset(project, next);
          // Restart only across omitted draft intervals. Adjacent scenes use
          // the same AudioBufferSourceNode all the way through their boundary.
          const audioGap = track && Math.abs(track.scenes[next].start - (track.scenes[playingScene.index].start + sceneDuration)) > .025;
          if (Math.abs(nextOffset - end) > .025 || audioGap) { anchorPosition = nextOffset; anchorTime = seconds(); startAudio(next, 0); }
          void switchScene(next).catch((error) => fail(error, abort));
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) { fail(error, abort); }
  }

  function play(nextMode: Mode = 'scene') {
    if (busy.current) { stop(); setMessage('已暂停'); return; }
    if (latest.current.project.exportUrl && nextMode === 'film') { void startRendered(); return; }
    const { project, voiceEnabled } = latest.current;
    const total = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const available = project.scenes.flatMap((scene, i) => scene.selected?.kind === 'video' ? [i] : []);
    if (!available.length) { setMessage('暂时没有可预览的画面，请先选择素材。'); return; }
    const mode = nextMode === 'film' && available.length !== project.scenes.length ? 'available' : nextMode;
    const requested = position.current >= total - .08 ? 0 : Math.max(0, sceneAt(project, position.current));
    const index = available.find((i) => i >= requested) ?? available[0];
    const local = index !== requested || position.current >= total - .08 ? 0 : Math.max(0, position.current - sceneOffset(project, index));
    release();
    const abort = new AbortController(); request.current = abort; busy.current = true;
    setPreparing(true); setMessage('正在准备播放…');
    const track = draftNarration(project, mode);
    if (voiceEnabled || track) {
      try {
        context.current ||= new AudioContext();
        gain.current ||= context.current.createGain(); gain.current.gain.value = voiceEnabled ? 1 : 0;
        gain.current.disconnect(); gain.current.connect(context.current.destination);
        // Unlock the audio device inside the user's gesture, before loading.
        audioReady.current = context.current.resume();
        void audioReady.current.catch(() => {});
      } catch { fail(new Error('浏览器无法初始化声音播放器'), abort); return; }
    }
    if (voiceEnabled && !track && mode !== 'available') {
      void api<{track: NarrationTrack; scenes: {id: string; duration: number}[]}>('/api/narration-track', project, abort.signal).then((ready) => {
        if (abort.signal.aborted) return;
        const updated = { ...project, narrationTrack: ready.track, scenes: project.scenes.map((scene) => ({ ...scene, duration: ready.scenes.find((entry) => entry.id === scene.id)?.duration || scene.duration })) };
        latest.current.onPrepared(updated);
        void startDraft(updated, index, 0, mode, abort);
      }).catch((error) => {
        if (!abort.signal.aborted) { latest.current.onError('旁白暂时无法准备，先预览已有画面。'); void startDraft(project, index, local, 'available', abort); }
      });
    } else void startDraft(project, index, local, mode, abort);
  }

  useEffect(() => {
    if (gain.current) gain.current.gain.value = options.voiceEnabled ? 1 : 0;
    if (options.video.current) options.video.current.muted = !options.voiceEnabled;
  }, [options.voiceEnabled]);
  useEffect(() => {
    stop(); setMessage(''); assigned.current = [null, null]; setSlots([null, null]); visible.current = null; setVisibleSlot(null);
  }, [options.project.id, options.project.exportUrl]);
  useEffect(() => { stop(); setMessage(''); }, [options.project.voice, options.project.voiceStyle, options.project.language]);
  const projectId = useRef(options.project.id);
  useEffect(() => {
    if (projectId.current === options.project.id) return;
    projectId.current = options.project.id; updatePosition(0); latest.current.setActive(0);
  }, [options.project.id]);
  const scene = options.project.scenes[options.active];
  useEffect(() => {
    if (busy.current || options.project.exportUrl) return;
    const local = Math.max(0, position.current - sceneOffset(options.project, options.active));
    void displayPaused(options.project, options.active, local);
  }, [options.project.id, options.project.exportUrl, options.active, scene?.selected?.id, scene?.selected?.playbackUrl, scene?.start]);
  useEffect(() => {
    const movie = options.video.current;
    return () => {
      movie?.pause();
      queueMicrotask(() => { if (movie && !movie.isConnected) { movie.removeAttribute('src'); movie.load(); } });
    };
  }, [options.project.exportUrl]);
  useEffect(() => () => { release(); buffers.current.clear(); gain.current?.disconnect(); void context.current?.close(); }, []);
  return { playing, preparing, message, play, stop, seekTo, slots, draftVideos, visibleSlot, hasFrame: visibleSlot !== null };
}
