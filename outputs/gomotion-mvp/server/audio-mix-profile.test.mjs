import test from 'node:test';
import assert from 'node:assert/strict';

import { audioMixCompatible as compatible } from './audio-mix-profile.mjs';
const film = (version, looped, duration = 8) => ({
  videoProfile: { audioMixVersion: version },
  music: { status: 'mixed', mixed: true, narrationPreserved: true,
    source: { duration: 10, sha256: 'a'.repeat(64), fullDecode: true },
    mix: { version, continuous: true, start: 0, end: duration, looped,
      loopCrossfadeSeconds: looped ? .35 : 0, loopPeriodSeconds: looped ? 9.65 : 10 } },
});

test('a valid short legacy mix remains reusable without regenerating the film', () => {
  assert.equal(compatible(film(1, false)), true);
  assert.equal(compatible(film(1, true, 20)), false, 'old hard loops must be remixed');
  assert.equal(compatible(film(1, false, 20)), false, 'a false loop flag cannot cover a short source');
});

test('a new looped mix is reusable only with a valid seamless loop receipt', () => {
  const project = film(2, true, 20);
  assert.equal(compatible(project), true);
  project.music.mix.loopCrossfadeSeconds = 0;
  assert.equal(compatible(project), false);
  project.music.mix.loopCrossfadeSeconds = .35;
  project.music.mix.loopPeriodSeconds = 10;
  assert.equal(compatible(project), false);
});

test('missing or inconsistent music receipts cannot masquerade as completed mixes', () => {
  assert.equal(compatible(film(2, false)), true);
  for (const change of [
    (p) => { p.music.mixed = false; },
    (p) => { p.music.status = 'unavailable'; },
    (p) => { p.music.narrationPreserved = false; },
    (p) => { p.music.mix.version = 1; },
    (p) => { p.music.mix.looped = undefined; },
    (p) => { p.music.mix.end = NaN; },
    (p) => { p.music.mix.continuous = false; },
    (p) => { p.music.source.sha256 = ''; },
    (p) => { p.music.source.fullDecode = false; },
  ]) {
    const project = film(2, false); change(project);
    assert.equal(compatible(project), false);
  }
  assert.equal(compatible({}), false);
});
