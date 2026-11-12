// Bounded diagnostic for task 11. Never imports index.mjs, submits a job,
// searches a catalog, changes narration, or writes application task state.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { findSourceImagePlan, imageLicenseError } from '../server/source-images.mjs';
import { visionJSON } from '../server/vision-client.mjs';
import { configureNetwork } from '../server/network.mjs';
import { sourceLayout, validateMotionPlan } from '../server/motion-graphics-template.mjs';
import { outputProfile } from '../server/media-quality.mjs';
import { renderMotionGraphic } from '../server/motion-graphics.mjs';
import { probe, run } from '../server/process.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputs = path.dirname(app);
const work = path.join(app, 'work/source-gap-verification');
const reportFile = path.join(outputs, 'source-gap-application-review-2026-11-12.json');
const markdownFile = reportFile.replace(/\.json$/, '.md');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sceneId = 'baac21f7-5c79-44ca-9093-598ed9697eeb';
const mode = process.argv.includes('--review') ? 'review' : process.argv.includes('--render-reviewed') ? 'render-reviewed' : '';
if (!mode) throw new Error('Explicit --review or --render-reviewed mode required');
await mkdir(work, { recursive: true });
let secretValues = [];
const sanitized = (value) => JSON.parse(secretValues.reduce((serialized, key) => serialized.replaceAll(key, '[REDACTED]'), JSON.stringify(value)));
let report;
async function save() {
  report.updatedAt = new Date().toISOString();
  await writeFile(reportFile, JSON.stringify(sanitized(report), null, 2) + '\n');
}

