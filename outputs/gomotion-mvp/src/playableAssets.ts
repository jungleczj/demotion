import type { Asset } from './types';

export const hasPlayableDownload = (asset: Asset) => asset.kind === 'video'
  && asset.playbackChecked === true && asset.downloadChecked === true
  && Boolean(asset.playbackUrl?.startsWith('/api/playback/') && asset.downloadUrl?.startsWith('/api/playback/'));

async function browserCanRead(asset: Asset, signal: AbortSignal) {
  if (!hasPlayableDownload(asset)) return false;
  const response = await fetch(asset.downloadUrl!, { headers: { Range: 'bytes=0-1023' }, signal });
  if (response.status !== 206 || !response.headers.get('content-type')?.startsWith('video/mp4') || (await response.arrayBuffer()).byteLength !== 1024) return false;
  return new Promise<boolean>((resolve) => {
    const video = document.createElement('video');
    const finish = (value: boolean) => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      video.onloadeddata = null; video.onerror = null;
      video.pause(); video.removeAttribute('src'); video.load(); resolve(value);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(false), 20000);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.onloadeddata = () => finish(video.readyState >= 2 && video.videoWidth > 0);
    video.onerror = () => finish(false);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    video.src = asset.playbackUrl!; video.load();
  });
}

export async function browserPlayableAssets(candidates: Asset[], signal: AbortSignal) {
  const accepted: Asset[] = [];
  for (let index = 0; index < candidates.length; index += 2) {
    signal.throwIfAborted();
    const batch = candidates.slice(index, index + 2);
    const outcomes = await Promise.allSettled(batch.map((a) => browserCanRead(a, signal)));
    signal.throwIfAborted();
    outcomes.forEach((result, i) => { if (result.status === 'fulfilled' && result.value) accepted.push(batch[i]); });
  }
  return accepted;
}
