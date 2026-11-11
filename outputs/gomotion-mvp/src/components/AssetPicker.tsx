import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Film, Image, LoaderCircle, Play, Search, Upload, X } from 'lucide-react';
import AssetCredit from './AssetCredit';
import AssetVideo from './AssetVideo';
import { api } from '../api';
import { browserPlayableAssets, hasPlayableDownload } from '../playableAssets';
import { userMessage } from '../userMessage';
import { Asset, media, Provider, Scene, SearchResult, sourceLabels, time } from '../types';

type Props = { scene: Scene; format: 'landscape' | 'portrait'; providers: Provider[]; used: string[]; onClose: () => void; onSelect: (asset: Asset) => void; onResults: (assets: Asset[]) => void; onError: (message: string) => void };
export default function AssetPicker({ scene, format, providers, used, onClose, onSelect, onResults, onError }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(scene.query);
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('video');
  const [results, setResults] = useState<Asset[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Asset | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dialog.current?.showModal(); const abort = new AbortController(); controller.current = abort;
    void api<{assets: Asset[]; warnings: string[]}>('/api/playable', { ids: scene.candidates.map((a) => a.id), outputFormat: format }, abort.signal)
      .then(async (r) => { const ready = await browserPlayableAssets(r.assets, abort.signal); if (abort.signal.aborted) return; setResults(ready); onResults(ready); })
      .catch((e) => { if (!abort.signal.aborted) setError(userMessage(e.message)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  async function search() {
    controller.current?.abort(); controller.current = new AbortController();
    setLoading(true); setError(''); setPreview(null); setWarnings([]);
    try {
      const result = await api<SearchResult>('/api/search', { query, outputFormat: format, providers: source === 'all' ? providers : [source], kind, used, rank: true, scene: { text: scene.text, query, exact: scene.exact } }, controller.current.signal);
      const ready = await browserPlayableAssets(result.assets, controller.current.signal);
      setResults(ready); onResults(ready);
    } catch (e) { if ((e as Error).name !== 'AbortError') setError(userMessage((e as Error).message)); }
    finally { setLoading(false); }
  }
  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const response = await fetch('/api/upload', { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const ready = await browserPlayableAssets([data.asset], new AbortController().signal);
      if (!ready.length) throw new Error('这段视频暂不可用，请选择其他视频');
      const item = ready[0]; const w = item.playbackWidth || item.width, h = item.playbackHeight || item.height;
      if (format === 'portrait' ? h <= w : w <= h) throw new Error('请选择与当前视频相同方向的素材');
      setPreviewReady(false); setPreview(ready[0]); setResults((all) => [ready[0], ...all]);
    } catch (e) { onError((e as Error).message); } finally { setLoading(false); }
  }
  const visible = (source === 'all' ? results : results.filter((asset) => asset.provider === source)).filter(hasPlayableDownload);
  return <dialog ref={dialog} className="asset-dialog" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-header"><div><div className="eyebrow">SCENE {String(scene.index + 1).padStart(2, '0')}</div><h2>为这个镜头找到合适的画面</h2></div><button className="icon-button" aria-label="关闭素材选择" onClick={onClose}><X size={20}/></button></div>
    <div className="asset-dialog-body"><aside className="asset-context"><span className="field-label">这一段旁白</span><p className="scene-quote">{scene.text}</p><div className="context-divider"/><span className="field-label">画面建议</span><p>{scene.visual}</p>{scene.exact && <div className="amber-notice">涉及具体对象或史实，请核对来源，避免用相似画面指认。</div>}<div className="context-divider"/><span className="field-label">有自己的素材？</span><button className="secondary upload-button" onClick={() => upload.current?.click()} disabled={loading}><Upload size={15}/> 上传视频</button><small>仅存于本机临时目录 · 单文件 ≤ 90MB</small><input ref={upload} type="file" hidden accept="video/mp4,video/webm,video/quicktime,video/ogg" onChange={(e) => { if (e.target.files?.[0]) void uploadFile(e.target.files[0]); }}/></aside>
      <section className="asset-search-panel"><form className="asset-search" onSubmit={(e) => { e.preventDefault(); void search(); }}><Search size={18}/><input aria-label="素材搜索关键词" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入英文检索词，例如 ocean waves"/><button className="primary" disabled={loading || !query.trim()}>{loading ? <LoaderCircle size={16} className="spin"/> : '搜索'}</button></form>
        <div className="asset-filters"><div className="source-tabs"><button className={source === 'all' ? 'active' : ''} onClick={() => setSource('all')}>全部来源</button>{providers.map((p) => <button key={p} className={source === p ? 'active' : ''} onClick={() => setSource(p)}>{sourceLabels[p]}</button>)}</div><select aria-label="素材类型" value={kind} onChange={(e) => setKind(e.target.value)}><option value="video">视频</option></select></div>
        <div className="asset-result-label"><span>{loading ? '正在寻找可用画面…' : `${visible.length} 段候选素材`}</span><span>可播放 · 可下载</span></div>
        {error && <div role="alert" className="error-banner">{error}<button onClick={search}>重试</button></div>}
        {warnings.length > 0 && <div className="warning-banner">{warnings.join('；')}</div>}
        {preview && <div className="candidate-preview"><button className="icon-button" onClick={() => setPreview(null)} aria-label="关闭预览"><X size={17}/></button><AssetVideo key={preview.id} asset={preview} autoPlay controls playsInline onPlayable={setPreviewReady} onUnavailable={() => { const ready = results.filter((a) => a.id !== preview.id); setResults(ready); onResults(ready); setPreview(null); setPreviewReady(false); }}/><div><strong>{preview.title}</strong><p>{preview.description}</p><AssetCredit asset={preview}/><a href={preview.sourceUrl} target="_blank" rel="noreferrer">查看原始来源 <ExternalLink size={12}/></a><a className="secondary" href={preview.downloadUrl} download={`${preview.title}.mp4`}>下载素材</a><button className="primary" disabled={!previewReady} onClick={() => { onSelect(preview); onClose(); }}><Check size={15}/> 使用这段素材</button></div></div>}
        {loading ? <div className="asset-grid">{Array.from({ length: 6 }, (_, index) => <div className="asset-skeleton" key={index}><div/><span/><span/></div>)}</div> : visible.length ? <div className="asset-grid">{visible.map((asset, index) => <article className={`asset-card ${scene.selected?.id === asset.id ? 'chosen' : ''}`} key={asset.id}>
          <button className="asset-thumb" onClick={() => { setPreviewReady(false); setError(''); setPreview(asset); }} aria-label={`预览 ${asset.title}`}><img src={media(asset, true)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.opacity = '0'; }}/><span className="asset-placeholder"><Film size={24}/></span><span className="asset-provider">{sourceLabels[asset.provider]}</span>{asset.duration > 0 && <span className="asset-duration">{time(asset.duration)}</span>}<span className="asset-play"><Play size={17} fill="currentColor"/></span>{scene.selected?.id === asset.id && <span className="asset-selected"><Check size={14}/></span>}</button>
          <div className="asset-card-body"><div className="asset-card-meta"><span>{asset.width ? `${asset.width} × ${asset.height}` : '尺寸待检查'}</span><a href={asset.downloadUrl} download={`${asset.title}.mp4`} aria-label={`下载 ${asset.title}`}>下载</a></div><h3 title={asset.title}>{asset.title}</h3><AssetCredit asset={asset}/><p className="match-reason">{asset.reason || '请预览画面并核对来源说明'}</p><div className="asset-author"><span title={asset.author}>{asset.author.slice(0, 35)}</span><a href={asset.sourceUrl || '#'} target="_blank" rel="noreferrer" aria-label="打开来源"><ExternalLink size={13}/></a></div><div className="asset-card-bottom"><span title={asset.license}>{asset.license}</span><button onClick={() => { setPreviewReady(false); setPreview(asset); }}><Play size={12}/> 预览 / 使用</button></div></div>
        </article>)}</div> : !error && <div className="empty-assets"><Search size={30}/><h3>还没找到合适的画面</h3><p>试着减少关键词、改用英文，或切换到其他来源。<br/>你也可以上传自己找到的素材。</p></div>}
      </section></div>
  </dialog>;
}
function PlusIcon() { return <span aria-hidden="true">＋</span>; }
