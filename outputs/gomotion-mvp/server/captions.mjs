import style from '../shared/caption-style.json' with { type: 'json' };
import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function captionFontsDirectory() {
  if (process.env.CAPTION_FONTS_DIR) return path.resolve(process.env.CAPTION_FONTS_DIR);
  if (process.platform !== 'darwin') return undefined;
  const direct = '/System/Library/Fonts/PingFang.ttc';
  try { await stat(direct); return path.dirname(direct); } catch {}
  // Recent macOS versions keep PingFang in an on-demand font asset. CoreText
  // may advertise an unreadable reserved UI font for bold weights; explicitly
  // load the actual font file so libass never silently emits square boxes.
  const root = '/System/Library/AssetsV2/com_apple_MobileAsset_Font8';
  try {
    for (const entry of await readdir(root)) {
      const directory = path.join(root, entry, 'AssetData');
      try { await stat(path.join(directory, 'PingFang.ttc')); return directory; } catch {}
    }
  } catch {}
  return undefined;
}

export async function captionFilter(file) {
  const escape = (value) => value.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
  const fonts = await captionFontsDirectory();
  return `ass=filename='${escape(file)}'${fonts ? `:fontsdir='${escape(fonts)}'` : ''}`;
}

function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function parts(text) {
  const chinese = /[\u3400-\u9fff]/u.test(text);
  const words = chinese ? [...text] : text.split(/\s+/).map((s, i) => i ? ` ${s}` : s);
  const maximum = chinese ? 22 : 8;
  const balanced = Math.ceil(words.length / Math.max(1, Math.ceil(words.length / maximum)));
  const result = [];
  for (let i = 0; i < words.length; i += balanced) result.push(words.slice(i, i + balanced).join('').trim());
  return result.filter(Boolean);
}

export function makeAss(text, duration, width, height, offset = 0) {
  const scale = Math.min(width, height) / style.referenceShortSide;
  const size = Math.round(style.fontSize * scale);
  const marginX = Math.round(width * style.safeMargin), marginY = Math.round(height * style.safeMargin);
  const alpha = Math.round((1 - style.backgroundOpacity) * 255).toString(16).padStart(2, '0').toUpperCase();
  const base = `${style.fontFamily},${size}`;
  const tail = `-1,0,0,0,100,100,0,0`;
  const margins = `2,${marginX},${marginX},${marginY},1`;
  // Separate backing and glyph layers: the white fill is always opaque. A dark
  // box cannot wash out the text, and the thin solid outline survives scaling.
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Backing,${base},&HFFFFFFFF,&HFFFFFFFF,&H${alpha}000000,&H${alpha}000000,${tail},3,${style.boxPadding * scale},0,${margins}\nStyle: Default,${base},&H00FFFFFF,&H00FFFFFF,&H00000000,&H60000000,${tail},1,${style.outline * scale},${style.shadow * scale},${margins}\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const cues = parts(text);
  return header + cues.flatMap((part, index) => {
    const span = `${assTime(offset + duration * index / cues.length)},${assTime(offset + duration * (index + 1) / cues.length)}`;
    const safe = part.replace(/[{}\\\r\n]/g, ' ');
    return [`Dialogue: 0,${span},Backing,,0,0,0,,${safe}`, `Dialogue: 1,${span},Default,,0,0,0,,${safe}`];
  }).join('\n');
}
