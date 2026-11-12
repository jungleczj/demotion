import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, Database, Globe2, KeyRound, LoaderCircle, Plus, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import { Config, Provider } from '../types';
import VisionConnection, { VisionDraft } from './VisionConnection';
import TopicCatalog from './TopicCatalog';

type Props = { config: Config | null; selected: Provider[]; onSelect: (providers: Provider[]) => void; onConfig: (config: Config) => void; onClose: () => void; onError: (message: string) => void };
export default function Settings({ config, selected, onSelect, onConfig, onClose, onError }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState('sources');
  const [saving, setSaving] = useState(false);
  const [pexelsKey, setPexelsKey] = useState('');
  const [pixabayKey, setPixabayKey] = useState('');
  const [coverrKey, setCoverrKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [youtubeDiscovery, setYoutubeDiscovery] = useState(config?.youtubeDiscovery !== false);
  const cloudManaged = config?.runtime === 'vercel';
  const [llmKey, setLlmKey] = useState('');
  const [llmBase, setLlmBase] = useState(config?.llmBase || 'https://api.deepseek.com');
  const [llmModel, setLlmModel] = useState(config?.llmModel || 'deepseek-flash');
  const [textProvider, setTextProvider] = useState<'vision' | 'openai'>(config?.textProvider || 'vision');
  const [vision, setVision] = useState<VisionDraft>({ visionProvider: config?.visionProvider || 'gemini', visionBase: config?.visionBase || 'https://generativelanguage.googleapis.com/v1beta', visionModel: config?.visionModel || 'gemini-3.8-flash', visionKey: '', visionEnabled: config?.visionEnabled ?? true });
  const [saved, setSaved] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const sources: { id: Provider; name: string; letter: string; description: string; connected: boolean; link: string; color: string }[] = [
    { id: 'commons', name: 'Wikimedia Commons', letter: 'W', description: '自然、历史、科学与公共影像', connected: true, link: 'https://commons.wikimedia.org', color: 'wiki' },
    { id: 'nasa', name: 'NASA Image & Video Library', letter: 'N', description: '航天、月球任务与地球观测', connected: true, link: 'https://images.nasa.gov/', color: 'nasa' },
    { id: 'archive', name: 'Internet Archive', letter: 'IA', description: '档案、旧影像与历史纪录片', connected: true, link: 'https://archive.org', color: 'archive' },
    { id: 'pexels', name: 'Pexels', letter: 'P', description: '城市、旅行、生活与商业素材', connected: Boolean(config?.pexelsConnected), link: 'https://www.pexels.com/api/', color: 'pexels' },
    { id: 'coverr', name: 'Coverr', letter: 'C', description: '旅行、生活与商业视频', connected: Boolean(config?.coverrConnected), link: 'https://api.coverr.co/docs/', color: 'pexels' },
    { id: 'pixabay', name: 'Pixabay', letter: 'px', description: '自然、旅行与生活视频', connected: Boolean(config?.pixabayConnected), link: 'https://pixabay.com/api/docs/', color: 'pixabay' },
  ];
  function toggle(id: Provider) { onSelect(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]); }
  async function save() {
    setSaving(true); setSaved(false);
    try { const next = await api<Config>('/api/config', { pexelsKey, pixabayKey, coverrKey, youtubeKey, youtubeDiscovery, llmKey, llmBase, llmModel, textProvider, ...vision }); onConfig(next); setPexelsKey(''); setPixabayKey(''); setCoverrKey(''); setYoutubeKey(''); setLlmKey(''); setVision((value) => ({ ...value, visionKey: '' })); setSaved(true); }
    catch (error) { onError((error as Error).message); } finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="settings-dialog" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="dialog-header"><div><div className="eyebrow">YOUR CREATIVE TOOLKIT</div><h2>素材与服务连接</h2></div><button className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={19}/></button></div><div className="settings-tabs"><button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Database size={15}/>素材来源</button><button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}><Sparkles size={15}/>制作服务</button><button className={tab === 'topics' ? 'active' : ''} onClick={() => setTab('topics')}><Globe2 size={15}/>主题导航</button></div>
      {tab === 'topics' ? <TopicCatalog/> : tab === 'sources' ? <div className="settings-body"><p className="settings-intro">选择生成时检索的来源。素材会自动准备，选择后即可使用。</p><div className="source-connections"><div className="source-connection"><div className="source-logo youtube">▶</div><div><strong>YouTube Data API<a href="https://developers.google.com/youtube/v3" target="_blank" rel="noreferrer" aria-label="打开 YouTube Data API"><ArrowUpRight size={13}/></a></strong><p>历史、人物与事件影像检索参考；原片需另行取得</p><span className={config?.youtubeConnected ? 'connected' : 'disconnected'}>{config?.youtubeConnected ? <><span className="green-dot"/> 已连接 · 检索参考</> : '需要 API key'}</span></div><button className={`check-toggle ${config?.youtubeConnected && youtubeDiscovery ? 'checked' : ''}`} aria-label="启用 YouTube 检索参考" aria-pressed={Boolean(config?.youtubeConnected && youtubeDiscovery)} disabled={!config?.youtubeConnected || cloudManaged} onClick={() => setYoutubeDiscovery((value) => !value)}>{config?.youtubeConnected && youtubeDiscovery && <Check size={14}/>}</button></div>{sources.map((source) => <div className="source-connection" key={source.id}><div className={`source-logo ${source.color}`}>{source.letter}</div><div><strong>{source.name}<a href={source.link} target="_blank" rel="noreferrer" aria-label={`打开 ${source.name}`}><ArrowUpRight size={13}/></a></strong><p>{source.description}</p><span className={source.connected ? 'connected' : 'disconnected'}>{source.connected ? <><span className="green-dot"/> 可用</> : '需要 API key'}</span></div><button className={`check-toggle ${selected.includes(source.id) ? 'checked' : ''}`} aria-label={`选择 ${source.name}`} aria-pressed={selected.includes(source.id)} disabled={!source.connected} onClick={() => toggle(source.id)}>{selected.includes(source.id) && <Check size={14}/>}</button></div>)}</div><div className="key-inputs"><label>Pexels API key<input type="password" autoComplete="off" readOnly={cloudManaged} value={pexelsKey} onChange={(e) => setPexelsKey(e.target.value)} placeholder={config?.pexelsConnected ? '已配置，留空保持现有密钥' : '已有 key 可填写；新 key 签发暂停（官方已确认）'}/></label><label>Coverr API key<input type="password" autoComplete="off" readOnly={cloudManaged} value={coverrKey} onChange={(e) => setCoverrKey(e.target.value)} placeholder={config?.coverrConnected ? '已配置，留空保持现有密钥' : '粘贴你的 Coverr API key'}/></label><label>Pixabay API key<input type="password" autoComplete="off" readOnly={cloudManaged} value={pixabayKey} onChange={(e) => setPixabayKey(e.target.value)} placeholder={config?.pixabayConnected ? '已配置，留空保持现有密钥' : '粘贴你的 Pixabay API key'}/></label><label>YouTube API key<input type="password" autoComplete="off" readOnly={cloudManaged} value={youtubeKey} onChange={(e) => setYoutubeKey(e.target.value)} placeholder={config?.youtubeConnected ? '已配置，留空保持现有密钥' : '粘贴你的 YouTube Data API key'}/></label></div><div className="source-note"><Globe2 size={15}/><p>YouTube 已接入后台检索，返回视频信息与来源线索；只有取得并核验授权原文件后，才会进入可剪辑素材列表。</p></div></div> : <div className="settings-body"><div className="ai-connection"><div className="ai-icon"><Sparkles size={22}/></div><div><strong>视频与配音服务</strong><p>连接后即可制作视频并试听声音。</p></div><span className={`connection-pill ${config?.visionConfigured ? 'online' : ''}`}>{config?.visionConfigured ? '已连接' : '未连接'}</span></div><div className="key-inputs"><label>服务密钥<input type="password" autoComplete="off" value={vision.visionKey} onChange={(e) => setVision((v) => ({ ...v, visionKey: e.target.value }))} placeholder={config?.visionConfigured ? '已连接，留空保持' : '粘贴你的服务密钥'}/></label></div><p className="settings-intro">声音提供免费使用额度，超额或计费账户按服务方案结算。</p></div>}

      <div className="settings-footer"><span><ShieldCheck size={14}/>{cloudManaged ? '连接由线上服务安全保存' : saved ? '已保存到当前本地服务会话' : '密钥仅在本机服务内存中使用'}</span><button className="primary" onClick={save} disabled={saving || cloudManaged}>{saving ? <LoaderCircle className="spin" size={15}/> : saved ? <CheckCircle2 size={15}/> : <KeyRound size={15}/>}{cloudManaged ? '已配置' : '保存连接'}</button></div>
    </dialog>;
}
