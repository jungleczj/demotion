import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, CheckCircle2, ChevronDown, Clapperboard, Database, ExternalLink, Film, FolderOpen, HelpCircle, LayoutGrid, LoaderCircle, Menu, Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import Creator from './components/Creator';
import AssetCredit from './components/AssetCredit';
import Editor from './components/Editor';
import Settings from './components/Settings';
import { userMessage } from './userMessage';
import { api } from './api';
import useProductionTasks from './hooks/useProductionTasks';
import { Config, media, ProductionTask, productionActive, Project, Provider, time } from './types';

const STORAGE = 'gomotion-local-projects-v1';
const VIEW_STORAGE = 'gomotion-local-view-v1';
type Page = 'create' | 'editor' | 'projects';
function loadProjects(): Project[] { try { const value = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(value) ? value.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.scenes)).map((p: Project) => p.voice?.startsWith('gemini:') ? p : ({ ...p, voice: 'gemini:Kore', sequenceReport: undefined, videoReview: undefined, exportId: undefined, exportUrl: undefined, visualError: '配音已升级为神经声音，请重新运行 AI 选材，按真实音轨时长覆盖所有台词', scenes: p.scenes.map((s) => ({ ...s, confirmed: false, trimEnd: undefined, visualObservation: undefined })) })) : []; } catch { return []; } }
function loadWorkspace(): { projects: Project[]; project: Project | null; page: Page } {
  const projects = loadProjects();
  try {
    const view = JSON.parse(sessionStorage.getItem(VIEW_STORAGE) || '{}');
    const project = projects.find((p) => p.id === view.projectId) || null;
    const page = view.page === 'editor' ? project ? 'editor' : 'projects' : view.page === 'projects' ? 'projects' : 'create';
    return { projects, project, page };
  } catch { return { projects, project: null, page: 'create' }; }
}
export default function App() {
  const [initial] = useState(loadWorkspace);
  const [page, setPage] = useState<Page>(initial.page);
  const [config, setConfig] = useState<Config | null>(null);
  const [projects, setProjects] = useState<Project[]>(initial.projects);
  const [project, setProject] = useState<Project | null>(initial.project);
  const [providers, setProviders] = useState<Provider[]>(['commons', 'archive', 'nasa']);
  const [settings, setSettings] = useState(false);
  const [submitting, setSubmitting] = useState('');
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const projectRef = useRef<Project | null>(initial.project);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function notify(message: string) { setToast(userMessage(message)); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 9000); }
  function updateTask(task: ProductionTask) {
    const incoming = { ...task.project, productionUpdatedAt: task.updatedAt };
    setProjects((all) => {
      const old = all.find((p) => p.id === incoming.id);
      if ((old?.productionUpdatedAt || 0) >= task.updatedAt) return all;
      return [incoming, ...all.filter((p) => p.id !== incoming.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
    });
    const current = projectRef.current;
    if (current?.id === incoming.id && (current.productionUpdatedAt || 0) < task.updatedAt) { projectRef.current = incoming; setProject(incoming); }
  }
  const production = useProductionTasks({ onUpdate: updateTask, onFinished: (task) => notify(`《${task.project.title}》${task.message}`) });
  useEffect(() => { if (initial.project) void production.recover(initial.project, providers).catch(() => {}); }, []);
  const currentTask = project ? production.tasks[project.id] : undefined;
  const generating = productionActive(currentTask) || Boolean(project && submitting === project.id);
  const readConfig = () => api<Config>('/api/config').then((value) => { setConfig(value); setProviders((current) => [...new Set([...current, ...value.sources.filter((provider) => provider === 'pixabay' || provider === 'pexels' || provider === 'coverr')])]); setServiceError(''); }).catch((e) => setServiceError(e.message));
  useEffect(() => { void readConfig(); }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(projects)); } catch { notify('浏览器存储空间不足，请先下载项目文件'); } }, [projects]);
  useEffect(() => { try { sessionStorage.setItem(VIEW_STORAGE, JSON.stringify({ page, projectId: project?.id })); } catch {} }, [page, project?.id]);
  useEffect(() => () => { clearTimeout(toastTimer.current); }, []);
  function save(next: Project) { projectRef.current = next; setProject(next); setProjects((all) => [next, ...all.filter((p) => p.id !== next.id)].slice(0, 25)); }
  async function cancel() { if (currentTask) try { await production.cancel(currentTask.id); } catch (error) { notify((error as Error).message); } }
  async function remake(target: Project) {
    setSubmitting(target.id);
    try { await production.submit(target, providers); }
    catch (error) { notify((error as Error).message); }
    finally { setSubmitting((id) => id === target.id ? '' : id); }
  }
  async function generate(draft: Omit<Project, 'id' | 'createdAt' | 'scenes'>) {
    const next: Project = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), scenes: [] };
    save(next); setPage('editor'); await remake(next);
  }
  function navigate(next: 'create' | 'projects') { setPage(next); setMenu(false); }
  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`}><a className="brand" href="#" onClick={(e) => { e.preventDefault(); navigate('create'); }}><span>G</span><span className="brand-play"><PlayMark/></span><span>Motion</span><span className="brand-mvp">MVP</span></a><div className="nav-label">STUDIO</div><nav><button className={page === 'create' ? 'active' : ''} onClick={() => navigate('create')}><Plus size={18}/><span>Create</span></button><button className={page === 'projects' || page === 'editor' ? 'active' : ''} onClick={() => navigate('projects')}><FolderOpen size={18}/><span>Projects</span><span className="nav-count">{projects.length}</span></button><button onClick={() => setSettings(true)}><Database size={18}/><span>素材来源</span><span className="nav-status"/></button></nav><div className="nav-label account-label">WORKSPACE</div><nav><button onClick={() => setSettings(true)}><Settings2 size={18}/><span>设置与连接</span></button><a href="https://gomotionai.com/tutorial" target="_blank" rel="noreferrer"><HelpCircle size={18}/><span>参考教程</span><ExternalLink size={12}/></a></nav><div className="sidebar-bottom"><div className="local-plan"><div><span className="plan-icon"><Sparkles size={17}/></span><strong>Local workspace</strong><span className="plan-badge">FREE</span></div><p>把一个想法，变成第一个作品。</p><div className="plan-divider"/><span><CheckCircle2 size={13}/> 素材按需检索，原片不预存</span></div><button className="account-button" onClick={() => setSettings(true)}><span className="user-avatar">C</span><span><strong>Creator</strong><small>本地验证工作区</small></span><ChevronDown size={15}/></button></div></aside>
    {menu && <button className="nav-overlay" aria-label="关闭导航" onClick={() => setMenu(false)}/>}
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMenu(!menu)}><Menu size={20}/></button><Clapperboard size={15}/><span>Studio</span><span className="breadcrumb-slash">/</span><strong>{page === 'create' ? 'Create a video' : page === 'projects' ? 'Projects' : 'Video editor'}</strong></div><div className="topbar-right"><button className="connection-button" onClick={() => setSettings(true)}><span className={config ? 'green-dot' : 'blue-dot'}/>{config ? `${config.sources.length} sources connected` : 'Connecting…'}</button><span className="topbar-divider"/><button className="user-avatar" aria-label="打开工作区设置" onClick={() => setSettings(true)}>C</button></div></header>
      {serviceError && <div className="service-error">工作台暂时无法连接，请重试。<button onClick={readConfig}>重新连接</button></div>}
      {page === 'create' && <Creator config={config} providers={providers} onSources={() => setSettings(true)} onGenerate={generate} onError={notify}/>}
      {page === 'editor' && project && <Editor project={project} providers={providers} generating={generating} progress="" task={currentTask} taskConnectionLost={production.connectionLost} onRemake={remake} onChange={save} onBack={() => navigate('create')} onError={notify} onCancel={cancel}/>}
      {page === 'projects' && <div className="projects-page"><div className="page-heading"><div><div className="eyebrow">YOUR CREATIVE LIBRARY</div><h1>Projects<span className="heading-dot">.</span></h1><p>你的故事，都在这里。导出文件在本机临时保留 24 小时。</p></div><button className="primary" onClick={() => navigate('create')}><Plus size={17}/> New video</button></div>{!projects.length ? <div className="empty-projects"><div className="empty-project-icon"><FolderOpen size={34}/></div><h2>这里，等着你的第一个故事。</h2><p>从一段脚本开始，创建你的第一条视频。</p><button className="primary" onClick={() => navigate('create')}>Create a video<ArrowRight size={16}/></button></div> : <div className="projects-grid">{projects.map((item) => { const thumb = item.scenes.find((s) => s.selected)?.selected; const task = production.tasks[item.id]; return <article className="project-card" key={item.id}><button className="project-cover" onClick={() => { save(item); setPage('editor'); }}>{thumb ? <img src={media(thumb, true)} alt=""/> : <Film size={36}/>}<span className="project-cover-label">{productionActive(task) ? task?.status === 'queued' ? 'QUEUED' : 'MAKING' : item.videoReview?.passed ? 'READY' : item.exportUrl ? 'REVIEW' : 'DRAFT'}</span><span className="project-duration">{time(item.scenes.reduce((sum, s) => sum + s.duration, 0))}</span></button><div className="project-card-content"><h2>{item.title}</h2><AssetCredit asset={thumb}/><p>{productionActive(task) ? `${task?.status === 'queued' ? '等待制作' : '正在制作'} · 成片约 ${time(task?.estimate.videoSeconds || 0)} · 预计 ${Math.ceil((task?.estimate.minSeconds || 0) / 60)}–${Math.ceil((task?.estimate.maxSeconds || 0) / 60)} 分钟` : `${item.scenes.length} 个镜头 · ${new Date(item.createdAt).toLocaleDateString('zh-CN')}`}</p><div><button className="text-button" onClick={() => { save(item); setPage('editor'); }}>继续编辑<ArrowRight size={13}/></button><button className="icon-button" title="从浏览器项目列表移除" aria-label={`移除项目 ${item.title}`} onClick={() => setProjects((all) => all.filter((p) => p.id !== item.id))}><Trash2 size={15}/></button></div></div></article>; })}</div>}</div>}
    </div>
    {settings && <Settings config={config} selected={providers} onSelect={setProviders} onConfig={setConfig} onClose={() => setSettings(false)} onError={notify}/>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>}
  </div>;
}
function PlayMark() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5 12 8l-7 4.5z" fill="currentColor"/></svg>; }
function SearchMark() { return <LayoutGrid size={16}/>; }
