# 自动选曲与循环混音进展

日期：2026-11-12。最新状态：选曲、回退与无缝循环已实现，最终完整本地回归335/335通过；三首官方音乐已在云端实际取得并复制回本地，离线重启、选曲、实际探索曲混音通过。以下保留首次本地下载失败的历史证据；最新结果以文末“主代理集成复验”为准。人工听审和新版云端完整影片仍待验收。

## 实现范围

- 固定三首官方免费曲目，根据已有标题、题材和脚本确定性选择：纪录/回望、探索、紧张。脚本只计分一次；无完整脚本时才使用镜头文字，避免规划前后重复计分导致换曲。军事题材覆盖实际验收标题 `The 'Obsolete' British Missile That Could Shoot Down An Artillery Shell`。
- 优先验证并完整解码相关缓存；相关曲目缺失时可立即使用已校验的保守缓存。无可用缓存时最多同时准备目标曲与默认曲两首，各限 10 秒，总准备预算最多 20 秒。单首原件上限为 20,000,000 字节；不扫描或预存整库。
- 新下载必须重新核对该首官方页面的原件链接、逐曲 CC BY 4.0 声明及明确作者署名。仅有网站页脚的通用授权声明不能通过。收据保留页面 SHA-256、逐曲来源、许可、作者、音频 SHA-256、完整解码结果和传输凭据。
- `prepareBackgroundMusic(cacheDir, {project, ...})` 返回既有 source 及 selection；selection 包含请求曲、实际曲、回退原因与缓存/下载尝试。`prewarmCuratedMusic(cacheDir, {cacheOnly:true})` 对缺失或损坏的任一曲严格失败，禁止快照把单曲缓存误报为三曲。
- 混音版本 2 对需要循环的音轨生成一个原件长度以内的 FLAC 周期，用最多 0.35 秒的首尾交叉淡化接合；再重复这个周期，不展开整片临时音频。元数据明确 `loopCrossfadeSeconds`、`loopPeriodSeconds` 和 `sourceOffset`。
- 音乐响度仍至少比测得旁白低 14 LU，保留旁白增益 1，继续侧链压低与整片淡入淡出；目标时长与完整解码通过后才原子替换成片。没有新增界面、模型、TTS、音乐生成、YouTube API 或生产任务调用。

代码：[曲目与逐曲许可](gomotion-mvp/server/source-adapters/scottbuckley.mjs)、[下载/缓存](gomotion-mvp/server/music-sources.mjs)、[自动选择](gomotion-mvp/server/music-selection.mjs)、[循环与混音](gomotion-mvp/server/background-music.mjs)、[真实文件验收脚本](gomotion-mvp/scripts/verify-music-selection.mjs)。render、完成缓存兼容与云快照入口由主代理集成，本文不把入口集成等同于云整片已通过。

## 三首来源及首次本地传输状态（后续已由云端取得）