if (mode === 'review') {
  // Persist a single-use guard BEFORE loading credentials or sending any call.
  // Reusing this script cannot silently spend a second request.
  await writeFile(path.join(work, 'one-request-claimed.json'), JSON.stringify({ at: new Date().toISOString(), maxModelHTTPRequests: 1 }), { flag: 'wx', mode: 0o600 });
  const research = JSON.parse(await readFile(path.join(outputs, 'penguin-source-gap-research-2026-11-12.json'), 'utf8'));
  const historicalFile = path.join(outputs, 'gomotion-penguin-motion-accepted-2026-11-11.json');
  const historicalBytes = await readFile(historicalFile);
  const historical = JSON.parse(historicalBytes).task.project;
  const originalScene = historical.scenes.find((scene) => scene.id === sceneId);
  if (!originalScene || originalScene.text !== '它们将蛋放在双脚上，' || !historical.script.includes('它们，就是帝企鹅。')) throw new Error('Historical scene identity changed');
  const scene = Object.fromEntries(['id', 'index', 'text', 'query', 'visual', 'duration', 'narrationAnchor'].map((key) => [key, originalScene[key]]));
  // The historical report is used only for exact text/context. Its old generated
  // diagrams or historic approval labels cannot become a current source approval.
  const project = { id: historical.id, title: historical.title, script: historical.script, format: historical.format, scenes: [scene] };
  const candidate = research.work.files.find((item) => item.id === 'commons-original');
  const sourceBytes = await readFile(candidate.path);
  if (sha(sourceBytes) !== candidate.sha256) throw new Error('Researched source original hash changed');
  const sourceProbe = await probe(candidate.path);
  if (sourceProbe.width !== 1800 || sourceProbe.height !== 1216) throw new Error('Source dimensions changed');
  const asset = {
    id: 'commons:PENGUIN_LIFECYCLE_H.JPG', provider: 'commons', sourceId: 'PENGUIN_LIFECYCLE_H.JPG', kind: 'image',
    title: 'Lifecycle of the Emperor Penguin — Zina Deretsky / NSF (2006)',
    description: 'Published emperor penguin scientific lifecycle illustration. Specific Commons file declares PD-US-NSF. The same work is Figure 1 in Jenouvrier et al. 2023, doi:10.3389/frym.2023.1052262 (article CC BY 4.0; no figure-specific exclusion observed). Original USAP item rights record was unavailable; current NSF general policy requires case-by-case checking. No new institutional permission obtained. Catalog identity and described content are not pixel evidence.',
    localPath: candidate.path, url: candidate.downloadUrl, sourceUrl: research.work.canonicalSourcePage,
    author: research.work.author, license: 'Public domain (specific Commons PD-US-NSF declaration)',
    licenseUrl: research.work.canonicalSourcePage + '#Licensing',
  };
  const queryPlan = {
    sceneId, mode: 'explicit-researched-candidate-no-live-query-planning',
    subject: { text: '帝企鹅', quote: '它们，就是帝企鹅。', aliases: ['帝企鹅', 'emperor penguin', 'Aptenodytes forsteri'] },
    queries: ['Lifecycle of the Emperor Penguin Zina Deretsky NSF'],
  };
  const env = parseEnv(await readFile(path.join(app, '.env'), 'utf8'));
  secretValues = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value).map(([, value]) => value);
  const config = {
    visionEnabled: true, visionProvider: env.VISION_PROVIDER || 'gemini', visionKey: env.VISION_API_KEY || env.GEMINI_API_KEY || '',
    visionBase: env.VISION_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta', visionModel: env.VISION_MODEL || 'gemini-3.8-flash',
  };
  if (!config.visionKey || /placeholder|REDACT|replace|your[_-]/i.test(config.visionKey)) throw new Error('Actual current vision credential unavailable');
  const network = configureNetwork();
  const job = { controller: new AbortController(), events: [], calls: 0, callLimit: 1, disableTransientRetries: true };
  report = {
    at: new Date().toISOString(), status: 'prepared', scene,
    scope: { diagnosticOnly: true, maxModelHTTPRequests: 1, modelHTTPRequests: 0, modelReviewCalls: 0, queryPlannerCalls: 0, liveCatalogSearches: 0, fixtureCatalogCalls: 0, ttsRequests: 0, audioGenerationRequests: 0, productionJobsSubmitted: 0, userJobsCancelled: 0, serviceRestarts: 0, productCodeChanged: false, plannerRecoveryOrSegmentationChanged: false, gitOrDeploymentOperations: 0, clipsRendered: 0, task11Accepted: false, wholeFilmAccepted: false },
    historicalIdentity: { reportFile: historicalFile, reportSha256: sha(historicalBytes), projectId: project.id, title: project.title, script: project.script, scriptSha256: sha(project.script), originalSceneDurationPreserved: scene.duration, historicalGeneratedDiagramApprovalsReused: false },
    configuration: { provider: config.visionProvider, model: config.visionModel, base: config.visionBase, credentialSource: 'existing local .env, parsed in memory; values never saved', retriesDisabled: true, callLimit: 1, network: { configured: network.configured, source: network.source } },
    source: { ...candidate, actualProbe: sourceProbe, actualSha256: sha(sourceBytes), bytes: sourceBytes.length, fixture: asset },
    rightsEvidence: research.rightsEvidence,
    rightsConclusion: 'Specific Commons public-domain declaration and Frontiers article CC BY evidence are recorded; original USAP item permission was not independently retrieved. No new permission or final legal clearance is asserted.',
    queryPlan, metadataLicenseGate: { error: imageLicenseError(asset), catalogMetadataAloneDoesNotApprove: true },
    manualSourceInspection: { actualOriginalViewed: true, method: 'view_image of original local file', applicationReview: false, observed: 'Published lifecycle illustration with three incubating adults at lower left, foot-level pale eggs highlighted by original red dashed circles, and an enlarged egg linked by existing red arrows. Adjacent hatchling drawings are distinct stages.', limitations: ['Scientific illustration, not live photography.', 'Static egg position does not demonstrate temporal placement or transfer.', 'Feet and eggs are a small portion of the complete graphic.', 'The enlarged egg is an existing callout, not an egg lying separately on the ice.'] },
    result: null, returnedReview: null, events: job.events,
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.href);
    if (init?.method === 'POST') {
      report.scope.modelHTTPRequests++;
      if (report.scope.modelHTTPRequests > 1) throw new Error('Diagnostic request cap reached');
      const evidence = { stage: `source-image-review-${sceneId}`, method: 'POST', serviceHost: url.hostname, startedAt: new Date().toISOString() };
      report.http = evidence;
      await save();
      try {
        const response = await realFetch(input, init);
        Object.assign(evidence, { respondedAt: new Date().toISOString(), httpStatus: response.status, contentType: response.headers.get('content-type'), stopOn401402403429: [401, 402, 403, 429].includes(response.status) });
        await save();
        return response;
      } catch (error) {
        Object.assign(evidence, { failedAt: new Date().toISOString(), errorName: error.name, errorCode: error.cause?.code || error.code || null });
        await save(); throw error;
      }
    }
    return realFetch(input, init);
  };
  await save();
  try {
    try {
      const response = await realFetch('http://127.0.0.1:3027/api/config', { signal: AbortSignal.timeout(5000) });
      const current = await response.json();
      report.currentService = { httpStatus: response.status, visionEnabled: current.visionEnabled, visionConfigured: current.visionConfigured, provider: current.visionProvider, model: current.visionModel, base: current.visionBase, matchesEnvironment: current.visionProvider === config.visionProvider && current.visionModel === config.visionModel && current.visionBase === config.visionBase };
      if (!response.ok || !report.currentService.matchesEnvironment) throw new Error('Current service configuration does not match existing environment');
    } catch (error) {
      report.currentService ||= { available: false, errorCode: error.cause?.code || error.code || error.name };
      throw error;
    }
    const result = await findSourceImagePlan(scene, project, path.join(work, 'pipeline-acquisition'), config, job, {
      providers: ['commons'], queryPlan,
      search: async () => { report.scope.fixtureCatalogCalls++; return { assets: [asset], warnings: ['Diagnostic candidate fixture: known researched source, no live source search and no query model.'] }; },
      review: async (reviewConfig, prompt, parts, reviewJob, stage) => {
        report.scope.modelReviewCalls++;
        if (report.scope.modelReviewCalls > 1) throw new Error('One-review diagnostic cap reached');
        const pixels = Buffer.from(parts.find((part) => part.mime === 'image/png').data, 'base64');
        const metadata = JSON.parse(parts.find((part) => part.text).text);
        report.reviewInput = { stage, imageMime: 'image/png', imageBytes: pixels.length, decodedSha256: sha(pixels), decodedWidth: metadata.source.width, decodedHeight: metadata.source.height, sourceOriginalSha256: candidate.sha256, fullFrame: true, scaleDownOnly: true, sourceLayout: sourceLayout({ width: metadata.source.width, height: metadata.source.height }, outputProfile(project.format)), promptSha256: sha(prompt), exactMetadataSent: metadata };
        await save();
        const returned = await visionJSON(reviewConfig, prompt, parts, reviewJob, stage);
        report.returnedReview = returned; await save();
        return returned;
      },
    });
    report.result = result;
    report.status = result.plan ? 'application_source_plan_approved_pending_manual_pixel_inspection' : 'application_rejected_candidate';
    report.normalProductionSourceGatesPassed = Boolean(result.plan);
  } catch (error) {
    report.status = report.http?.httpStatus && [401, 402, 403, 429].includes(report.http.httpStatus) ? 'stopped_provider_http_failure' : 'diagnostic_failed';
    report.error = error.message;
    report.normalProductionSourceGatesPassed = false;
  } finally {
    globalThis.fetch = realFetch;
    report.calls = job.calls; report.events = job.events;
    report.finishedAt = new Date().toISOString(); await save();
  }
} else {
  report = JSON.parse(await readFile(reportFile, 'utf8'));
  if (!report.normalProductionSourceGatesPassed || !report.result?.plan || report.http?.httpStatus !== 200 || !report.returnedReview) throw new Error('No real approved source plan; rendering refused');
  // This invocation must follow actual inspection of the returned JSON and
  // source pixels by the operator. It performs no provider request.
  await writeFile(path.join(work, 'one-clip-claimed.json'), JSON.stringify({ at: new Date().toISOString(), maxClips: 1 }), { flag: 'wx' });
  const plan = validateMotionPlan(report.result.plan, report.scene, report.historicalIdentity.script);
  const file = path.join(work, 'emperor-egg-source-diagnostic-6s.mp4');
  const signal = new AbortController().signal;
  const style = { background: '#323434', accent: '#b6bbbe', text: '#f4f7f8', muted: '#bacbd1' };
  const info = await renderMotionGraphic({ file, plan, style, duration: 6, format: 'landscape', signal, marker: '来源图示意' });
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], signal);
  const detail = JSON.parse(await run('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size', '-of', 'json', file], signal));
  report.clip = { file, sha256: sha(await readFile(file)), bytes: (await stat(file)).size, probe: info, detailedProbe: detail, fullDecodePassed: true, purpose: '6-second silent diagnostic only; original 2.08-second scene timing and project remain unchanged', narrationGenerated: false, actualNarrationIncluded: false, fullFilmReviewPassed: false, provenancePlan: `${file}.source-plan.json`, representativeFrame: `${file}.png`, newSyntheticBiologyOrMotion: false };
  report.scope.clipsRendered = 1;
  report.status = 'source_clip_rendered_pending_target_frame_inspection';
  await save();
}

