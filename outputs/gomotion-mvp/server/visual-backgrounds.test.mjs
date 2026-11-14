import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { backgroundSVG, backgroundStyle } from './visual-backgrounds.mjs';
import { BACKGROUNDS } from '../shared/production-options.mjs';
import { fillMissingWithMotion } from './motion-graphics.mjs';
import { renderProject } from './render.mjs';

test('five original backgrounds rasterize at both output ratios and remain visually distinct', () => {
  for (const [width, height] of [[1280, 720], [720, 1280]]) {
    const hashes = new Set();
    for (const theme of BACKGROUNDS) {
      const image = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${backgroundSVG(theme, width, height)}</svg>`).render();
      assert.equal(image.width, width); assert.equal(image.height, height);
      hashes.add(createHash('sha256').update(image.pixels).digest('hex'));
    }
    assert.equal(hashes.size, 5);
  }
  assert.equal(backgroundStyle('unknown').theme, 'blue');
});

test('disabled motion cannot generate or retain an old motion selection', async () => {
  const footage = { id: 'footage', selected: { id: 'test:video' } };
  const project = { motionGraphics: false, scenes: [footage, { id: 'motion', selected: { id: 'test:motion', renderKind: 'motion-graphic' } }] };
  const job = { controller: new AbortController() };
  const result = await fillMissingWithMotion(job, project, '/unused', {});
  assert.equal(result.scenes[0], footage); assert.equal(result.scenes[1].selected, null);
  assert.deepEqual(result.sequenceReport.missingScenes, ['motion']); assert.equal(job.events.length, 0);
  await assert.rejects(renderProject(job, project, '/unused'), /已关闭/);
});
