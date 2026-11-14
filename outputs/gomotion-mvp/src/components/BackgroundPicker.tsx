import { Check } from 'lucide-react';
import type { BackgroundStyle } from '../types';

export const backgrounds: { id: BackgroundStyle; name: string; description: string }[] = [
  { id: 'blue', name: 'Blue', description: '清透蓝色 · 简洁现代' },
  { id: 'cinematic', name: 'Cinematic', description: '深色光影 · 沉浸叙事' },
  { id: 'vintage', name: 'Vintage', description: '纸张纹理 · 温暖复古' },
  { id: 'light', name: 'Light', description: '柔和留白 · 轻盈明亮' },
  { id: 'grid', name: 'Grid', description: '细线网格 · 清晰有序' },
];

type Props = { value: BackgroundStyle; onChange: (background: BackgroundStyle) => void };

export default function BackgroundPicker({ value, onChange }: Props) {
  return <section className="panel background-panel" aria-labelledby="background-heading">
    <div className="section-heading"><div className="step-label"><span className="step-circle">3</span><h2 id="background-heading">Background</h2></div><span className="muted-small">为故事选择底色</span></div>
    <div className="background-grid" role="group" aria-label="视频背景">
      {backgrounds.map((background) => <button key={background.id} type="button" className={`background-card ${value === background.id ? 'selected' : ''}`} aria-pressed={value === background.id} onClick={() => onChange(background.id)}>
        <span className={`background-swatch background-preview-${background.id}`} aria-hidden="true"><span className="background-sample-line"/><span className="background-sample-line short"/><span className="background-sample-frame"/></span>
        <span className="background-card-copy"><span><strong>{background.name}</strong><small>{background.description}</small></span><span className="background-selected" aria-hidden="true">{value === background.id && <Check size={13}/>}</span></span>
      </button>)}
    </div>
  </section>;
}
