import { Globe2, Music2, Sparkles } from 'lucide-react';
import { languageOptions } from '../data';
import type { MusicOptions } from '../types';
import MusicPicker from './MusicPicker';

type Props = {
  motionGraphics: boolean; onMotionGraphics: (enabled: boolean) => void;
  music: MusicOptions; onMusic: (music: MusicOptions) => void;
  onMusicUploading: (uploading: boolean) => void;
  preserveScript: boolean; onPreserveScript: (enabled: boolean) => void;
  language: string; onLanguage: (language: string) => void;
};

export default function ProductionOptions({ motionGraphics, onMotionGraphics, music, onMusic, onMusicUploading, preserveScript, onPreserveScript, language, onLanguage }: Props) {
  return <section className="panel production-options" aria-label="视频制作选项">
    <div className="production-option-row">
      <span className="production-option-icon"><Sparkles size={19}/></span>
      <div className="production-option-copy"><h2>Motion graphics</h2><p>Charts, maps &amp; animated titles</p></div>
      <button type="button" className={`switch ${motionGraphics ? 'on' : ''}`} role="switch" aria-checked={motionGraphics} aria-label="Motion graphics" onClick={() => onMotionGraphics(!motionGraphics)}><span/></button>
    </div>
    <div className="production-option-row music-option-heading">
      <span className="production-option-icon"><Music2 size={19}/></span>
      <div className="production-option-copy"><h2>Background music</h2><p>给故事一点情绪与节奏</p></div>
      <button type="button" className={`switch ${music.enabled ? 'on' : ''}`} role="switch" aria-checked={music.enabled} aria-label="Background music" onClick={() => onMusic({ ...music, enabled: !music.enabled })}><span/></button>
    </div>
    <MusicPicker value={music} onChange={onMusic} onUploading={onMusicUploading}/>
    <div className="production-language">
      <div className="production-option-row"><span className="production-option-icon"><Globe2 size={19}/></span><div className="production-option-copy"><h2><label htmlFor="production-language">Language</label></h2><p>旁白与字幕使用同一语言</p></div></div>
      <select id="production-language" value={language} onChange={(event) => onLanguage(event.target.value)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.name} · {option.native}</option>)}</select>
      <label className="script-fidelity"><input type="checkbox" checked={preserveScript} onChange={(event) => onPreserveScript(event.target.checked)}/> 按原稿朗读，不自动翻译</label>
    </div>
  </section>;
}
