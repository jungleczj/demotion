import { useEffect, useState } from 'react';
import { ArrowRight, AudioLines, Check, ChevronDown, Film, Globe2, Image, Layers3, LoaderCircle, Monitor, Play, Plus, ScanLine, Sparkles, Subtitles, WandSparkles } from 'lucide-react';
import { api } from '../api';
import { examples, languageOptions, voiceOptions } from '../data';
import { Config, MusicGenre, MusicOptions, Project, Provider, sourceLabels, time } from '../types';
import { topics } from '../catalog';
import VoiceLibrary from './VoiceLibrary';
import BackgroundPicker, { backgrounds } from './BackgroundPicker';
import ProductionOptions from './ProductionOptions';
import { estimateNarrationSeconds } from '../../shared/narration-duration.mjs';
import videoProfile from '../../shared/video-profile.json';
import scriptLimits from '../../shared/script-limits.json';

type Draft = Pick<Project, 'title' | 'script' | 'voice' | 'voiceStyle' | 'language' | 'format' | 'fit' | 'subtitles' | 'topic' | 'preserveScript'> & { background: NonNullable<Project['background']>; motionGraphics: boolean; musicOptions: MusicOptions };
type Props = { config: Config | null; providers: Provider[]; onSources: () => void; onGenerate: (draft: Draft) => void; onError: (message: string) => void };