report.stageOutcomes = {
  metadataLicenseCompleteness: report.metadataLicenseGate.error ? 'rejected' : 'passed_catalog_declaration_not_final_rights_clearance',
  originalHashAndFullFrameDecode: report.reviewInput ? 'passed' : 'not_reached',
  targetLayoutNoUpscaling: report.reviewInput ? 'passed' : 'not_reached',
  realVisualHTTP: report.http?.httpStatus ?? 'no_response',
  actualPixelReviewJSON: report.returnedReview ? 'returned' : 'not_returned',
  contentReviewAndAnnotations: report.normalProductionSourceGatesPassed ? 'passed' : report.returnedReview ? 'rejected' : 'not_reached',
  validatedRenderablePlan: report.normalProductionSourceGatesPassed ? 'passed' : 'not_created',
  renderer: report.clip ? 'completed' : 'not_called',
};
report.nextCorrectAction = report.http?.httpStatus === 402
  ? 'Restore prepayment credits for the current visual service, then retry actual image review within a new explicitly authorized call budget. Do not retry this run or label the image accepted; narration and complete-film audiovisual verification remain pending.'
  : report.normalProductionSourceGatesPassed
    ? 'Inspect actual returned labels/regions and pixels before the single permitted diagnostic rendering. Preserve original narration and timing; the complete source-backed film still requires actual narration and whole-film review.'
    : 'Keep the original scene unfilled; preserve actual rejection or service failure evidence and continue only with a valid source and the existing gates.';
