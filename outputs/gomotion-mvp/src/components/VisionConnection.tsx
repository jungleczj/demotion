import { Eye, ExternalLink } from 'lucide-react';
import type { Config } from '../types';

export type VisionDraft = { visionProvider: 'gemini' | 'openai'; visionBase: string; visionModel: string; visionKey: string; visionEnabled: boolean };
type Props = { config: Config | null; value: VisionDraft; onChange: (value: VisionDraft) => void };

export default function VisionConnection({ config, value, onChange }: Props) {
  const patch = (change: Partial<VisionDraft>) => onChange({ ...value, ...change });
  return <section className="vision-connection">
    <div className="ai-connection"><div className="ai-icon"><Eye size={22}/></div><div><strong>视觉 AI · 看画面、选素材、找片段</strong><p>Gemini 接收低清视频；兼容接口接收带时间戳的抽帧。</p></div><span className={`connection-pill ${config?.visionConfigured ? 'online' : ''}`}>{config?.visionConfigured ? '已配置' : '未配置'}</span></div>
    <label className="vision-enable"><input type="checkbox" checked={value.visionEnabled} onChange={(e) => patch({ visionEnabled: e.target.checked })}/>生成后自动运行视觉 AI 选材</label>
    <div className="key-inputs"><label>视觉服务<select value={value.visionProvider} onChange={(e) => patch(e.target.value === 'gemini' ? { visionProvider: 'gemini', visionBase: 'https://generativelanguage.googleapis.com/v1beta', visionModel: 'gemini-3.8-flash', visionKey: '' } : { visionProvider: 'openai', visionBase: 'https://api.openai.com/v1', visionModel: '', visionKey: '' })}><option value="gemini">Gemini · 原生视频分析</option><option value="openai">OpenAI 兼容 · 多图视觉模型</option></select></label>
      <label>视觉 API base URL<input value={value.visionBase} onChange={(e) => patch({ visionBase: e.target.value })}/></label>
      <label>视觉模型名称<input value={value.visionModel} onChange={(e) => patch({ visionModel: e.target.value })} placeholder={value.visionProvider === 'gemini' ? 'gemini-3.8-flash' : '填写服务支持的多模态模型名称'}/></label>
      <label>视觉 API key<input type="password" autoComplete="off" value={value.visionKey} onChange={(e) => patch({ visionKey: e.target.value })} placeholder={config?.visionConfigured ? '已配置，留空保持；切换服务地址需新密钥' : '填入视觉模型密钥，与素材库 key 分开'}/></label>
    </div>
    <p className="vision-limit-note">每批查看 2 段候选，不匹配时自动换候选并补搜，最多 4 批；只分析候选前 60 秒。视频按需解码并缓存，视频缓存上限 256MB，音频缓存上限 96MB。AI 与配音调用消耗账户额度。</p>
    <a className="text-button" href={value.visionProvider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://developers.openai.com/api/docs/guides/images-vision'} target="_blank" rel="noreferrer">{value.visionProvider === 'gemini' ? 'Gemini 密钥管理' : '视觉接口说明'}<ExternalLink size={12}/></a>
  </section>;
}