function restoreMusic(music?: Partial<MusicOptions>): MusicOptions {
  const genres: MusicGenre[] = ['auto', 'epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];
  return { enabled: music?.enabled !== false, genre: genres.find((genre) => genre === music?.genre) || 'auto', volume: typeof music?.volume === 'number' && Number.isFinite(music.volume) ? Math.round(Math.min(100, Math.max(0, music.volume))) : 3,
    ...(typeof music?.trackId === 'string' ? { trackId: music.trackId } : {}),
    ...(music?.upload && typeof music.upload.id === 'string' && typeof music.upload.name === 'string' ? { upload: music.upload } : {}) };
}

export default function Creator({ config, providers, onSources, onGenerate, onError }: Props) {
  const [stored] = useState<Partial<Draft>>(() => { try { const value = JSON.parse(localStorage.getItem('gomotion-create-draft') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } });
  const [title, setTitle] = useState(typeof stored.title === 'string' ? stored.title : examples[0].title);
  const [script, setScript] = useState(typeof stored.script === 'string' ? stored.script : examples[0].script);
  const [voice, setVoice] = useState(voiceOptions.find((v) => v.id === stored.voice)?.id || 'gemini:Kore');
  const [voiceStyle, setVoiceStyle] = useState(stored.voiceStyle || 'documentary');
  const [preserveScript, setPreserveScript] = useState(stored.preserveScript === true);
  const [language, setLanguage] = useState(languageOptions.find((l) => l.code === stored.language)?.code || 'zh-CN');
  const [format, setFormat] = useState<Project['format']>(stored.format === 'portrait' ? 'portrait' : 'landscape');
  const [subtitles, setSubtitles] = useState(stored.subtitles !== false);
  const [fit, setFit] = useState<Project['fit']>(stored.fit === 'contain' ? 'contain' : 'cover');
  const [background, setBackground] = useState<NonNullable<Project['background']>>(backgrounds.find((item) => item.id === stored.background)?.id || 'blue');
  const [motionGraphics, setMotionGraphics] = useState(stored.motionGraphics !== false);
  const [musicOptions, setMusicOptions] = useState<MusicOptions>(() => restoreMusic(stored.musicOptions));
  const [musicUploading, setMusicUploading] = useState(false);
  const [tab, setTab] = useState('write');
  const [topic, setTopic] = useState('');
  const [writing, setWriting] = useState(false);
  const [topicId, setTopicId] = useState(stored.topic || 'auto');
  useEffect(() => { try { localStorage.setItem('gomotion-create-draft', JSON.stringify({ title, script, topic: topicId, voice, voiceStyle, language, preserveScript, format, fit, subtitles, background, motionGraphics, musicOptions })); } catch {} }, [title, script, topicId, voice, voiceStyle, language, preserveScript, format, fit, subtitles, background, motionGraphics, musicOptions]);
  const selectedVoice = voiceOptions.find((v) => v.id === voice)!;
  const duration = estimateNarrationSeconds(script, voiceStyle);
  const applyExample = (index: number) => { setTitle(examples[index].title); setScript(examples[index].script); setTab('write'); };
  async function writeScript() {
    setWriting(true);
    try { const result = await api<{ title: string; script: string }>('/api/write', { topic, language }); setTitle(result.title); setScript(result.script); setTab('write'); }
    catch (error) { onError((error as Error).message); } finally { setWriting(false); }
  }
  return <div className="create-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="blue-dot" /> YOUR NEXT STORY</div><h1>Create a video<span className="heading-dot">.</span></h1><p>写下故事，剩下的交给你的创作工作台。</p></div><span className="soft-tag"><Film size={14} /> 真实素材 · Script to video</span></div>
    <div className="creation-grid">
      <div className="creation-main">
        <section className="panel input-panel">
          <div className="section-heading"><div className="step-label"><span className="step-circle">1</span><h2>Input</h2></div><span className="muted-small">好视频，从好故事开始</span></div>
          <div className="input-tabs"><button className={tab === 'write' ? 'selected' : ''} onClick={() => setTab('write')}><Layers3 size={15} /> Write a script</button><button className={tab === 'ai' ? 'selected' : ''} onClick={() => setTab('ai')}><Sparkles size={15} /> Make it with AI</button></div>
          {tab === 'ai' ? <div className="ai-write"><div className="ai-icon"><WandSparkles size={24} /></div><h3>一个想法，就够了。</h3><p>描述视频主题，AI 会为你写一段可直接拆镜头的短脚本。</p><textarea aria-label="视频主题" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：用一分钟介绍阿波罗登月的旅程…" /><button className="primary" disabled={writing || !topic.trim() || !config?.aiConnected} onClick={writeScript}>{writing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} {config?.aiConnected ? writing ? '正在写作…' : '生成脚本' : '请先在设置中连接 AI'}</button></div> : <>
            <input aria-label="视频标题" className="title-input" placeholder="给你的视频取个名字…" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="script-input" aria-label="视频脚本" placeholder="粘贴你的旁白脚本。每一句话，都会成为一个画面的起点…" maxLength={scriptLimits.maxCharacters} value={script} onChange={(e) => setScript(e.target.value)} />
            <div className="script-foot"><span><span className="green-dot" /> 自动保存到浏览器工作区</span><span>{script.length.toLocaleString()} <span className="light">/ {scriptLimits.maxCharacters.toLocaleString('en-US')}</span></span></div>
          </>}
          <div className="example-strip"><span>试一个故事</span>{examples.map((example, index) => <button key={example.label} onClick={() => applyExample(index)}>{example.label}<ArrowRight size={12} /></button>)}<span className="script-duration" role="status" aria-live="polite" aria-label={`预计成片时长 ${time(duration)}`} title="按脚本字数和讲述节奏估算，最终以实际配音为准。">预计成片 <strong>≈ {time(duration)}</strong></span></div>
        </section>
        <VoiceLibrary preserveScript={preserveScript} voice={voice} style={voiceStyle} language={language} onLanguage={setLanguage} onVoice={setVoice} onStyle={setVoiceStyle}/>
        <BackgroundPicker value={background} onChange={setBackground}/>
        <section className="panel options-panel"><div className="section-heading"><div className="step-label"><span className="step-circle">4</span><h2>Visuals & options</h2></div><span className="muted-small">你的故事，你的风格</span></div><div className="topic-select"><label htmlFor="topic">内容主题</label><select id="topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="auto">自动识别主题 · 按镜头选择来源</option>{[...new Set(topics.map((item) => item.group))].map((group) => <optgroup label={group} key={group}>{topics.filter((item) => item.group === group).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup>)}</select><button className="text-button" onClick={onSources}>查看主题素材源 ↗</button></div><div className="options-grid">
          <div><label>画面比例</label><div className="segmented"><button className={format === 'landscape' ? 'active' : ''} onClick={() => setFormat('landscape')}><Monitor size={15} />16:9</button><button className={format === 'portrait' ? 'active' : ''} onClick={() => setFormat('portrait')}><ScanLine size={15} />9:16</button></div></div>
          <div><label>画面适配</label><div className="segmented"><button className={fit === 'cover' ? 'active' : ''} onClick={() => setFit('cover')}>满屏裁切</button><button className={fit === 'contain' ? 'active' : ''} onClick={() => setFit('contain')}>保留全幅</button></div></div>
          <div className="option-toggle"><span><Subtitles size={17} /> 旁白字幕</span><button className={`switch ${subtitles ? 'on' : ''}`} onClick={() => setSubtitles(!subtitles)} role="switch" aria-checked={subtitles} aria-label="旁白字幕"><span /></button></div>
        </div></section>
        <ProductionOptions preserveScript={preserveScript} onPreserveScript={setPreserveScript} motionGraphics={motionGraphics} onMotionGraphics={setMotionGraphics} music={musicOptions} onMusic={setMusicOptions} onMusicUploading={setMusicUploading} language={language} onLanguage={setLanguage}/>
      </div>
      <aside className="creation-aside">
        <div className="preview-card"><div className="preview-label"><span className="white-dot" /> FROM WORDS TO WONDER</div><div className={`preview-illustration ${format}`}><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="illustration-card card-back"><Image size={30}/></div><div className="illustration-card card-front"><div className="mini-mountains"><span/><span/><i/></div><div className="illustration-play"><Play size={21} fill="currentColor"/></div><div className="mini-caption">Your story. Brought to life.</div></div><span className="floating-chip chip-top"><AudioLines size={13}/> Voiceover</span><span className="floating-chip chip-bottom"><Film size={13}/> Real footage</span></div><div className="preview-copy"><h3>A whole editing crew.<br/><span>One click away.</span></h3><p>旁白、真实画面、字幕。<br/>从第一句话，到第一个完整作品。</p></div><div className="preview-spec"><span>{videoProfile.label}</span><span>MP4</span><span>{format === 'landscape' ? '16:9' : '9:16'}</span></div></div>
        <section className="panel summary-panel"><h3>Summary</h3><div><span>预计时长</span><strong>{time(duration)}</strong></div><div><span>配音</span><strong>{selectedVoice.name}</strong></div><div><span>字幕</span><strong>{subtitles ? '开启' : '关闭'}</strong></div><div><span>背景</span><strong>{backgrounds.find((item) => item.id === background)?.name}</strong></div><div><span>背景音乐</span><strong>{musicOptions.enabled ? `${musicOptions.upload ? '自选音频' : '开启'} · ${musicOptions.volume}%` : '关闭'}</strong></div><div className="source-summary"><span>素材来源</span><button onClick={onSources}>{providers.length} 个来源 <ChevronDown size={13}/></button></div><div className="source-chips">{providers.map((provider) => <span key={provider}>{sourceLabels[provider]}</span>)}<button onClick={onSources} aria-label="添加素材来源"><Plus size={12}/></button></div><div className="summary-divider"/><button className="primary generate-button" disabled={script.trim().length < scriptLimits.minCharacters || script.length > scriptLimits.maxCharacters || !providers.length || !config || config.render === false || musicUploading} onClick={() => onGenerate({ title: title.trim() || 'Untitled video', script, voice, voiceStyle, language, preserveScript, format, fit, subtitles, topic: topicId, background, motionGraphics, musicOptions })}><Sparkles size={17}/> Generate video <ArrowRight size={17}/></button><p className="summary-note"><Check size={12}/> {config?.render === false ? '视频制作服务尚未就绪，脚本会自动保存。' : '完整画面、旁白和字幕，一起完成。'}</p></section>
        <div className="small-note"><Globe2 size={16}/><span>每一段素材，都能查看原始来源。<br/>选择喜欢的声音，让故事自然展开。</span></div>
      </aside>
    </div>
    <footer className="workspace-footer"><span>Made for your next great story.</span><span>GoMotion 风格 · 本地 MVP</span></footer>
  </div>;
}