await save();

const httpStatus = report.http?.httpStatus ?? '未取得 HTTP 响应';
const rejected = report.status === 'application_rejected_candidate';
const outcome = report.normalProductionSourceGatesPassed ? '应用来源计划通过；仍须核对实际输出画面' : rejected ? '实际视觉审核返回内容，但应用拒绝了候选' : '请求受阻，未取得应用来源计划通过证据';
const reviewText = report.returnedReview ? '\n\n实际返回 JSON：\n\n```json\n' + JSON.stringify(report.returnedReview, null, 2) + '\n```' : '';
const md = `# 第11项：科学插图的真实应用审核\n\n${report.at}。${outcome}。**第11项与原失败项目整片仍未验收。**\n\n原镜头：\`${sceneId}\`，原文“${report.scene.text}”。历史原稿与镜头来自已保存报告，仅取原文、主体与格式；旧自行绘图和旧审批未复用。原镜头时长 ${report.scene.duration.toFixed(3)} 秒，未修改。\n\n调用现有 \`findSourceImagePlan → acquireSourceImage → inspectSourceImage → validateMotionPlan\`。仅用1个已研究候选的显式目录夹具，零实时检索、零查询规划；保留来源/许可初筛、完整解码、原件与审查图哈希、目标布局清晰度、实际像素内容及注释全部门槛。\n\n本次视觉 HTTP 请求 ${report.scope.modelHTTPRequests} 次，实际状态 **${httpStatus}**；模型审查调用 ${report.scope.modelReviewCalls} 次，\`callLimit=1\` 且禁用瞬时重试。TTS、音频生成、任务提交、用户任务取消、服务重启、Git/部署均0。凭证仅从既有本地配置读入内存，报告不含凭证。\n\n来源：Zina Deretsky / NSF，2006年帝企鹅生命周期科学插图；实际原件 1800×1216，${report.source.bytes} 字节；SHA-256 \`${report.source.actualSha256}\`。这是来源插图，不能视为现场照片或放蛋动作的时间证据。${report.reviewInput ? `应用审查完整解码图 ${report.reviewInput.decodedWidth}×${report.reviewInput.decodedHeight}，SHA-256 \`${report.reviewInput.decodedSha256}\`；仅缩小，未裁切或放大。` : ''}\n\n## 实际结果\n\n状态：\`${report.status}\`。${report.error || ''}${reviewText}\n\n${report.result?.warnings ? '应用记录：\n\n' + report.result.warnings.map((warning) => '- ' + warning).join('\n') : ''}\n\n## 权利证据边界\n\n[Commons具体文件页](https://commons.wikimedia.org/wiki/File:PENGUIN_LIFECYCLE_H.JPG)声明PD-US-NSF；同图为[Frontiers文章图1](https://kids.frontiersin.org/articles/10.3389/frym.2023.1052262)，文章声明CC BY 4.0，所见图注没有单独排除。原USAP具体权利条目未取得；NSF现行通用政策仍需逐项核实。此记录保留出版与目录证据，不声称取得新的NSF授权或已经消除权利不确定性。元数据描述原样提供这一边界，目录名称不充当像素证据。\n\n## 下一步\n\n${report.normalProductionSourceGatesPassed ? '核对真实返回的标签、区域和原图像素后，才能用既有渲染器做至多1条5–8秒的来源图诊断样片；静图只能保留原图信息并高亮，不创造生物结构或动作。任何诊断样片都不能代替带真实旁白的原时长镜头及全片视听审查。' : rejected ? '保留当前缺口及实际拒绝原因。寻找更清晰、更集中且有明确复用许可的帝企鹅蛋在脚上的实图/已发表示意；继续沿现有门槛处理，不改原旁白、不伪造contentReview或注释。' : '先恢复当前视觉服务的实际鉴权、权限或额度，再在新的明确调用预算内继续审核；本轮立即停止，不重试、不切换提供方。旁白最近402与本次视觉请求分开记录，不推断其他接口恢复。'}\n\n${report.clip ? `已生成诊断文件：\`${report.clip.file}\`，6秒静音，完整解码通过；原镜头及旁白没有改动。目标尺寸细节可读性仍须看代表帧；本轮未追加模型审片。` : '本轮没有渲染补片。'}\n\n[完整结构化记录](source-gap-application-review-2026-11-12.json)；[前置来源与权利研究](penguin-source-gap-research-2026-11-12.md)。\n`;
await writeFile(markdownFile, sanitized({ text: md }).text);
console.log(JSON.stringify({ status: report.status, httpStatus: report.http?.httpStatus ?? null, modelHTTPRequests: report.scope.modelHTTPRequests, calls: report.calls, approved: report.normalProductionSourceGatesPassed, clip: report.clip?.file || null, reportFile, markdownFile }));
