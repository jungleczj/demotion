# Long narration implementation and offline evidence — 2026-11-12

Status: implementation delivered for offline integration review. Real provider speech and the original Sea Wolf same-script acceptance remain pending. No replacement Sea Wolf script was created or used.

## Changes

- [server/narration-chunks.mjs](gomotion-mvp/server/narration-chunks.mjs): deterministic exact-text chunks, preferring sentence/paragraph endings and then clause/word endings. Each request contains at most 1,200 JavaScript characters and an estimated 60 seconds of narration. Unbroken oversized tokens fall back to Unicode-safe splits. Concatenating chunk text exactly reproduces the input, including whitespace and punctuation.
- [server/narration.mjs](gomotion-mvp/server/narration.mjs): long scripts use the selected Gemini voice, unchanged model, native-language instructions, and delivery instructions for every chunk. At most three provider transports run concurrently across this process. The existing bounded transport still owns retries and its 120-second total/three-attempt budget; there is no outer TTS retry loop.
- Each normalized complete chunk has an atomic receipt containing its request identity, byte count, duration and SHA-256. A manifest binds the entire script, voice, style/language instructions and model to the ordered chunk identities. A missing, changed, corrupt or unrelated artifact is not reusable. Completed receipts survive failure and cancellation. A damaged final assembly can be rebuilt from completed chunks without paid generation.
- The final WAV concatenates PCM samples in order, adds no crossfade or artificial join silence, performs no second silence-removal pass, verifies full decoding and verifies duration against the sum of the chunks. Long assemblies have no 600-second limit. A final receipt protects cache reuse.
- Previously complete project narration remains reusable after this upgrade when its exact old request key, selected voice/style/language, saved continuous/full-coverage track and matching decoded WAV all agree. Mere existence of an old long WAV does not approve it.
- [server/narration-timeline.mjs](gomotion-mvp/server/narration-timeline.mjs): reports private partial progress as `job.narrationProgress`; the root integration persists it in `project.narrationWork`. The existing complete-audio completeness, speaker-consistency and scene alignment pass remains authoritative before a narration track is exposed.
- [server/media-retention.mjs](gomotion-mvp/server/media-retention.mjs): saved tasks retain their partial narration directory and final receipt. Cache pruning protects active/current/persisted partial work and removes expired abandoned directories.
- [server/cloud/worker.mjs](gomotion-mvp/server/cloud/worker.mjs): checkpoint collection includes only matching manifest and complete chunk WAV/receipt pairs. Staged copies are checked again for matching bytes before upload. Private chunk files are excluded from the existing public artifact route. Cloud file-count admission and restored-terminal-task retry integration are being completed by the root agent separately.

## Observed failures before correction

The first long-script regression failed against the previous implementation: a roughly 9,000-character offline script reached the mocked provider as one request and failed the request-size assertion. The request was never sent to a real provider.

During implementation, the new legacy-cache test exposed a local variable-shadowing error; this was fixed and rerun. A pruning test initially supplied an incorrect work-root fixture and was corrected. The final focused run has no failures.

## Actual final focused verification

Command:

```sh
node --test outputs/gomotion-mvp/server/narration-long.test.mjs outputs/gomotion-mvp/server/narration-chunks.test.mjs outputs/gomotion-mvp/server/media-retention.test.mjs
```

Result: **18 tests passed; 0 failed, cancelled or skipped**. Raw output: [focused results](long-narration-focused-green-2026-11-12.txt).

The new long-narration test sets a fresh temporary `GOMOTION_DATA_DIR` before importing runtime-dependent modules, then removes that directory. Other focused fixtures use their own temporary directories. Coverage includes:

1. Bounded requests with exact original text and the chosen voice.
2. 25,000-character Chinese, English, emoji and unbroken-text splitting without character loss or surrogate-pair splits.
3. Partial-payment-error recovery without repeating completed TTS, corruption repair of one chunk, and final assembly repair using cached chunks only.
4. Continuous WAV duration exceeding 600 seconds, full decoding and cache reuse without another provider request.
5. Shared long work with independent subscriber cancellation and at most three in-flight requests.
6. Reuse of a previously aligned whole-film recording; refusal when its saved style identity differs.
7. Production-manager failure persistence: completed `narrationWork` retained, no incomplete `narrationTrack`, and no additional footage pass.
8. Active/persisted partial-cache pruning protection and abandoned-cache eviction.
9. Manifest identity separation for script/voice/style/model, cloud checkpoint and offline hydration integrity, invalid/missing receipt exclusion, and queued cancellation isolation.
10. Byte-for-byte equality of every assembled PCM sample with the supplied ordered source chunks.
11. Existing media-retention behavior plus saved partial-directory/final-receipt retention and release.

