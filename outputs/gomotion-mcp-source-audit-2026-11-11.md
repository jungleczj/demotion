# GoMotion 公开 MCP、素材来源与 GitHub 核验

检索日期：2026-11-11（Asia/Shanghai）。目标产品固定为 **https://gomotionai.com**。对应 `TASKS.md` 第 5、7 项及补片机制调研。全程只读公开资料；未注册、付费、登录、提供密钥或调用生成任务；未修改应用代码。

## 结论

1. **公开 MCP / REST 文档不能确认视频画面的具体供应商，更不能确认主要供应来源。** 已披露的返回对象没有逐镜头素材、原始来源页、许可或候选素材列表。导出地址指向最终 MP4，不能代替素材溯源。
2. **音乐有直接官方来源声明。** [公开音乐目录](https://gomotionai.com/music/catalog.json) 顶层 `license` 为 `YouTube Audio Library — attribution not required`，`version` 为 `2026-07-25`。目录有 6 类情绪、13 首曲目，逐曲列 `file/title/artist/duration`。这仅确认官方对该目录的声明；没有逐曲许可原页，也不能据此断言视频画面来自 YouTube，或断言每条成片的音乐使用比例。
3. **本次没有找到可归属于目标 SaaS 的官方 GitHub 生成引擎源码、npm SDK 或 skill。** 找到了同名仓库，但它们指向其他域名；没有找到不代表不存在。官网确实发布 API 示例及 reseller starter kit，后者是订单/状态/下载站模板，不能当作视频生成引擎。
4. **官网证明实拍与动态图形能够混合出现；没有证明“素材检索失败 → 自动生成图表”的具体分支。** 技术论坛检索也未补足这条因果证据。
5. **无鉴权 MCP 初始化和工具发现均被拒绝。** 根代理经系统代理完成新鲜请求，`POST initialize` 与 `POST tools/list` 均收到 **HTTP 401**，错误信息要求 OAuth 或 GoMotion API key。尚未取得鉴权成功后的工具清单与运行时 schema。

## 公开接口与来源字段

| 对象 | 直接证据 / 原始字段 | 能确认什么 | 不能确认什么 |
|---|---|---|---|
| REST / OpenAPI | [官方开发文档](https://gomotionai.com/developers)；[OpenAPI](https://gomotionai.com/openapi.json)：`openapi=3.1.0`、`info.version=1.2.0`、server=`https://gomotionai.com`、业务路径 `/v1` | 公开业务契约 | 后台素材供应链 |
| 业务鉴权 | OpenAPI `security`: bearer 或 `X-API-Key`；文档 key 前缀 `gmk_live_`，需付费套餐 | 业务调用需要账户密钥 | OpenAPI 自身不证明 MCP 协议鉴权，后者由本轮 401 实测另行确认 |
| MCP | 文档：`https://gomotionai.com/mcp`、Streamable HTTP；仅代理 `/v1` 并读取公开音乐目录；无凭据 `initialize/tools/list` 实测均 401 | MCP 是业务 API 代理；公开端点拒绝这两类无鉴权请求 | 未取得鉴权后的工具 schema；未公开后台选材/生成源代码 |
| 已文档化工具 | `get_video/list_videos`、`export_video/get_export/list_exports`、voices/music、script/thumbnail 等 | 任务管理和导出 | 工具表未列素材搜索、候选、许可或逐镜头清单；实际 `tools/list` 尚未取得，不能声称这就是完整运行时工具集 |
| `components.schemas.Video` | `id/status/progress/project_id/estimated_duration_sec/cost_credits/refunded/error/created_at/updated_at/external_id/metadata`，`additionalProperties:false` | 项目和生成任务状态 | 无 `scenes/assets/provider/source_url/license`；`metadata` 是调用方写入并回显的数据，不能当后台来源 |
| `components.schemas.Export` | `download_url`、`download_url_expires_in_s`、文件名、任务字段，`additionalProperties:false` | 最终 MP4；描述注明签名链接 12 小时有效、文件保留 48 小时 | 无逐镜头 URL 和素材许可；下载存储/CDN/R2 不是素材供应商证据 |
| `References` / `ScriptCreate` | `videos[].id/title/url/thumbnail_url/duration_sec/views`；`channel_url/video_ids/reference_titles` | YouTube 脚本/缩略图风格参考 | 不能推出下载参考视频并剪进成片；不能把 `find_reference_videos` 当 footage 工具 |
| `VideoCreate` | `script/script_key/audio_key`、语言/声音、`animations/background`、音乐字段、成本上限等 | 用户可控输入 | 没有可据此识别主要视频素材库的参数 |
| `Upload` | `kind=audio/music`、`put_url/key` | 自有旁白或音乐上传 | 不是公开图库检索 |
| 音乐目录 | [`catalog.json`](https://gomotionai.com/music/catalog.json)：上述 `license` 字段及曲名作者 | **官方声明音乐来自 YouTube Audio Library** | 未披露逐曲 `license_url/source_url`；不是视频画面来源证据 |

字段依据：[官方 OpenAPI 原文](https://gomotionai.com/openapi.json)。`Video` 与 `Export` 的对象结构比“全文件关键词搜不到”更强；但这仍是公开契约检查，不能证明登录后的内部编辑器没有更丰富的项目 JSON。

### MCP 无鉴权探测的实际边界

| 只读请求 | 观测结果 | 证据解释 |
|---|---|---|
| Web 抓取 `GET https://gomotionai.com/mcp` | Web 工具报告 **405 Method Not Allowed** | GET 方式不被接受；不能据此推断 POST 鉴权行为 |
| 无 Authorization 的 `POST /mcp`，JSON-RPC `initialize` | 根代理经系统 `127.0.0.1:7897` 代理取得 **HTTP 401**；响应头及 body 见下方原文 | **已确认拒绝无鉴权初始化**，支持的授权方式在错误信息中列为 OAuth 或 API key |
| 无 Authorization 的 `POST /mcp`，JSON-RPC `tools/list` | 同样收到 **HTTP 401** 及下方错误内容 | **已确认拒绝无鉴权工具发现**；没有拿到成功工具清单或运行时 input/output schema |
| `GET /openapi.json` / `/developers` / `/music/catalog.json` | Web 工具成功读取正文 | 文档及音乐目录公开可读；该工具未返回原始 HTTP 状态，不补写 200 |
| [reseller kit](https://gomotionai.com/dev-templates/gomotion-reseller-kit.zip) | 官网确实链接此 ZIP；Web 工具因 `application/zip` 不受支持而未解包 | 确认官方分发入口；未审计 ZIP 内代码、依赖或许可证 |

新鲜探针由根代理在同一任务中通过 `configureNetwork` 使用系统代理后完成；请求目标均为 [官方 MCP 端点](https://gomotionai.com/mcp)，不携带 Authorization。`initialize.params` 使用 `protocolVersion:2025-03-26`、空 capabilities、`clientInfo:{name:"read-only-research",version:"1.0.0"}`；另一请求 method 为 `tools/list`。未调用 `tools/call`。两个响应的授权挑战与错误原文为：

```http
HTTP 401
WWW-Authenticate: Bearer resource_metadata="https://gomotionai.com/.well-known/oauth-protected-resource/mcp", scope="videos:read videos:write scripts:write thumbnails:write credits:read"
```

```json
{"jsonrpc":"2.0","error":{"code":-32001,"message":"Authentication required: connect GoMotion (OAuth), or send Authorization: Bearer gmk_live_... (your GoMotion API key)"},"id":null}
```

这是目标服务的实测拒绝响应，不是从文档推断；header 中的 [resource_metadata 地址](https://gomotionai.com/.well-known/oauth-protected-resource/mcp) 仅为服务返回的指针，本节未据此宣称已核验其元数据正文或完成 OAuth。早期未走可达代理时，curl exit 35 `Recv failure: Connection reset by peer` / fetch failed 没有 HTTP 响应；该网络失败记录已被上述新鲜 HTTP 观测补足，不再作为鉴权未知的理由。

官方文档提示 `claude mcp list` 的 Connected 只检查连接、并不检查 key，应通过余额调用检查 key；本轮实际无凭据 POST 的结果是 401。报告分别保留文档说明与端点当前行为，以 HTTP 实测确认无鉴权请求被拒绝。[鉴权与连接说明](https://gomotionai.com/developers)

## 直接证据、推断与未知

| 层级 | 结论 |
|---|---|
| 直接证据 | 官方首页展示按旁白匹配实拍及动态图形，举例包含 kinetic text、counter、map reveal；创建接口有 `animations` 开关。音乐目录给出 YouTube Audio Library 声明。[首页](https://gomotionai.com/)、[API](https://gomotionai.com/openapi.json)、[音乐](https://gomotionai.com/music/catalog.json) |
| 可作架构推断 | 同一成片需要将旁白、实拍、字幕、音乐、动态图形排进时间轴；公开任务/导出状态支持异步工作流。**这不是框架选型或后台代码的证明。** |
| 仍无法确认 | 视频画面主要来自 Pexels、Pixabay、YouTube、其他商业库或自建索引中的哪一种；各来源占比；是否抓取 YouTube 原片；实际 LLM/TTS/渲染器；候选排序；检索失败后的补片条件、次数、图表生成方式。 |

官网关于素材“能在网上找到就能找到”的表述不能识别供应商，也不是授权链证明。动态图形示例可能是按语义主动规划，也可能是补片、模板或用户调整；仅看完成片不能区分这些解释。[首页 FAQ 与动效示例](https://gomotionai.com/)

## GitHub / npm 归属核验

检索覆盖：GitHub repository search `gomotion`、`"gomotionai.com"`、`gomotion mcp`；GitHub code search `gomotionai.com`；公开网页搜索 `site:github.com "gomotionai.com"`、`"gomotionai.com" "github"`、`"gomotionai.com" "npm"`、`site:npmjs.com "gomotion"`。检索日见文首。仓库搜索命中与代码搜索命中是不同范围，不能互相代替。

| 仓库 / 官方入口 | owner、域名、API / key、反向链接、许可核验 | 判定 |
|---|---|---|
| 目标 [`gomotionai.com`](https://gomotionai.com/developers) | `/v1`、`gmk_live_`；首页和开发文档未发现 GitHub/npm 专属客户端链接。文档使用 `mcp-remote` 通用桥接器，公开 quickstart 与 reseller kit | 本次**未找到目标官方源码或 SDK**。文档提到 `upload_file` 的“local package”，但未给出可核验包名/源码，不能声称不存在 |
| [`gomotionai/gomotion-skill`](https://github.com/gomotionai/gomotion-skill) | owner=`gomotionai`；[README](https://github.com/gomotionai/gomotion-skill/blob/main/README.md) 指 `gomotion-ai.app`；[客户端](https://github.com/gomotionai/gomotion-skill/blob/main/scripts/gomotion.mjs) `DEFAULT_BASE_URL='https://gomotion-ai.app'`，API `/api/v1`；README key=`sk_…`；[LICENSE](https://github.com/gomotionai/gomotion-skill/blob/main/LICENSE) 版权明确写 `Go Motion (gomotion-ai.app)`，MIT；目标官网未发现反向链接 | 是**另一个域名的公开 skill/client**，不是完整后端生成引擎。与目标 SaaS 的关系**未获证明**；不能将其中的图片库、CREDITS、许可流水线归给目标 |
| [`gomotion-io/gomotion`](https://github.com/gomotion-io/gomotion) | owner=`gomotion-io`；仓库主页指 `www.gomotion.io`；[README](https://github.com/gomotion-io/gomotion/blob/main/README.md) 是 prompt→Remotion 动画、OpenRouter→结构化代码→浏览器 bundler/render；未建立目标官网反向链接；README 最后明确 `Proprietary - All rights reserved` | 同名 motion design 产品，**不是已确认的目标源码**；代码公开可见不等于允许开源复用，不能按 MIT 项目复制集成 |
| [`whoisjake/gomotion`](https://github.com/whoisjake/gomotion) | [仓库元信息](https://api.github.com/repos/whoisjake/gomotion) 描述 `A Leap Motion web socket consumer written in Go`，创建于 2013 年，MIT | Go 语言 Leap Motion 客户端，与目标 AI 视频 SaaS 无关 |
| [`frederickproctor/gomotion`](https://github.com/frederickproctor/gomotion) | [旧 README](https://github.com/frederickproctor/gomotion/blob/master/README) 指 Linux/Windows 说明，2015 年历史项目 | 旧同名项目，未纳入目标源码证据 |

GitHub code search 本次仅返回第三方[视频节目整理文档](https://github.com/Noesis-Boss/jaknyfe-skills/blob/91b3e4fc807829b847022f1e0b989ffdb6bb24ca/Skills/next-new-repo-watch/reports/-s4rbKbrO0w.md)，内容链接目标官网，而非其实现。搜索索引、权限、非默认分支及未被索引仓库会影响结果，因此保留“未找到”的限定。

## 真正相关的开源实现与可借鉴技术

以下三个项目均**没有已确认的 GoMotion 源码关系**。它们的代码与模块可直接核对，适合用来研究流水线；不把它们使用的供应商反推成目标的供应商。

| 项目、许可原文 | 直接可借鉴模块 | 集成限制 |
|---|---|---|
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)，[MIT](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/LICENSE) | [`llm.py`](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/app/services/llm.py)：`generate_script/generate_terms`；[`material.py`](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/app/services/material.py)：Pexels/Pixabay/Coverr 分别适配，`_material_source_record/_persist_material_sources` 记录来源及版本；[`task.py`](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/app/services/task.py) 串联任务；[`subtitle.py`](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/app/services/subtitle.py) 有转写及原稿校正 | 可商用、修改、分发，须保留 MIT 版权/许可。脚本关键词不能等于视觉验证；素材条款、TTS/模型及其他依赖另计。它是通用短视频流程，不能据此承诺历史事件精确镜头或长视频质量 |
| [short-video-maker](https://github.com/gyoridavid/short-video-maker)，[MIT](https://github.com/gyoridavid/short-video-maker/blob/main/LICENSE) | [`ShortCreator.ts`](https://github.com/gyoridavid/short-video-maker/blob/main/src/short-creator/ShortCreator.ts)：Kokoro→Whisper→Pexels→Remotion、按实测音频时长设 scene duration、排队；[`Pexels.ts`](https://github.com/gyoridavid/short-video-maker/blob/main/src/short-creator/libraries/Pexels.ts)：方向/尺寸/时长过滤、excludeIds 去重；[`mcp.ts`](https://github.com/gyoridavid/short-video-maker/blob/main/src/server/routers/mcp.ts) 与 REST 共用生成器 | MIT 可商用，保留许可；Remotion 另有商业条款。队列在内存，不能直接满足跨重启持久化；fallback 用 nature/globe/space/ocean 通用词，**会偏题**，不是动态图表补片。README 的当前流程主要面向英文短视频 |
| [Editly](https://github.com/mifi/editly)，[MIT](https://github.com/mifi/editly/blob/master/LICENSE) | [README 的 JSON/JS edit spec](https://github.com/mifi/editly/blob/master/README.md)：clips/layers/transition/audioTracks；[`src/ffmpeg.ts`](https://github.com/mifi/editly/blob/master/src/ffmpeg.ts)、[`src/audio.ts`](https://github.com/mifi/editly/blob/master/src/audio.ts)、[`src/transition.ts`](https://github.com/mifi/editly/blob/master/src/transition.ts)；[`src/sources`](https://github.com/mifi/editly/tree/master/src/sources) 的 canvas/GL/text/subtitle 自定义动态画面 | MIT 可商用，保留许可；这是编排与渲染层，没有事实规划、素材搜索或许可证判断。依赖本机 FFmpeg/GL 环境，FFmpeg 构建和分发义务需单独核对 |

这三个顶层 MIT 许可证均没有要求将整套自研 SaaS 开源；不能把此结论扩展到全部依赖。[FFmpeg 官方](https://ffmpeg.org/legal.html) 说明基本为 LGPL 2.1+，启用部分可选模块会使 FFmpeg 适用 GPL；[Remotion 官方许可页](https://www.remotion.dev/docs/license/pricing) 另列免费资格与公司商业许可。这是具体集成时需核对的边界，未对完整依赖树作法律审计。

### 按能力拆开看

| 能力 | 首选借鉴点 | 仍要自行解决 |
|---|---|---|
| 素材检索 | MoneyPrinterTurbo 多供应商适配与来源记录；short-video-maker 的方向/时长/去重 | 看过候选后的内容匹配、连续可用片段、来源许可快照 |
| 脚本规划 | MoneyPrinterTurbo `generate_script/generate_terms` | 旁白段落、检索单元、剪辑镜头解耦；上下文和事实一致 |
| 旁白时间轴 | short-video-maker 的音频时长驱动镜头；MoneyPrinterTurbo 字幕校正 | 全片同一人声连续音轨、重试不重录、不因短句改变节奏 |
| 动态图形 | Editly Canvas/GL/layers；同名 gomotion.io 的 Remotion 架构只能作概念参考 | 受控模板、事实数据来源、统一视觉风格；不复制 proprietary 代码 |
| 渲染 | Editly FFmpeg / audio / transition；short-video-maker Remotion | 实际解码、画幅清晰度、浏览器播放自然度及长片资源控制 |
| 异步任务 | MoneyPrinterTurbo task/state；short-video-maker MCP/REST 与 queue 分层 | 持久检查点、崩溃恢复、幂等付费调用、取消与权限边界 |

## 技术论坛与公开讨论覆盖

本轮做了以下检索，结果仅代表**公开搜索索引可见范围**，没有穷尽论坛历史、私群、登录内容、付费教程或未索引评论。

| 检索面 | 实际关键词 | 结果与边界 |
|---|---|---|
| Reddit | `site:reddit.com "gomotionai.com"`；`site:reddit.com "GoMotion AI"`；`site:reddit.com gomotion footage` | 未找到可归属于目标、直接披露供应商或失败补片实现的可靠帖子。放宽名称后出现大量无关 footage 内容，不作为证据 |
| Hacker News | `site:news.ycombinator.com "gomotionai.com"`；`site:news.ycombinator.com "GoMotion"`；`"gomotionai.com" "Show HN"` | 未找到目标实现披露。第三方 GitHub节目整理同时提 HackerTube/Hacker News，不能误认成目标 HN 源码讨论 |
| Indie Hackers | `site:indiehackers.com "gomotionai.com"`；`site:indiehackers.com gomotion` | 命中[2025-08-30 创作文章](https://www.indiehackers.com/post/i-think-we-built-a-billion-dollar-project-this-weekend-by-accident-2322083f9f)，其原文点名 **GoMotion.io**，排除；正文直接访问受 robots 限制，只有搜索摘录。不能迁移到目标 |
| GitHub 代码 / 仓库 / README | 见上一节 | 找到不同域名及第三方链接，没有目标后台源代码或 fallback 实现 |
| 全网技术词补搜 | `"gomotionai.com" fallback`；`"gomotion" "fallback" video`；`"gomotionai.com" "Pexels"`；`"gomotionai.com" "Pixabay"` | 出现营销分析和复刻建议，未出现可核实的官方实现记录；“建议使用某库”不等于目标使用该库 |

例如[第三方案例页](https://aimoneycases.vercel.app/en/cases/ai-youtube-documentary/) 自身写明 ElevenLabs/Pixabay 是其建议、创始人的供应商未公开；这类页面最多用于发现线索，不能证明目标技术。另一些分析混入 `gomotion-io/gomotion` 链接，更需要先核对域名。论坛观点、营销推测、其他产品 README 均未被计入目标技术的直接证据。

## 最小后续证据

- **取得鉴权后的完整工具清单：**需要已有合法授权会话的操作者提供成功 `tools/list` 的脱敏响应；移除 Authorization、Cookie、会话标识和签名。无鉴权被拒绝已由本轮 401 确认，无需再重复该探针；本轮不为此登录或获取密钥。
- **确认一条素材：**一个用户有权分享的项目导出/编辑器 JSON 或去敏感网络响应，至少含 `scene_id → asset_id → provider/source_page/license`；移除 Authorization、Cookie、临时签名、账户信息。一条完整 MP4 本身通常不足以证明素材供应商。
- **确认主要来源：**官方供应商披露，或跨多个主题/多个项目的逐镜头来源清单；报告项目数、抽样方式、素材时长或镜头数分母。单个片段的反向匹配只能证明该片段。
- **确认失败补片：**同一 scene 的检索请求/候选/失败原因/重试上限/最终动态图形选择的事件链，或官方教程/代码明确记录条件。完成片中出现图表不够。
- **确认源码归属：**目标官网反链至仓库/包、目标团队对归属的明确声明，或源码 API/base URL 与发布主体一致的可核验记录。不向用户索取密钥。

本报告已完成公开证据调研交付。无鉴权 MCP 初始化与工具发现返回 401 已确认；素材主库、鉴权成功后的工具清单与自动补片因果仍保留为未知。没有把未知包装成已证实的供应链结论。
