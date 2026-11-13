import assert from 'node:assert/strict';
import path from 'node:path';
import { run, probe } from '../server/process.mjs';

// Inspect an actual CUA fullscreen screenshot with a bright edge-to-edge scene.
// This measures the rendered picture, not CSS source text or mocked geometry.
const [image, format = 'portrait'] = process.argv.slice(2);
assert.ok(image && ['portrait', 'landscape'].includes(format), 'Usage: node scripts/check-fullscreen-preview.mjs IMAGE portrait|landscape');
const file = path.resolve(image), signal = AbortSignal.timeout(15000);
const info = await probe(file, signal);
const log = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-threads', '1', '-loop', '1', '-i', file,
  '-frames:v', '4', '-vf', 'cropdetect=limit=0.02:round=2:reset=0', '-an', '-f', 'null', '-'], signal, true);
const match = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].at(-1);
assert.ok(match, 'No visible picture could be measured; use a fullscreen screenshot with a bright scene');
const [width, height, x, y] = match.slice(1).map(Number);
const ratio = format === 'portrait' ? 9 / 16 : 16 / 9;
const expectedWidth = Math.min(info.width, info.height * ratio), expectedHeight = expectedWidth / ratio;
const result = { format, screenshot: { width: info.width, height: info.height }, picture: { width, height, x, y },
  expected: { width: expectedWidth, height: expectedHeight }, source: 'native-CUA-screenshot' };
console.log(JSON.stringify(result));
assert.ok(Math.abs(width - expectedWidth) <= 6 && Math.abs(height - expectedHeight) <= 6,
  'Fullscreen must preserve the project aspect ratio and show its complete picture');
assert.ok(Math.abs(x - (info.width - width) / 2) <= 4 && Math.abs(y - (info.height - height) / 2) <= 4,
  'Fullscreen picture must be centered');