An earlier targeted run of existing request/cache/cancellation tests plus the then-current long tests passed **42 tests**. It was run before the test isolation issue was identified; later focused tests use isolated directories. The root agent separately checked that the saved user narration and video remain present ([saved media check](saved-task-media-recheck-2026-11-12.json)). Root-owned full regression and build results should be consulted for the complete application status.

## Practical limits and remaining acceptance

- Offline tones and deterministic PCM prove orchestration, persistence, byte preservation, duration and decoding. They do **not** establish intelligibility, naturalness, actual voice identity, provider availability or the original film's quality.
- The 1,200-character/60-second estimates are conservative request planning bounds, not provider-measured speech guarantees. Each returned chunk is defensively limited to 180 seconds; unexpected provider truncation is rejected rather than published.
- Different provider requests can still vary in prosody even with identical voice/style instructions. The existing complete-audio `speakerConsistent` and verbatim completeness check must pass, followed by real listening acceptance.
- The full-audio alignment call retains its existing 60-second model-call timeout and inline-audio approach. Actual long-recording alignment latency/provider limits have not been established offline. A long assembly passing a decoder does not prove a long film can pass real alignment.
- Longest accepted scripts may require substantial storage for both partial and assembled WAVs. The existing 96 MiB cache target permits retained/active task media to exceed that target rather than deleting required work.
- A process failure before a provider result has been normalized and its receipt written can require that unfinished request again. A remote worker failure can lose work completed after the most recent successful checkpoint. Completed, checked, retained/checkpointed chunks are reused.
- The exact original Sea Wolf source text remains unavailable. No same-script pass is claimed.
- The last known real provider response was HTTP 402. This work made no real provider call, submitted no production, restarted no local server, changed no credential and created no cloud resource. No commits, pushes or deployments were performed by this agent.

## 主代理集成与复核

独立代码复核发现两个具体问题，均先离线复现再修复：[修复前2项失败](long-narration-cloud-red-2026-11-12.txt)。

- 25,000中文字符会产生109个旁白分段，WAV/凭据及清单超过原200文件检查点上限。现授权上传仍每批最多200项，提交检查点最多2048项，回调请求上限3MB；身份、哈希及文件许可校验继续保留。[共享限制](gomotion-mvp/server/cloud/checkpoint-limits.mjs)、[控制面](gomotion-mvp/server/cloud/productions.mjs)。
- 恢复终止的本地任务原先会立即返回旧失败。现在优先复用活动任务，完成任务直接复用，明确重试的失败草稿以保存的项目和原来源设置重新提交，保留分段缓存。[执行器实现](gomotion-mvp/server/cloud/worker.mjs)。

[定向35项检查](long-narration-cloud-green-2026-11-12.txt)和[完整323项回归](long-narration-full-regression-2026-11-12.txt)均通过，0失败/取消/跳过；完整回归45.756秒，使用独立临时数据目录及已有媒体夹具。[类型检查](long-narration-typecheck-2026-11-12.txt)和[生产构建](long-narration-build-2026-11-12.txt)退出码均0。复核代理随后只读核对修复，未再发现重要运行问题。

[重复启动保护](startup-guard-progress-2026-11-12.md)随本次集成验证。未改变第10项脚本拆分代码、页面布局或所选模型/声音。真实新长旁白、长片在线对齐、自然度、成片完整覆盖和2倍耗时目标仍未通过；本轮实际模型请求0。

新版执行快照已准备：[快照记录](long-narration-cloud-snapshot-2026-11-12.json)。在独立Linux实例运行35项离线检查全部通过：[结构化结果](long-narration-linux-check-2026-11-12.json)、[完整日志](long-narration-linux-regression-2026-11-12.txt)；验收实例随后结束，没有运行用户制作任务。快照继续包含已验证的授权配乐缓存。正式环境已设置新版快照，待GitHub触发部署生效。

本地确认活动任务0后重载自有服务，3条原任务与状态保留；原旁白及成片Range206、健康/配置/声音/任务200，30声音/15语言：[实际重载后核对](long-narration-local-check-2026-11-12.json)。用户任务取消0、真实模型请求0。

## 发布确认（17:12）

[代码49bc3b0](https://github.com/jungleczj/demotion/commit/49bc3b07c00983b894b91fcc080dcae2d498e91f)已推送到指定GitHub main。自动正式部署READY，SHA与代码一致，[部署元数据](long-narration-deployment-state-2026-11-12.json)。正式域名配置和声音目录均200，render=true、30声音/15语言、YouTube已连接：[发布后只读核对](long-narration-online-check-2026-11-12.json)。本次没有实际新配音或新视频生成，不能将线上目录恢复、Linux音调测试或已完成快照部署计为真实新版长片通过。
