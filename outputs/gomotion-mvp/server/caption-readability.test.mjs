import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assets } from './sources.mjs';
import { renderProject } from './render.mjs';
import { narrationAudio } from './narration.mjs';
import { fixtureAudioResponse } from './narration-fixture-utils.mjs';
import { playbackPath } from './playback.mjs';
import { run } from './process.mjs';

// Actual libass/FFmpeg pixels, with a flat grey backdrop. The artificial tone
// avoids provider requests; this checks text readability, never voice quality.
for (const [format, width, height] of [['landscape', 1280, 720], ['portrait', 720, 1280]]) {
  test(`${format} burned captions remain large, opaque white and separated from bright footage`, { timeout: 60000 }, async (t) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'caption-readability-'));
    const id = `upload:${randomUUID()}`;
    let audio;
    t.mock.method(globalThis, 'fetch', async (url) => {
      assert.ok(String(url).startsWith('https://caption-tts.invalid/'), 'no external calls in pixel regression');
      return fixtureAudioResponse([{ tone: 1.2 }]);
    });
    try {
      const file = path.join(folder, 'source.mp4');
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0xc0c0c0:s=${width}x${height}:r=30:d=2`, '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', file], t.signal);
      const asset = { id, provider: 'upload', kind: 'video', localPath: file, width, height, duration: 2 };
      assets.set(id, asset);
      const text = '字幕应该清晰，画面与声音自然流畅。';
      const project = { id: randomUUID(), title: 'Local caption pixel regression', script: text, voice: 'gemini:Kore', language: 'zh-CN', format, fit: 'cover', subtitles: true };
      const config = { visionProvider: 'gemini', visionEnabled: false, visionKey: 'local-fixture', visionBase: 'https://caption-tts.invalid' };
      audio = await narrationAudio({ text }, project, config, t.signal);
      const duration = Math.ceil((audio.duration + .22) * 30) / 30;
      project.scenes = [{ id: 'caption-scene', text, start: 0, duration, selected: asset, confirmed: true }];
      project.narrationTrack = { processingVersion: 2, key: audio.key, voice: project.voice, language: project.language, duration: audio.duration, scenes: [{ id: 'caption-scene', text, start: 0, end: duration }] };
      const job = { id: randomUUID(), events: [], controller: { signal: t.signal } };
      await renderProject(job, project, folder, config);
      assert.equal(job.status, 'done', job.error);
      const pixelsFile = path.join(folder, 'pixels.rgb');
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', '0.5', '-i', path.join(folder, job.id, 'video.mp4'), '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', pixelsFile], t.signal);
      const pixels = await readFile(pixelsFile);
      let top = height, bottom = -1, left = width, right = -1, white = 0, dark = 0;
      for (let y = Math.floor(height * .7); y < height; y++) for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 3;
        const [r, g, b] = pixels.subarray(p, p + 3);
        if (Math.min(r, g, b) >= 240) { white++; top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
        if (Math.max(r, g, b) < 65) dark++;
      }
      assert.ok(white > 350, `too few fully bright caption pixels: ${white}`);
      const shapes = new Set();
      let columnStart = -1, detailedGlyphs = 0;
      for (let x = left; x <= right + 1; x++) {
        const column = x <= right && Array.from({ length: bottom - top + 1 }, (_, row) => {
          const p = ((top + row) * width + x) * 3;
          return Math.min(...pixels.subarray(p, p + 3)) >= 240 ? '1' : '0';
        }).join('');
        if (column && column.includes('1')) { if (columnStart < 0) columnStart = x; }
        else if (columnStart >= 0) {
          let shape = '';
          for (let row = top; row <= bottom; row++) for (let col = columnStart; col < x; col++) {
            const p = (row * width + col) * 3;
            shape += Math.min(...pixels.subarray(p, p + 3)) >= 240 ? '1' : '0';
          }
          let interior = 0;
          for (let row = top + 4; row <= bottom - 4; row++) for (let col = columnStart + 4; col < x - 4; col++) {
            const p = (row * width + col) * 3;
            if (Math.min(...pixels.subarray(p, p + 3)) >= 240) interior++;
          }
          if (interior > 8) detailedGlyphs++;
          shapes.add(`${x - columnStart}:${shape}`); columnStart = -1;
        }
      }
      assert.ok(detailedGlyphs >= 5, `Chinese glyphs must contain real strokes, not hollow boxes: ${detailedGlyphs}`);
      assert.ok(shapes.size >= 5, `Chinese must have distinct glyphs, not repeated missing-font boxes: ${shapes.size} shapes`);
      assert.ok(bottom - top + 1 >= 28, `actual glyphs are too small at ${width}x${height}: ${bottom - top + 1}px`);
      assert.ok(dark > white, `dark backing must visibly separate letters from bright footage: ${dark} vs ${white}`);
      assert.ok(left >= width * .05 && right <= width * .95, 'captions remain inside horizontal safe area');
      assert.ok(bottom <= height * .94, 'captions remain above bottom safe area');
      const manifest = JSON.parse(await readFile(path.join(folder, job.id, 'sources.json'), 'utf8'));
      assert.ok(manifest.captionStyleVersion >= 2, 'the output records its caption style for cache eligibility');
      t.diagnostic(JSON.stringify({ format, actualGlyphHeight: bottom - top + 1, whitePixels: white, darkPixels: dark, realModelRequests: 0 }));
    } finally {
      const asset = assets.get(id); assets.delete(id);
      if (asset?.playbackKey) await Promise.all([playbackPath(asset.playbackKey), playbackPath(asset.playbackKey).replace(/\.mp4$/, '.jpg')].map((f) => rm(f, { force: true })));
      if (audio) await rm(audio.file, { force: true });
      await rm(folder, { recursive: true, force: true });
    }
  });
}
