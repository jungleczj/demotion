import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Film, GripVertical, LoaderCircle, Maximize2, MoreHorizontal, Pause, Play, RefreshCw, Search, Settings2, Subtitles, Volume2, VolumeX } from 'lucide-react';
import { api, downloadJSON } from '../api';
import { Asset, contentApproved, ExportJob, ProductionTask, productionActive, media, Project, Provider, Scene, SequenceResult, sourceLabels, time } from '../types';
import { voiceOptions, narrationStyles, languageOptions } from '../data';
import AssetCredit from './AssetCredit';
import ProductionTiming from './ProductionTiming';
import AssetPicker from './AssetPicker';
import AssetVideo from './AssetVideo';
import usePreviewPlayback from '../hooks/usePreviewPlayback';
import videoProfile from '../../shared/video-profile.json';
import captionStyle from '../../shared/caption-style.json';
import { editScene } from '../../shared/scene-edit.mjs';

type Props = { project: Project; providers: Provider[]; generating: boolean; progress: string; task?: ProductionTask; taskConnectionLost?: boolean; onRemake: (project: Project) => Promise<void>; onChange: (project: Project) => void; onBack: () => void; onError: (message: string) => void; onCancel: () => void };
export default function Editor({ project, providers, generating, progress, task, taskConnectionLost, onRemake, onChange, onBack, onError, onCancel }: Props) {
  const [active, setActive] = useState(0);
  const [picker, setPicker] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voicePreview, setVoicePreview] = useState(true);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [unifying, setUnifying] = useState(false);
  const busy = generating || unifying || job?.status === 'rendering';
  const currentProject = useRef(project);
  currentProject.current = project;
  const video = useRef<HTMLVideoElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const scene = project.scenes[active];
  const total = project.scenes.reduce((sum, s) => sum + s.duration, 0);
  const captionWidth = project.format === 'portrait' ? videoProfile.height : videoProfile.width;
  const captionSize = captionStyle.fontSize * Math.min(videoProfile.width, videoProfile.height) / captionStyle.referenceShortSide / captionWidth * 100;
  const filled = project.scenes.filter((s) => s.selected).length;
  const approved = project.scenes.filter(contentApproved).length;
  const missing = project.scenes.filter((s) => s.selected?.kind !== 'video').length;
  const offsets = project.scenes.map((_, index) => project.scenes.slice(0, index).reduce((sum, s) => sum + s.duration, 0));
  const patchScene = (id: string, patch: Partial<Scene>) => {
    if (busy) return;
    if (['selected', 'start', 'duration', 'text'].some((key) => key in patch)) playback.stop();
    const changesMedia = ['selected', 'start', 'duration', 'text'].some((key) => key in patch);
    onChange({ ...project, sequenceReport: changesMedia ? undefined : project.sequenceReport, narrationTrack: changesMedia ? undefined : project.narrationTrack, exportUrl: undefined, exportId: undefined, scenes: project.scenes.map((s) => s.id === id ? editScene(s, patch) : s) });
  };
  const playback = usePreviewPlayback({ project, active, elapsed, voiceEnabled: voicePreview, video, setActive, setElapsed, onError, onPrepared: onChange });
  const { playing, preparing } = playback;
  useEffect(() => {
    setActive((index) => Math.max(0, Math.min(index, project.scenes.length - 1)));
  }, [project.scenes.length]);
  useEffect(() => {
    if (!project.exportId || project.exportId === job?.id) return;
    let stopped = false;
    void api<ExportJob>(`/api/exports/${project.exportId}`).then((next) => {
      if (stopped) return;
      setJob(next); setExportOpen(true);
      if (next.status === 'done') onChange({ ...currentProject.current, exportUrl: next.url, videoReview: next.review });
    }).catch(() => {});
    return () => { stopped = true; };
  }, [project.exportId, job?.id]);
  function goTo(index: number) { playback.seekTo(offsets[index]); }
  useEffect(() => {
    if (!job || job.status !== 'rendering') return;
    let stopped = false;
    const interval = setInterval(async () => {
      try {
        const next = await api<ExportJob>(`/api/exports/${job.id}`);
        if (stopped || currentProject.current.exportId !== job.id) return; setJob(next);
        if (next.status === 'done') onChange({ ...currentProject.current, exportId: next.id, exportUrl: next.url, videoReview: next.review });
      } catch (error) { if (!stopped) { setJob({ ...job, status: 'error', error: (error as Error).message }); } }
    }, 1500);
    return () => { stopped = true; clearInterval(interval); };
  }, [job?.id, job?.status, project.exportId]);
  async function startExport(input: Project = currentProject.current) {
    playback.stop(); setExportOpen(true);
    try { const result = await api<{ id: string }>('/api/export', input); onChange({ ...input, exportId: result.id, exportUrl: undefined, videoReview: undefined }); setJob({ id: result.id, createdAt: Date.now(), status: 'rendering', progress: 1, message: '准备导出' }); }
    catch (error) { setJob({ id: '', status: 'error', progress: 0, message: '', error: (error as Error).message }); }
  }
  async function unify() {
    playback.stop(); setUnifying(true);
    try { await onRemake(currentProject.current); } finally { setUnifying(false); }
  }
  function togglePlay() { playback.play('film'); }
  const latestReview = project.videoReview?.exportId === job?.id ? project.videoReview : job?.review;
  const activeTask = productionActive(task) ? task : undefined;
  const making = generating || job?.status === 'rendering';
  const strip = making && <div className="generation-strip"><LoaderCircle size={17} className="spin"/><span>{task?.status === 'queued' ? '等待制作…' : activeTask?.phase === 'rendering' || activeTask?.phase === 'reviewing' || job?.status === 'rendering' ? '正在合成视频…' : '正在制作视频…'}</span><ProductionTiming task={activeTask} duration={total} count={project.scenes.length} startedAt={job?.createdAt}/>{taskConnectionLost && activeTask && <span className="production-connection">进度连接暂时中断，正在重连</span>}<button disabled={!activeTask && job?.status !== 'rendering'} onClick={() => activeTask ? onCancel() : void fetch(`/api/exports/${job?.id}`, { method: 'DELETE' })}>停止任务</button></div>;
  if (!scene) return <div className="editor-page"><div className="editor-heading"><div className="editor-title-row"><button className="icon-button" onClick={onBack} aria-label="返回创作"><ArrowLeft size={19}/></button><h2>{project.title}</h2></div></div>{strip}<section className="panel production-placeholder"><Film size={32}/><h3>{making ? '视频正在准备中' : '视频尚未完成'}</h3><p>{making ? '可以离开此页面，稍后从 Projects 回来查看。' : '草稿已保留，可以重新制作。'}</p>{!making && <button className="secondary" onClick={unify}>重新制作</button>}</section></div>;
  return <div className="editor-page">
    <div className="editor-heading"><div className="editor-title-row"><button className="icon-button" onClick={onBack} aria-label="返回创作"><ArrowLeft size={19}/></button><div><input disabled={busy} aria-label="修改项目标题" value={project.title} onChange={(e) => onChange({ ...project, title: e.target.value })}/><p><span className={generating ? 'blue-dot' : 'green-dot'}/>{generating ? '正在制作视频…' : `${filled} 个画面已选择`}<span>·</span>预计 {time(total)}<span>·</span>{project.videoProfile?.label || (project.exportUrl ? 'HD' : videoProfile.label)}</p></div></div><div className="editor-actions"><button className="secondary" onClick={() => downloadJSON(project, `${project.title || 'project'}.json`)}><Download size={15}/><span>项目文件</span></button><button className="primary" disabled={unifying || generating || !project.voice.startsWith('gemini:') || approved !== project.scenes.length || job?.status === 'rendering'} onClick={() => void startExport()}>{job?.status === 'rendering' ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}Export video</button></div></div>
    {strip}
    <div className="editor-voice"><label>旁白声音 <select aria-label="旁白声音" value={project.voice} disabled={unifying || generating} onChange={(e) => { playback.stop(); onChange({ ...project, voice: e.target.value, narrationTrack: undefined, videoReview: undefined, sequenceReport: undefined, exportId: undefined, exportUrl: undefined, scenes: project.scenes.map((s) => ({ ...s, confirmed: false, trimEnd: undefined, visualObservation: undefined })) }); }}>{!project.voice.startsWith('gemini:') && <option value={project.voice}>请选择声音</option>}{voiceOptions.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.description}</option>)}</select></label><span>语言：{languageOptions.find((l) => l.code === project.language)?.name || '跟随脚本'}</span><small>所选声音统一用于整部视频。</small></div>
    <section className="sequence-bar"><div><strong>{unifying ? '正在更新视频…' : '你的故事，正在这里发生。'}</strong><p>选择喜欢的画面和声音，再播放完整视频。</p></div><button className="secondary" disabled={generating || unifying || job?.status === 'rendering'} onClick={unify}>{unifying ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>}重新制作</button></section>
    <div className="editor-grid">
      <div className="editor-stage"><div className="player-top"><span><span className="blue-dot"/> PREVIEW</span><span>Scene {String(active + 1).padStart(2, '0')} <span className="light">/ {String(project.scenes.length).padStart(2, '0')}</span></span></div>
        <div ref={player} className={`video-canvas ${project.format}`}>
          {project.exportUrl ? <video ref={video} data-rendered-url={project.exportUrl} src={project.exportUrl} muted={!voicePreview} playsInline preload="auto" style={{ objectFit: 'contain' }} onLoadedMetadata={(event) => { event.currentTarget.currentTime = elapsed; }} aria-label="连续成片预览"/> : <>
            {playback.slots.map((slot, index) => <AssetVideo key={index} asset={slot?.scene.selected} videoRef={playback.draftVideos[index as 0 | 1]} showStatus={false} muted playsInline preload="auto" className="draft-video-slot" style={{ objectFit: project.fit, opacity: playback.visibleSlot === index ? 1 : 0 }} aria-hidden={playback.visibleSlot !== index} aria-label={`草稿视频槽 ${index + 1}`}/>)}
            {scene.selected?.kind === 'image' && !playing && <img src={media(scene.selected)} alt={scene.selected.title} style={{ objectFit: project.fit }}/>}</>}
          {scene.selected || project.exportUrl || playback.hasFrame ? <>{!project.exportUrl && <div className="video-vignette"/>}{project.subtitles && !project.exportUrl && <div className="video-caption" style={{ fontSize: `${captionSize}cqw`, fontFamily: `"${captionStyle.fontFamily}", sans-serif`, fontWeight: captionStyle.fontWeight, bottom: `${captionStyle.safeMargin * 100}%`, left: `${captionStyle.safeMargin * 100}%`, right: `${captionStyle.safeMargin * 100}%` }}><span style={{ backgroundColor: `rgba(0, 0, 0, ${captionStyle.backgroundOpacity})`, color: "#fff" }}>{scene.text}</span></div>}{!playing && !preparing && <button className="big-play" aria-label={missing ? '预览已有画面' : '播放视频'} onClick={togglePlay}><Play size={26} fill="currentColor"/></button>}{preparing && (!playback.hasFrame || project.exportUrl) && <div className="media-preparing" role="status"><LoaderCircle className="spin" size={22}/><span>{playback.message}</span><button className="secondary" onClick={playback.stop}>取消准备</button></div>}</> : <div className="unmatched-preview">{scene.status === 'searching' ? <LoaderCircle size={34} className="spin"/> : <Film size={38}/>}<h3>{scene.status === 'searching' ? '正在为这句话寻找画面' : '这个镜头，还差一个画面'}</h3><p>{scene.status === 'error' ? '暂未找到可用画面，请重新制作或更换素材。' : scene.visual}</p><button className="canvas-button" disabled={busy} onClick={() => setPicker(true)}><Search size={15}/> 选择素材</button></div>}
        </div>
        <div className="playback-controls"><button className="icon-button" aria-label={playing || preparing ? '暂停' : missing ? '预览已有画面' : '播放视频'} onClick={togglePlay}>{playing || preparing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><span className="playback-time">{time(elapsed)} <span>/ {time(total)}</span></span><input type="range" aria-label="视频预览进度" min="0" max={Math.max(1, total)} step=".1" value={elapsed} onChange={(e) => { playback.seekTo(Number(e.target.value)); }}/><button className={`icon-button ${voicePreview ? 'blue-text' : ''}`} aria-label="切换旁白试听" title="实际生成的神经配音" onClick={() => setVoicePreview(!voicePreview)}>{voicePreview ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className="icon-button" onClick={() => void player.current?.requestFullscreen()} aria-label="全屏预览"><Maximize2 size={17}/></button></div>
        {missing > 0 && <div className="draft-preview-notice"><span>草稿 · 已有 {filled} 个画面，还有 {missing} 个待补充</span><button className="text-button" disabled={!filled} onClick={togglePlay}>{playing || preparing ? '暂停预览' : '连续预览已有画面'}</button></div>}{playback.message && <p className="playback-status" role="status">{playback.message}</p>}<div className="timeline"><div className="timeline-ruler"><span>00:00</span><span>{time(total / 4)}</span><span>{time(total / 2)}</span><span>{time(total * .75)}</span><span>{time(total)}</span></div><div className="timeline-track"><span className="track-label">V1</span><div className="timeline-clips">{project.scenes.map((s, i) => <button key={s.id} className={`timeline-clip ${active === i ? 'active' : ''}`} style={{ flexGrow: s.duration }} onClick={() => goTo(i)} aria-label={`跳到镜头 ${i + 1}`} title={s.text}>{s.selected && <img src={media(s.selected, true)} alt="" loading="lazy"/>}<span>{String(i + 1).padStart(2, '0')}</span></button>)}</div></div><div className="timeline-track audio"><span className="track-label">A1</span><div className="waveform" aria-label="旁白时间轴（示意）">{Array.from({ length: 110 }, (_, i) => <i key={i} style={{ height: `${8 + ((i * 17 + i * i) % 23)}px` }}/>)}</div></div></div>
        <div className="project-credits">{[...new Map(project.scenes.flatMap((s) => s.selected?.provider === 'coverr' ? [[s.selected.id, s.selected] as const] : [])).values()].map((asset) => <AssetCredit key={asset.id} asset={asset}/>)}</div><div className="stage-foot"><span><CheckCircle2 size={13}/> 项目保存在本机浏览器</span><span>连续播放 · 全片统一旁白</span></div>
      </div>
      <aside className="scene-panel"><div className="scene-panel-heading"><h2>Scenes <span>{project.scenes.length}</span></h2><span>点击镜头进行编辑</span></div><div className="scene-list">{project.scenes.map((s, index) => <button key={s.id} className={`scene-list-item ${index === active ? 'active' : ''}`} onClick={() => goTo(index)}><span className="scene-number">{String(index + 1).padStart(2, '0')}</span><span className="scene-thumbnail">{s.selected ? <img src={media(s.selected, true)} alt="" loading="lazy"/> : s.status === 'searching' ? <LoaderCircle size={18} className="spin"/> : <Film size={18}/>}<small>{time(s.duration)}</small></span><span className="scene-item-copy"><strong>{s.text}</strong><small>{s.selected ? `${sourceLabels[s.selected.provider]} · ${contentApproved(s) ? '已选用' : '可编辑'}` : s.status === 'searching' ? '正在检索…' : '待选素材'}</small></span>{s.selected ? <CheckCircle2 size={14} className="green-text"/> : <span className="unmatched-dot"/>}</button>)}</div>
        <div className="scene-details"><div className="section-heading"><h3>Scene {String(active + 1).padStart(2, '0')}</h3><button className="text-button" disabled={busy} onClick={() => setPicker(true)}><RefreshCw size={13}/> Replace</button></div><textarea disabled={busy} aria-label="镜头旁白" value={scene.text} onChange={(e) => patchScene(scene.id, { text: e.target.value })}/><label className="field-label">检索关键词</label><div className="query-field"><Search size={13}/><input disabled={busy} aria-label="镜头检索词" value={scene.query} onChange={(e) => patchScene(scene.id, { query: e.target.value })}/></div><div className="scene-timing"><label>画面起点<input disabled={busy} type="number" min="0" max={Math.max(0, (scene.selected?.duration || 60) - 1)} step=".5" aria-label="素材起点秒数" value={scene.start} onChange={(e) => patchScene(scene.id, { start: Number(e.target.value) })}/><span>秒</span></label><label>预计时长<input disabled={busy} type="number" min="1" aria-label="镜头预计秒数" value={scene.duration} onChange={(e) => patchScene(scene.id, { duration: Math.max(1, Number(e.target.value) || 1) })}/><span>秒</span></label></div>{scene.selected && <div className="selected-source"><div><span className="green-dot"/><strong>{sourceLabels[scene.selected.provider]}</strong><a href={scene.selected.sourceUrl || undefined} target="_blank" rel="noreferrer"><ExternalLink size={13}/> 来源</a></div><p>{scene.selected.reason || scene.selected.title}</p><label>与上一镜头衔接 <select disabled={busy} aria-label="镜头转场" value={scene.transitionType || 'cut'} onChange={(e) => patchScene(scene.id, { transitionType: e.target.value as 'cut' | 'dissolve', transitionDuration: .2 })}><option value="cut">直接切换</option><option value="dissolve">短叠化 · 0.2 秒</option></select></label><button className="text-button" disabled={busy} aria-pressed={scene.confirmed} onClick={() => patchScene(scene.id, { confirmed: !scene.confirmed })}>{scene.confirmed ? '已保留 · 点击取消' : '保留这段素材'}</button><small>{scene.selected.license} · {scene.selected.width} × {scene.selected.height}</small></div>}<button className="secondary find-footage" disabled={busy} onClick={() => setPicker(true)}><Search size={15}/> 搜索 / 替换素材<ArrowRight size={14}/></button></div>
      </aside>
    </div>
    {picker && <AssetPicker key={scene.id} scene={scene} format={project.format} providers={providers} used={project.scenes.filter((s) => s.id !== scene.id).flatMap((s) => s.selected ? [s.selected.id] : [])} onClose={() => setPicker(false)} onSelect={(asset) => { patchScene(scene.id, { selected: asset, start: 0, status: 'done', confirmed: true }); if (asset.provider === 'coverr') void api('/api/selection', { assetId: asset.id, projectId: project.id }).catch((error) => onError(error.message)); }} onResults={(candidates) => patchScene(scene.id, { candidates })} onError={onError}/>}
    {exportOpen && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="导出视频" className="export-dialog"><button className="icon-button export-close" aria-label="关闭导出面板" onClick={() => setExportOpen(false)}>×</button><div className={`export-icon ${job?.status === 'done' && latestReview?.passed ? 'success' : ''}`}>{job?.status === 'done' && latestReview?.passed ? <Check size={28}/> : job?.status === 'rendering' ? <LoaderCircle size={29} className="spin"/> : <Film size={27}/>}</div><h2>{job?.status === 'done' ? latestReview?.passed ? '视频已准备好' : '视频尚未完成' : job?.status === 'error' ? '这次导出没有完成' : job?.status === 'cancelled' ? '导出已取消' : 'Making your story.'}</h2><p>{job?.status === 'error' ? '这次制作未能完成，请重试。' : job?.status === 'rendering' ? '正在制作视频，请稍候…' : job?.status === 'done' ? latestReview?.passed ? '现在可以播放或下载视频。' : '还有画面或声音需要调整，请重新制作。' : '正在准备视频…'}</p>{job?.status === 'rendering' && <><div className="export-progress"><span style={{ width: `${job.progress}%` }}/></div><small>{job.progress}% · 正在制作</small><ProductionTiming task={activeTask} duration={total} count={project.scenes.length} startedAt={job.createdAt}/><button className="text-button" onClick={() => activeTask ? onCancel() : void fetch(`/api/exports/${job.id}`, { method: 'DELETE' })}>停止任务</button></>}{job?.status === 'done' && <><p className="export-spec">{project.videoProfile?.label || (project.exportUrl ? 'HD' : videoProfile.label)} · MP4 · {time(job.duration || total)} · {((job.size || 0) / 1024 / 1024).toFixed(1)} MB</p><video className="rendered-preview" src={job.url} controls playsInline aria-label="含实际转场和神经配音的成片预览"/>{latestReview?.passed && <a className="primary download-video" href={job.url} download={`${project.title}.mp4`}><Download size={17}/> 下载视频</a>}<div className="export-extras"><a href={`/api/exports/${job.id}/captions.srt`} download="captions.srt">字幕 SRT</a><a href={`/api/exports/${job.id}/sources.json`} download="sources.json">素材来源清单</a></div></>}{job?.status === 'error' && <button className="primary" onClick={() => void startExport()}>重新导出</button>}</section></div>}
  </div>;
}
