import test from 'node:test';
import assert from 'node:assert/strict';
import * as planner from './planner.mjs';
import { prepareNarrationTimeline } from './narration-timeline.mjs';

test('verbatim mode passes the original script unchanged without a translation call', async () => {
  const script = '  A title.\r\n\r\nA line with two  spaces and a “quotation”.\n';
  assert.equal(await planner.scriptForNarration({ script, language: 'en', preserveScript: true }, {}, undefined, () => { throw Error('unexpected translation'); }), script);
});

test('normal mode still translates into the selected language', async () => {
  const script = 'Original line with no changes.';
  const converted = await planner.scriptForNarration({ script, language: 'zh-CN' }, {}, undefined, (_config, _system, json) => {
    assert.equal(JSON.parse(json).script, script);
    return { script: '这是翻译成中文之后的完整台词。' };
  });
  assert.equal(converted, '这是翻译成中文之后的完整台词。');
});

test('verbatim mode refuses a storyboard that silently drops script content', async () => {
  const project = { preserveScript: true, script: 'Sentence one. Sentence two.', scenes: [{ id: 's1', text: 'Sentence one.' }] };
  await assert.rejects(prepareNarrationTimeline(project, {}, { controller: new AbortController() }, '/unused'), /原稿/);
});
