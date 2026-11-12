import test from 'node:test';
import assert from 'node:assert/strict';
import { visionJSON } from './vision-client.mjs';

const query = await import('./source-image-query.mjs').catch(() => ({}));
const scenes = [
  { id: 'intro', text: '帝企鹅生活在南极。', query: 'emperor penguin antarctica', duration: 2 },
  { id: 'egg', text: '它们将蛋放在双脚上，', query: 'penguin feet snow', duration: 2 },
  { id: 'warm', text: '用腹部的育儿袋保温。', query: 'penguin brood pouch', duration: 2 },
];
const project = { script: scenes.map((scene) => scene.text).join(''), scenes, format: 'landscape' };
const planned = (id) => ({ sceneId: id, subject: { text: '帝企鹅', quote: '帝企鹅生活在南极。', aliases: ['emperor penguin', 'Aptenodytes forsteri'] }, queries: [{ subjectAlias: 'emperor penguin', detail: 'egg feet', quote: '它们将蛋放在双脚上，' }, { subjectAlias: 'Aptenodytes forsteri', detail: 'egg', quote: '它们将蛋放在双脚上，' }] });

// Dropping story/neighbor input or planning once per gap loses the exact species
// in the recorded pronoun-only failure and adds serial model latency.
test('one bounded batch plan grounds exact-subject queries in untouched story and neighboring narration', async () => {
  assert.equal(typeof query.planSourceImageQueries, 'function', 'batch image query planner is missing');
  const before = JSON.stringify(project), job = { controller: new AbortController(), events: [] };
  let calls = 0;
  const result = await query.planSourceImageQueries(project, [scenes[1], scenes[2]], {}, job, { planQueries: async (_config, _prompt, parts, plannerJob) => {
    calls++;
    const input = JSON.parse(parts[0].text);
    assert.equal(input.script, project.script);
    assert.equal(input.scenes[0].previous, scenes[0].text);
    assert.equal(input.scenes[0].next, scenes[2].text);
    assert.equal(plannerJob.callLimit, 1);
    return { scenes: [planned('egg'), { ...planned('warm'), queries: [{ subjectAlias: 'emperor penguin', detail: 'brood pouch', quote: '用腹部的育儿袋保温。' }] }] };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.plans.get('egg').queries, ['emperor penguin egg feet', 'Aptenodytes forsteri egg', 'Aptenodytes forsteri']);
  assert.equal(result.plans.get('egg').subject.text, '帝企鹅');
  assert.equal(result.budget.calls, 1);
  assert.equal(result.budget.limit, 1);
  assert.ok(result.budget.timeoutMs <= 15000);
  assert.equal(result.budget.status, 'completed');
  assert.equal(job.phaseBudgets.sourceImageQueries, result.budget);
  assert.equal(JSON.stringify(project), before, 'query planning cannot mutate scenes, script or timing');
});

test('three detailed variants still reserve one grounded entity query without weakening image acceptance', async () => {
  const result = await query.planSourceImageQueries(project, [scenes[1]], {}, { controller: new AbortController(), events: [] }, { planQueries: async () => ({ scenes: [{ ...planned('egg'), queries: [
    { subjectAlias: 'emperor penguin', detail: 'egg on feet', quote: scenes[1].text },
    { subjectAlias: 'emperor penguin', detail: 'holding egg on feet', quote: scenes[1].text },
    { subjectAlias: 'Aptenodytes forsteri', detail: 'egg on feet', quote: scenes[1].text },
  ] }] }) });
  assert.deepEqual(result.plans.get('egg').queries, ['emperor penguin egg on feet', 'emperor penguin holding egg on feet', 'Aptenodytes forsteri']);
  assert.equal(result.budget.calls, 1);
});

test('ungrounded identities and details are rejected without a second planning call', async () => {
  assert.equal(typeof query.planSourceImageQueries, 'function', 'batch image query planner is missing');
  for (const bad of [
    { ...planned('egg'), subject: { text: '王企鹅', quote: '王企鹅在南极。', aliases: ['king penguin'] } },
    { ...planned('egg'), queries: [{ subjectAlias: 'emperor penguin', detail: 'diving shark', quote: '鲨鱼正在潜水' }] },
  ]) {
    let calls = 0;
    const result = await query.planSourceImageQueries(project, [scenes[1]], {}, { controller: new AbortController(), events: [] }, { planQueries: async () => { calls++; return { scenes: [bad] }; } });
    assert.equal(calls, 1);
    assert.equal(result.budget.status, 'fallback');
    assert.ok(result.plans.get('egg').queries.some((text) => text.includes('帝企鹅')));
    assert.ok(!result.plans.get('egg').queries.join(' ').includes('king penguin'));
    assert.ok(result.plans.get('egg').queries.length <= 3);
    assert.ok(result.warnings.length);
  }
});

test('one unsupported detail cannot discard other grounded queries or become a search term', async () => {
  const entry = planned('egg');
  entry.queries.push({ subjectAlias: 'emperor penguin', detail: 'swimming shark', quote: '原文没有这句话' });
  const result = await query.planSourceImageQueries(project, [scenes[1]], {}, { controller: new AbortController(), events: [] }, { planQueries: async () => ({ scenes: [entry] }) });
  assert.equal(result.budget.status, 'completed');
  assert.deepEqual(result.plans.get('egg').queries, ['emperor penguin egg feet', 'Aptenodytes forsteri egg', 'Aptenodytes forsteri']);
  assert.ok(!result.plans.get('egg').queries.join(' ').includes('shark'));
});

test('planning quota errors and user cancellation stop without search fallback', async () => {
  assert.equal(typeof query.planSourceImageQueries, 'function', 'batch image query planner is missing');
  const job = { controller: new AbortController(), events: [] };
  await assert.rejects(query.planSourceImageQueries(project, [scenes[1]], {}, job, { planQueries: async () => { throw new Error('HTTP 402 insufficient credits'); } }), /402/);
  assert.equal(job.phaseBudgets.sourceImageQueries.calls, 1);
  assert.equal(job.phaseBudgets.sourceImageQueries.status, 'failed');
  const cancelled = { controller: new AbortController(), events: [] };
  await assert.rejects(query.planSourceImageQueries(project, [scenes[1]], {}, cancelled, { planQueries: async () => { cancelled.controller.abort(new Error('stop planning')); throw cancelled.controller.signal.reason; } }), /stop planning/);
});

// The shared client normally retries transient 429s. A planning allowance of
// one must also mean one HTTP request, rather than one call hiding retries.
test('image query planning stops a transient 429 after one actual HTTP request', async () => {
  const originalFetch = globalThis.fetch, job = { controller: new AbortController(), events: [] };
  let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ error: { message: 'too many requests' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '.001' } }); };
    await assert.rejects(query.planSourceImageQueries(project, [scenes[1]], { visionEnabled: true, visionKey: 'offline-fixture', visionModel: 'offline-fixture', visionProvider: 'compatible', visionBase: 'https://offline.invalid/v1' }, job), /429/);
    assert.equal(requests, 1);
    assert.equal(job.phaseBudgets.sourceImageQueries.calls, 1);
    assert.equal(job.phaseBudgets.sourceImageQueries.status, 'failed');
    assert.equal(job.events.find((event) => event.stage === 'source-image-query-plan')?.transientRetries, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('ordinary vision requests retain their existing transient 429 retry behavior', async () => {
  const originalFetch = globalThis.fetch, job = { controller: new AbortController(), events: [] };
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return requests === 1
        ? new Response(JSON.stringify({ error: { message: 'too many requests' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '.001' } })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { headers: { 'content-type': 'application/json' } });
    };
    const result = await visionJSON({ visionEnabled: true, visionKey: 'offline-fixture', visionModel: 'offline-fixture', visionProvider: 'compatible', visionBase: 'https://offline.invalid/v1' }, 'Read supplied test data.', [{ text: 'fixture' }], job, 'ordinary-offline-review');
    assert.deepEqual(result, { ok: true });
    assert.equal(requests, 2);
    assert.equal(job.events[0].transientRetries, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('a hanging planning HTTP request is aborted by its twelve-second allowance and falls back once', async () => {
  const originalFetch = globalThis.fetch, job = { controller: new AbortController(), events: [] };
  let requests = 0, requestSignal;
  // AbortSignal.timeout is unref'ed; keep the offline fake transport alive as a
  // real socket would be, without extending the production deadline.
  const keepAlive = setTimeout(() => {}, 17000), started = Date.now();
  try {
    globalThis.fetch = async (_url, options) => {
      requests++; requestSignal = options.signal;
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true });
        if (requestSignal.aborted) reject(requestSignal.reason);
      });
    };
    const result = await query.planSourceImageQueries(project, [scenes[1]], { visionEnabled: true, visionKey: 'offline-fixture', visionModel: 'offline-fixture', visionProvider: 'compatible', visionBase: 'https://offline.invalid/v1' }, job);
    assert.equal(requests, 1);
    assert.equal(requestSignal.aborted, true);
    assert.equal(result.budget.timeoutMs, 12000);
    assert.equal(result.budget.status, 'fallback');
    assert.match(result.warnings.join(' '), /规划超时/);
    assert.ok(Date.now() - started >= 11000 && Date.now() - started < 17000);
    assert.ok(result.plans.get('egg').queries.some((text) => text.includes('帝企鹅')));
  } finally { clearTimeout(keepAlive); globalThis.fetch = originalFetch; }
});
