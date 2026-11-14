import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Music2, Pause, Play, Upload, Volume2, X } from 'lucide-react';
import { MUSIC_UPLOAD_EXTENSIONS, MUSIC_UPLOAD_MAX_BYTES, musicCatalog, uploadMusic } from '../api';
import { time } from '../types';
import type { MusicCatalog, MusicGenre, MusicOptions, MusicTrack } from '../types';

const genreOptions: {id: MusicGenre; label: string}[] = [
  { id: 'epic', label: 'Epic' }, { id: 'documentary', label: 'Documentary' }, { id: 'tension', label: 'Tension' },
  { id: 'emotional', label: 'Emotional' }, { id: 'chill', label: 'Chill' }, { id: 'upbeat', label: 'Upbeat' },
];
type Props = { value: MusicOptions; onChange: (music: MusicOptions) => void; onUploading: (uploading: boolean) => void };

export default function MusicPicker({ value, onChange, onUploading }: Props) {
  const [catalog, setCatalog] = useState<MusicCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [retry, setRetry] = useState(0);
  const [previewId, setPreviewId] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [playError, setPlayError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  const activePreview = useRef('');
  const uploadController = useRef<AbortController | null>(null);
  const currentValue = useRef(value);
  currentValue.current = value;

  useEffect(() => {
    const abort = new AbortController(); setCatalogError('');
    void musicCatalog(abort.signal).then(setCatalog).catch(() => { if (!abort.signal.aborted) setCatalogError('音乐列表暂时无法载入。'); });
    return () => abort.abort();
  }, [retry]);
  function stopPreview() {
    previewRequest.current += 1; activePreview.current = '';
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    setPreviewId(''); setLoadingPreview(false);
  }
  useEffect(() => { stopPreview(); setPlayError(''); }, [value.enabled, value.genre, value.trackId, value.upload?.id]);
  useEffect(() => { if (!value.enabled) { uploadController.current?.abort(); setUploading(false); onUploading(false); } }, [value.enabled, onUploading]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = value.volume / 100; }, [value.volume]);
  useEffect(() => { const audio = audioRef.current; return () => { previewRequest.current += 1; activePreview.current = ''; audio?.pause(); audio?.removeAttribute('src'); audio?.load(); uploadController.current?.abort(); }; }, []);

  async function preview(track: MusicTrack) {
    if (activePreview.current === track.id) { stopPreview(); return; }
    stopPreview(); setPlayError('');
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++previewRequest.current;
    activePreview.current = track.id; setPreviewId(track.id); setLoadingPreview(true);
    audio.src = track.previewUrl; audio.volume = value.volume / 100;
    try { await audio.play(); if (previewRequest.current === request) setLoadingPreview(false); }
    catch { if (previewRequest.current === request) { stopPreview(); setPlayError('这首曲目暂时无法试听，请稍后重试。'); } }
  }
  async function upload(file?: File) {
    if (!file) return;
    stopPreview(); setUploadError(''); setUploading(true); onUploading(true);
    uploadController.current?.abort();
    const abort = new AbortController(); uploadController.current = abort;
    try {
      const result = await uploadMusic(file, abort.signal, catalog?.upload);
      if (!abort.signal.aborted) onChange({ ...currentValue.current, trackId: undefined, upload: result });
    } catch (error) { if (!abort.signal.aborted) setUploadError((error as Error).message); }
    finally { if (!abort.signal.aborted) { setUploading(false); onUploading(false); } if (inputRef.current) inputRef.current.value = ''; }
  }
  const tracks = catalog?.tracks.filter((track) => value.genre === 'auto' || track.genres.includes(value.genre)) || [];
  const maxBytes = catalog?.upload?.maxBytes || MUSIC_UPLOAD_MAX_BYTES;
  const extensions = catalog?.upload?.acceptedExtensions || MUSIC_UPLOAD_EXTENSIONS;
  return <>
    <audio ref={audioRef} preload="none" onWaiting={() => { if (activePreview.current) setLoadingPreview(true); }} onPlaying={() => setLoadingPreview(false)} onEnded={() => stopPreview()} onError={() => { if (activePreview.current) { stopPreview(); setPlayError('这首曲目暂时无法试听，请稍后重试。'); } }}/>
    {value.enabled && <div className="music-picker">
      <div className="music-library-label"><span>Music library</span><button type="button" className={`music-auto ${value.genre === 'auto' && !value.trackId && !value.upload ? 'active' : ''}`} onClick={() => onChange({ ...value, genre: 'auto', trackId: undefined, upload: undefined })}>{value.genre === 'auto' && !value.trackId && !value.upload && <Check size={12}/>}Auto select</button></div>
      <div className="music-genres" role="group" aria-label="音乐风格">{genreOptions.map((genre) => <button key={genre.id} type="button" className={value.genre === genre.id ? 'active' : ''} aria-pressed={value.genre === genre.id} onClick={() => onChange({ ...value, genre: value.genre === genre.id ? 'auto' : genre.id, trackId: undefined, upload: undefined })}>{genre.label}</button>)}</div>
      <div className="music-track-list" role="group" aria-label="背景音乐曲目" aria-busy={!catalog && !catalogError}>
        {!catalog && !catalogError && <p className="music-empty" role="status"><LoaderCircle size={15} className="spin"/>正在载入音乐…</p>}
        {catalogError && <div className="music-empty" role="alert"><span>{catalogError}</span><button type="button" className="text-button" onClick={() => setRetry((count) => count + 1)}>重试</button></div>}
        {catalog && !catalogError && !tracks.length && <p className="music-empty" role="status">这个风格暂时没有曲目。<button type="button" className="text-button" onClick={() => onChange({ ...value, genre: 'auto', trackId: undefined, upload: undefined })}>查看全部音乐</button></p>}
        {tracks.map((track) => <div key={track.id} className={`music-track ${value.trackId === track.id && !value.upload ? 'selected' : ''}`}>
          <button type="button" className="music-preview-button" aria-label={`${previewId === track.id ? '停止试听' : '试听'} ${track.title}`} onClick={() => void preview(track)}>{previewId === track.id && loadingPreview ? <LoaderCircle className="spin" size={14}/> : previewId === track.id ? <Pause size={14}/> : <Play size={14}/>}</button>
          <button type="button" className="music-track-select" aria-pressed={value.trackId === track.id && !value.upload} onClick={() => onChange({ ...value, trackId: track.id, upload: undefined })}><span><strong>{track.title}</strong><small>{track.author}</small></span><span className="music-duration">{time(track.duration)}</span><span className="music-selected" aria-hidden="true">{value.trackId === track.id && !value.upload && <Check size={13}/>}</span></button>
        </div>)}
      </div>
      {playError && <p className="music-feedback error" role="alert">{playError}</p>}
      <div className="music-volume"><label htmlFor="music-volume"><Volume2 size={15}/>Volume</label><output htmlFor="music-volume">{value.volume}%</output><input id="music-volume" type="range" min="0" max="100" step="1" value={value.volume} aria-valuetext={`${value.volume}%`} onChange={(event) => onChange({ ...value, volume: Number(event.target.value) })}/></div>
      {value.upload && <div className="music-upload-selection"><Music2 size={17}/><span><strong>{value.upload.name}</strong><small>将使用你上传的音频</small></span><Check size={14}/><button type="button" className="icon-button" aria-label="移除上传的音乐" onClick={() => onChange({ ...value, upload: undefined })}><X size={14}/></button></div>}
      <div className="music-upload"><input ref={inputRef} type="file" hidden accept={extensions.map((extension) => `.${extension}`).join(',')} onChange={(event) => void upload(event.target.files?.[0])}/><button type="button" className="secondary music-upload-button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spin" size={15}/> : <Upload size={15}/>} {uploading ? '正在上传…' : 'Upload your own audio'}</button><small>MP3 / WAV 等音频 · ≤ {(maxBytes / 1_000_000).toLocaleString()} MB</small></div>
      {uploadError && <p className="music-feedback error" role="alert">{uploadError}</p>}
      {!value.upload && !value.trackId && <p className="music-feedback">自动从可用曲目中选择，保持旁白清晰。</p>}
    </div>}
  </>;
}
