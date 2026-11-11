import { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Copy, Search } from 'lucide-react';
import { libraries, topics } from '../catalog';

export default function TopicCatalog() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const [copied, setCopied] = useState('');
  const groups = ['全部', ...new Set(topics.map((topic) => topic.group))];
  const visible = useMemo(() => topics.filter((topic) => (group === '全部' || topic.group === group) && `${topic.name} ${topic.query} ${topic.hint} ${topic.sources.map((id) => libraries[id].name).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [query, group]);
  return <div className="topic-catalog"><p className="settings-intro">{topics.length} 个主题，{Object.keys(libraries).length} 个来源入口。按目录覆盖与用途组织；丰富程度仍需用你的实际脚本检索验证。</p><div className="catalog-search"><Search size={16}/><input aria-label="搜索主题或素材库" placeholder="搜索主题、关键词或素材库…" value={query} onChange={(e) => setQuery(e.target.value)}/></div><div className="catalog-groups">{groups.map((name) => <button key={name} className={group === name ? 'active' : ''} onClick={() => setGroup(name)}>{name}</button>)}</div><div className="topic-cards">{visible.map((topic) => <article className="topic-card" key={topic.id}><div className="topic-card-title"><h3>{topic.name}</h3><span>{topic.group}</span></div><p>{topic.hint}</p><div className="topic-sources">{topic.sources.map((id) => { const source = libraries[id]; return <a href={source.url} key={id} target="_blank" rel="noreferrer" title={source.detail}><span>{source.name}<ArrowUpRight size={12}/></span><small className={source.provider && ['commons', 'archive', 'nasa'].includes(source.provider) ? 'auto-source' : ''}>{source.access}</small></a>; })}</div><button className="query-example" title="复制示例检索词" onClick={() => { void navigator.clipboard.writeText(topic.query).then(() => { setCopied(topic.id); setTimeout(() => setCopied(''), 1800); }); }}><code>{topic.query}</code>{copied === topic.id ? <Check size={13}/> : <Copy size={13}/>}</button></article>)}</div>{!visible.length && <div className="empty-assets"><BookOpen size={28}/><p>没有匹配的主题，试试其他关键词。</p></div>}<div className="catalog-footnote">“已接入”可以在工作台内搜索；“前往查找”需在来源网站获取后手动导入；付费平台尚未接入其商业 API。素材库可能同时包含实拍、动画和 AI 内容，请查看单条说明。</div></div>;
}
