import { useEffect, useRef, useState } from 'react';
import type { RefObject, VideoHTMLAttributes } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { Asset } from '../types';

type Props = VideoHTMLAttributes<HTMLVideoElement> & {
  asset?: Asset | null; videoRef?: RefObject<HTMLVideoElement | null>;
  showStatus?: boolean;
  onPlayable?: (ready: boolean) => void;
  onUnavailable?: () => void;
};
type Resource = { assetId: string; url: string; error: string };

export default function AssetVideo({ asset, videoRef, showStatus = true, onPlayable, onUnavailable, onError, ...props }: Props) {
  const ownVideo = useRef<HTMLVideoElement>(null);
  const element = videoRef || ownVideo;
  const callbacks = useRef({ onPlayable, onUnavailable }); callbacks.current = { onPlayable, onUnavailable };
  const [resource, setResource] = useState<Resource>({ assetId: asset?.id || '', url: asset?.playbackUrl || '', error: '' });
  const [decoded, setDecoded] = useState({ assetId: '', url: '' });
  const [attempt, setAttempt] = useState(0);
  const previousAsset = useRef(asset?.id);
  const current = resource.assetId === asset?.id ? resource : { assetId: asset?.id || '', url: '', error: '' };
  const matchesResource = (video: HTMLVideoElement) => Boolean(current.url && video.currentSrc === new URL(current.url, video.ownerDocument.baseURI).href);
  const loaded = decoded.assetId === current.assetId && decoded.url === current.url && Boolean(current.url);
  useEffect(() => {
    const controller = new AbortController();
    const video = element.current;
    const retry = previousAsset.current === asset?.id && attempt > 0;
    previousAsset.current = asset?.id;
    if (!asset) { setResource({ assetId: '', url: '', error: '' }); return () => controller.abort(); }
    video?.pause(); callbacks.current.onPlayable?.(false);
    // Verified URLs are already playable and need no new preparation request.
    if (!retry && asset.playbackUrl) {
      setResource({ assetId: asset.id, url: asset.playbackUrl, error: '' });
    } else {
      setResource({ assetId: asset.id, url: '', error: '' });
      void api<{url: string}>('/api/playback', { id: asset.id, retry }, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setResource({ assetId: asset.id, url: result.url, error: '' }); })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResource({ assetId: asset.id, url: '', error: '这段视频暂不可用，请更换画面。' });
            callbacks.current.onUnavailable?.();
          }
        });
    }
    return () => controller.abort();
  }, [asset?.id, asset?.playbackUrl, attempt]);
  useEffect(() => {
    const video = element.current;
    return () => {
      video?.pause();
      // A real unmount releases decoder/network state. React Strict Mode's
      // simulated effect cleanup leaves the DOM attached and keeps its src.
      queueMicrotask(() => { if (video && !video.isConnected) { video.removeAttribute('src'); video.load(); } });
    };
  }, []);
  return <>
    <video {...props} data-asset-id={asset?.id || ''} data-loaded-asset-id={loaded ? current.assetId : ''} data-playback-error={current.error || undefined} ref={element} src={current.url || undefined} onLoadedData={(event) => {
      if (matchesResource(event.currentTarget)) setDecoded({ assetId: current.assetId, url: current.url });
      props.onLoadedData?.(event);
    }} onEmptied={(event) => { setDecoded({ assetId: '', url: '' }); props.onEmptied?.(event); }} onCanPlay={(event) => { if (matchesResource(event.currentTarget)) callbacks.current.onPlayable?.(true); props.onCanPlay?.(event); }} onWaiting={(event) => { callbacks.current.onPlayable?.(false); props.onWaiting?.(event); }} onError={(event) => {
      // Removing src during cleanup can dispatch a late event for the old
      // resource. It must not mark the next background assignment as failed.
      if (!current.url || !event.currentTarget.getAttribute('src') || !matchesResource(event.currentTarget)) return;
      callbacks.current.onPlayable?.(false); callbacks.current.onUnavailable?.();
      const code = event.currentTarget.error?.code;
      const error = code === 2 ? '本地视频读取中断，请重试。' : code === 3 || code === 4 ? '浏览器未能解码兼容视频，请重试准备素材。' : '素材缓存已过期或无法加载，请重试。';
      setResource((value) => value.assetId === current.assetId ? { ...value, error } : value);
      onError?.(event);
    }}/>
    {showStatus && asset && !current.url && !current.error && <div className="media-preparing" role="status"><LoaderCircle className="spin" size={22}/><span>正在准备可播放视频…</span></div>}
    {showStatus && current.error && <div className="media-playback-error" role="alert"><span>{current.error}</span><button className="secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14}/> 重新准备视频</button></div>}
  </>;
}
