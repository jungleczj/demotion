import { parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { motionSVG, graphicTextLines, validateMotionPlan } from './motion-graphics-template.mjs';

const { plan: inputPlan, style, duration, profile, file, fontFile, marker } = workerData || {};
let plan, child;
const fontFamily = process.env.MOTION_FONT_FAMILY || (fontFile ? 'PingFang SC' : 'Arial');
const font = { loadSystemFonts: process.env.MOTION_SYSTEM_FONTS === '1', fontFiles: fontFile ? [fontFile] : [], defaultFontFamily: fontFamily };
const textCache = new Map();
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// Resolve font outlines once per label, not once per frame. The per-frame SVG has no text resources.
function drawText(label, x, y, size, color, anchor = 'middle', maxWidth = 800) {
  const key = JSON.stringify([label, size, color, anchor, maxWidth]);
  if (!textCache.has(key)) {
    const lines = graphicTextLines(label, size, maxWidth);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="-800 -100 1600 400"><text x="0" y="0" text-anchor="${anchor}" font-family="${escape(fontFamily)},Arial,sans-serif" font-size="${size}" font-weight="500" fill="${color}">${lines.map((line, i) => `<tspan x="0" dy="${i ? size * 1.35 : 0}">${escape(line)}</tspan>`).join('')}</text></svg>`;
    const outlined = new Resvg(svg, { font }).toString();
    textCache.set(key, outlined.slice(outlined.indexOf('>') + 1, outlined.lastIndexOf('</svg>')));
  }
  return `<g transform="translate(${x} ${y})">${textCache.get(key)}</g>`;
}

let errors = '', cancelled = false;
parentPort.on('message', (message) => { if (message === 'abort') { cancelled = true; child?.kill('SIGTERM'); } });
try {
  const narration = typeof inputPlan?.narration === 'string' ? inputPlan.narration : '';
  plan = validateMotionPlan(inputPlan, { id: inputPlan?.sceneId, text: narration }, narration);
  if (cancelled) throw new Error('动态图形制作已取消');
  child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${profile.width}x${profile.height}`, '-framerate', String(profile.fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2', '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  child.stderr.on('data', (d) => { errors = (errors + d).slice(-2000); });
  child.stdin.on('error', () => {});
  const exited = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`动态图形编码失败：${errors.slice(-500)}`))); });
  exited.catch(() => {});
  const count = Math.ceil(duration * profile.fps), started = Date.now();
  const sourceImages = new Map();
  for (const asset of plan.sourceAssets) {
    const pixels = await readFile(asset.decodedPath);
    if (createHash('sha256').update(pixels).digest('hex') !== asset.decodedSha256) throw new Error('实际来源图片文件已变化');
    sourceImages.set(asset.id, `data:image/png;base64,${pixels.toString('base64')}`);
  }
  // Decode and place the unchanged source once. Animate only explanatory annotation layers.
  const base = new Resvg(motionSVG(plan, style, 0, profile, marker, drawText, sourceImages, 'source'), { font: { loadSystemFonts: false } }).render().pixels;
  for (let i = 0; i < count; i++) {
    if (cancelled) throw new Error('动态图形制作已取消');
    const progress = count <= 1 ? 1 : i / (count - 1);
    const svg = motionSVG(plan, style, progress, profile, marker, drawText, sourceImages, 'overlay');
    const overlay = new Resvg(svg, { font: { loadSystemFonts: false } }).render().pixels;
    const pixels = Buffer.from(base);
    for (let j = 0; j < pixels.length; j += 4) {
      const alpha = overlay[j + 3];
      if (!alpha) continue;
      if (alpha === 255) { pixels[j] = overlay[j]; pixels[j + 1] = overlay[j + 1]; pixels[j + 2] = overlay[j + 2]; continue; }
      const a = alpha / 255;
      pixels[j] = Math.round(overlay[j] * a + pixels[j] * (1 - a));
      pixels[j + 1] = Math.round(overlay[j + 1] * a + pixels[j + 1] * (1 - a));
      pixels[j + 2] = Math.round(overlay[j + 2] * a + pixels[j + 2] * (1 - a));
    }
    if (i === Math.floor(count / 2)) await writeFile(`${file}.png`, new Resvg(motionSVG(plan, style, progress, profile, marker, drawText, sourceImages), { font: { loadSystemFonts: false } }).render().asPng());
    if (!child.stdin.write(pixels)) await once(child.stdin, 'drain');
  }
  child.stdin.end(); await exited;
  parentPort.postMessage({ done: true, durationMs: Date.now() - started, frames: count });
} catch (error) { child?.kill('SIGTERM'); parentPort.postMessage({ error: String(error.message || error) }); }
finally { parentPort.close(); }