作者均为 Scott Buckley，许可为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，发布视频须保留该首署名及加工说明；YouTube 发布须在视频说明中署名。官方还要求与媒体同步使用，并禁止将改编音轨送入音频指纹系统，见[作者使用说明](https://www.scottbuckley.com.au/library/using-this-music/)。

| 曲目/用途 | 逐曲官方页与实际原件 | 文件状态 |
|---|---|---|
| Undertow / 纪录、回望 | [官方逐曲声明](https://www.scottbuckley.com.au/library/undertow/)、[官方 MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3) | 复用既有原件 10,000,906 字节，249.930975 秒；重启登记后离线 SHA 与完整解码通过；本轮下载 0 字节 |
| The Great Sea / 探索 | [官方逐曲声明](https://www.scottbuckley.com.au/library/the-great-sea/)、[官方 MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2024/01/TheGreatSea.mp3) | 官方 HEAD 为 11,279,896 字节；本地分段传输未完成，没有可用原件或有效完成收据 |
| Machina / 克制的紧张与未知 | [官方逐曲声明](https://www.scottbuckley.com.au/library/machina/)、[官方 MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_machina.mp3) | 官方 HEAD 为 11,639,298 字节；本地分段传输未完成，没有可用原件或有效完成收据 |

作者将 Machina 描述为电子科幻氛围；将其映射到克制的紧张配乐是本实现的编辑选择，未声称作者标注了“战争”题材。另一个候选 Decoherence 的官方 HEAD 为 24,727,749 字节，因超过本任务上限已排除，未下载其完整 MP3。GoMotion 的 American Frontiers 研究预览未进入此曲库。

## 已完成的证据

| 验证 | 实测结果 | 证据 |
|---|---|---|
| 定向离线检查 | 15/15，2.105 秒；涵盖按题材选择、军事标题、规划前后稳定、缓存重启/篡改、有限回退、逐曲许可、严格三曲快照、原件范围/版本、完整解码、预算与旁白保护 | [离线日志](music-selection-offline-tests-2026-11-12.txt) |
| 循环数值回归 | 对有硬跳变的测试斜坡音频，1.25 秒来源生成 0.9375 秒周期、0.3125 秒交叉淡化；重复边界相邻样本跳变小于 0.001；完整输出仍精确到目标时长 | [循环与混音检查](gomotion-mvp/server/background-music.test.mjs) |
| 真实 Undertow 循环接点 | 12 秒 AAC，接点在第 6 秒；交叉淡化 0.35 秒、周期 249.580979 秒；完整解码通过，0.779 秒完成 | [实际记录](music-selection-live-2026-11-12.json)、[可试听文件](gomotion-mvp/work/music-selection-acceptance/Undertow-loop-boundary.m4a) |
| 真实既有旁白混音 | 复用既有 WAV 的前 29 秒，无新 TTS；1280×720、29 秒、完整解码通过，2.240 秒。旁白 −16.3 LUFS，音乐目标 −30.3 LUFS，旁白增益 1 | [实际记录](music-selection-live-2026-11-12.json)、[可播放文件](gomotion-mvp/work/music-selection-acceptance/existing-narration-selected-mix.mp4) |
| 缺曲回退证据 | 上述混音项目请求 The Great Sea，因原件缺失明确回退到已验证的 Undertow；记录 `requestedTrackId`、`selectedTrackId`、`fallback:true`，没有把回退混音称作探索曲验证通过 | [来源及选择清单](gomotion-mvp/work/music-selection-acceptance/sources.json) |
| 本地新增两首下载 | 原生 fetch 两轮均失败；随后仅一次 curl HTTP/1.1 验收传输也失败，91.865 秒。每段继续保留真实响应头、版本、范围与长度检查；半文件均移除，没有登记成可用原件 | [原始下载记录](music-curated-download-live-2026-11-12.json) |

Undertow 原件 SHA-256：`4652007dad67295f1f5c87c8cbc8e2df1a530e7671266a29f693a084375d3910`。本轮循环试听文件 SHA-256：`afccde275caf9e25f41178ac42bae6b1990ff9f630fb0dcd2c22da764bb53193`。既有旁白 WAV SHA-256：`5a58efe6bafbbc4434dc5157a40c383def0dc1d0bf9fc63c67c6f1a4a1923114`。

## 首次本地传输限制与当时待验收项

- 本地网络最终在 The Great Sea 的 `3145728–3211263` 范围仅收到 39,943/65,536 字节；Machina 的 `4784128–4849663` 范围仅收到 55,943/65,536 字节。停止本地 MP3 重试，不把部分字节或官方 HEAD 当成完整文件证据。
- 当前三曲严格缓存验收因此失败，验收脚本正常返回非零；已有旁白/单曲回退仍可工作。主代理另行核对已授权 Linux 环境的直接网络与云缓存，结果须以独立实际记录为准。
- 尚缺两首实际原件、各自完整解码/SHA 收据与三曲离线复用；没有据此宣称自动选曲的三种情绪均已在真实文件中听审通过。
- 12 秒接点片段和 29 秒混音只证明文件、时长与既有声音处理；仍待人工听审、实际浏览器播放、新版云端完整影片与 15 分钟长片性能。没有将复用的声音或测试画面当作新版完整制作。

测试全部使用独立临时目录；未清理用户实际项目、提交生产任务、重启服务、取消任务、修改 TASKS、部署或操作 Git。

## 主代理集成复验

2026-11-12 18:49（Asia/Shanghai）。[一次限时云端缓存准备](music-cloud-cache-2026-11-12.json)成功：云内准备14,250毫秒，三首合计32,920,100字节，未调用任何模型或YouTube API，未提交视频任务，临时环境已停止。两首新增曲目均重新取得官方逐曲许可、作者与音频链接证据并通过完整解码；复制回本地后再次校验。此结果没有覆盖或删除前述本机超时记录。

- The Great Sea：11,279,896字节，SHA-256 `f2c2d69a0c89656e676c0fac3da23a201237951c8be7e77dcaa1705dca5b9cf8`。
- Machina：11,639,298字节，SHA-256 `72f479c583fd1cb894584c51d4fb9b33200b098bd1b13195bd41d29586d9d344`。
- 三首离线完整解码、散列、重启复用670毫秒；三类主题实际选中不同原件879毫秒；真实音乐循环接点792毫秒；29秒既有旁白配入实际The Great Sea 2,814毫秒，未回退，新增TTS 0。[独立实际复验](music-selection-three-track-live-2026-11-12.json)。本地试听路径沿用上表，因此最终文件已替换为探索曲版本；原先Undertow回退结果保留在旧JSON中。
- 渲染入口已传入项目，混音版本2落入成片来源清单；旧版未循环的完整混音可复用，旧硬循环或缺少凭据不可冒充新版；标题/题材改变选曲时不复用旧配乐。音乐失败提示在任务完成状态保留，诊断详情不进入普通界面。
- 独立只读复核发现的缓存题材匹配与丢失配乐失败提示两项均已修复并回归；其余循环、许可、取消与快照路径未发现重要问题。最终[完整本地回归335/335](music-selection-regression-2026-11-12.txt)，0失败/取消/跳过，47.553秒；类型检查与生产构建通过。首轮两个旧许可夹具及六个回环权限失败分别修正与在授权环境补验，保留[首轮日志](music-selection-regression-first-attempt-2026-11-12.txt)。

18:51补验：[新版云快照](music-selection-cloud-snapshot-2026-11-12.json)已预装三首原件与完整凭据，全部在Linux严格离线校验；[Linux回归31/31](music-selection-linux-tests-2026-11-12.txt)，0失败/取消/跳过，6.628秒，[结构化结果](music-selection-linux-check-2026-11-12.json)。正式项目的执行快照环境变量已指向该版本，待代码发布后核对正式部署。

本地先核对活动任务0，再重载本会话自有服务；[重载后检查](music-selection-local-check-2026-11-12.json)确认原3条任务与状态保留、健康/配置/声音/任务200、30声音/15语言、既有旁白和成片Range206。未提交新的真实视频或配音、未取消用户任务。

没有把已有旁白加测试底色画面称作新的完整视频生成，没有人工听感或浏览器验收结论。第11项另一次实际图片审核返回402，已停止，详见[独立请求结果](source-gap-application-review-2026-11-12.md)；该视觉服务失败不阻塞上述纯音乐流程。
