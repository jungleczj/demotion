import { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, LoaderCircle, Pause, Play, Search } from 'lucide-react';
import { api } from '../api';
import { languageOptions, narrationStyles, voiceOptions } from '../data';

type Props = { voice: string; style: string; language: string; onLanguage: (id: string) => void; onVoice: (id: string) => void; onStyle: (id: string) => void };

export default function VoiceLibrary({ voice, style, language, onLanguage, onVoice, onStyle }: Props) {
  const [query, setQuery] = useState('');
  const [available, setAvailable] = useState<string[] | null>(null);
  useEffect(() => { const abort = new AbortController(); void api<{voices: string[]}>('/api/voices', undefined, abort.signal).then((r) => setAvailable(r.voices)).catch(() => { if (!abort.signal.aborted) { setAvailable([]); setError('声音列表暂时无法加载，请刷新后重试。'); } }); return () => abort.abort(); }, []);
  const [filter, setFilter] = useState('全部声音');
  const [loading, setLoading] = useState('');
  const [audition, setAudition] = useState('');
  const [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const controller = useRef<AbortController | null>(null);
  const audioCache = useRef(new Map<string, AudioBuffer>());

  function stop() {
    controller.current?.abort();
    if (source.current) { source.current.onended = null; try { source.current.stop(); } catch {} source.current.disconnect(); }
    source.current = null; setLoading(''); setAudition('');
  }
  useEffect(() => { stop(); setError(''); }, [voice, style, language]);
  useEffect(() => () => { controller.current?.abort(); try { source.current?.stop(); } catch {} void context.current?.close(); }, []);
  async function listen(id: string) {
    if (id === audition || id === loading) { stop(); return; }
    stop(); setError(''); setLoading(id);
    const abort = new AbortController(); controller.current = abort;
    try {
      context.current ||= new AudioContext();
      await context.current.resume();
      if (abort.signal.aborted) return;
      const selectedLanguage = languageOptions.find((l) => l.code === language) || languageOptions[0];
      const key = `${id}:${style}:${selectedLanguage.code}`;
      let buffer = audioCache.current.get(key);
      if (!buffer) {
        const result = await api<{url: string}>('/api/narration', { voice: id, voiceStyle: style, language: selectedLanguage.code, text: selectedLanguage.sample }, abort.signal);
        const response = await fetch(result.url, { signal: abort.signal });
        if (!response.ok) throw new Error('试听暂不可用');
        buffer = await context.current.decodeAudioData(await response.arrayBuffer());
        if (abort.signal.aborted) return;
        if (audioCache.current.size >= 60) audioCache.current.delete(audioCache.current.keys().next().value!);
        audioCache.current.set(key, buffer);
      }
      if (abort.signal.aborted) return;
      const node = context.current.createBufferSource(); node.buffer = buffer;
      node.connect(context.current.destination); source.current = node;
      node.onended = () => { if (source.current === node) { source.current = null; setAudition(''); } };
      node.start(); setLoading(''); setAudition(id);
    } catch (error) {
      if (!abort.signal.aborted) { setLoading(''); setError(/402|429|额度|配额/.test((error as Error).message) ? '当前试听额度暂不可用，请稍后再试。' : '暂时无法试听，请稍后重试。'); }
    }
  }
  const tags = ['全部声音', ...new Set(voiceOptions.map((v) => v.tag))];
  const visible = voiceOptions.filter((v) => available?.includes(v.key) && (filter === '全部声音' || v.tag === filter) && `${v.name} ${v.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel voice-library" aria-label="旁白声音选择">
    <div className="section-heading"><div className="step-label"><span className="step-circle">2</span><h2>Voice</h2><span className="muted-small">选一个适合故事的声音</span></div><span className="soft-tag"><AudioLines size={13}/> {available === null ? '正在载入声音' : `${available.length} 种声音`}</span></div>
    <div className="language-choice"><label htmlFor="narration-language">旁白语言</label><select id="narration-language" value={language} onChange={(e) => { stop(); setError(''); onLanguage(e.target.value); }}>{languageOptions.map((l) => <option key={l.code} value={l.code}>{l.name} · {l.native}</option>)}</select><button className="secondary" disabled={Boolean(loading) && loading !== voice} onClick={() => void listen(voice)}>{loading === voice ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>}{audition === voice || loading === voice ? '停止试听' : `试听${languageOptions.find((l) => l.code === language)?.name || ''}`}</button></div><p className="language-hint">旁白与字幕将使用所选语言；原文会在制作时自动转换。</p>
    <div className="delivery-options"><span className="field-label">讲述方式</span><div role="group" aria-label="配音风格">{narrationStyles.map((s) => <button key={s.id} className={style === s.id ? 'active' : ''} aria-pressed={style === s.id} onClick={() => onStyle(s.id)}>{s.name}</button>)}</div></div>
    <div className="voice-library-toolbar"><div className="voice-filter" role="group" aria-label="声音筛选">{tags.map((tag) => <button key={tag} className={filter === tag ? 'active' : ''} aria-pressed={filter === tag} onClick={() => setFilter(tag)}>{tag}</button>)}</div><label className="voice-search"><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="搜索声音" placeholder="搜索声音"/></label></div>
    <div className="voice-library-grid">{visible.map((v) => <article key={v.id} className={`voice-choice-card ${v.id === voice ? 'selected' : ''}`}>
      <button className="voice-card-select" aria-pressed={voice === v.id} onClick={() => onVoice(v.id)}><span className={`avatar ${v.color}`}>{v.initials}</span><span><strong>{v.name}</strong><small>{v.description}</small><span className="voice-category">{v.tag}</span></span>{voice === v.id && <Check size={15} className="blue-text"/>}</button>
      <button className="voice-card-audition" aria-label={`${audition === v.id || loading === v.id ? '停止' : '试听'} ${v.name} · ${languageOptions.find((l) => l.code === language)?.name || ''}`} onClick={() => void listen(v.id)}>{loading === v.id ? <LoaderCircle className="spin" size={14}/> : audition === v.id ? <Pause size={14}/> : <Play size={14}/>}<span>{loading === v.id ? '准备中' : audition === v.id ? '停止试听' : '试听'}</span></button>
    </article>)}</div>
    {available === null && <p className="voice-empty" role="status"><LoaderCircle size={18} className="spin"/> 正在载入声音…</p>}{available !== null && !visible.length && <p className="voice-empty">没有找到对应声音，试试其他关键词。</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    <div className="voice-library-foot"><span>所有声音均按所选语言和讲述方式试听 · 全片统一声音</span><small>提供免费额度，超额或计费账户按服务方案结算。</small></div>
  </section>;
}
