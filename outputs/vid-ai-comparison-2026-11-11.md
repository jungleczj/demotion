# vid.ai 的用户、视频类型与技术：对照 GoMotion

核查日期：2026-11-11。产品域名已实际访问并确认是 **https://vid.ai/**，页面署名 VidAI LLC。以下事实只来自双方官方页面和公开开发文档；没有登录付费账户、实际生成或测评成片。厂商名称表示 Vid.AI 官方披露，不代表我们审计了其后台调用。

## 结论

Vid.AI 面向经营不露脸频道的创作者，覆盖 YouTube 长视频以及 Shorts、TikTok、Reels。与 GoMotion 有明显重叠，但 Vid.AI 当前把真实素材、AI 图片、图生视频、动画主持人以及社交平台常见的聊天故事、分屏视频放进同一工具。GoMotion 的公开定位更集中于“已有脚本 → 真实素材 + 信息动画 → 完整 YouTube 视频”。[Vid.AI 官网](https://vid.ai/)、[GoMotion 官网](https://gomotionai.com/)

## 产品比较

| 维度 | Vid.AI | GoMotion |
|---|---|---|
| 主要用户 | 希望提高发布效率、经营不露脸频道的 YouTube / TikTok / Instagram 创作者 | 不露脸 YouTube 频道；官方突出历史、真实犯罪、财经、睡前故事 |
| 常见内容 | 官方示例有历史解释、太空科普、神秘故事、海洋知识、科技解释、假聊天记录故事、游戏背景分屏 | 官方突出纪录片、listicle、财经、睡前故事；依赖题材存在可检索的真实画面 |
| 长短视频 | 9:16 Shorts 与 16:9 长视频；Shorts API/MCP 的时长参数为 60 或 90 秒 | 官网突出长视频，一小时以上、50,000 字符脚本；可选择输出格式 |
| 当前长视频上限 | Starter 20 分钟；Plus/Pro 官网为 60 分钟；10 月 29 日更新亦宣布 Plus/Pro/Scale 可到 60 分钟 | 官网套餐标一小时以上 |
| 画面路线 | Storyblocks 真实素材；另可选 AI 图片和图片动画；可加入 5 秒 AI 片头 | 真实素材逐句配画面，加入 motion graphics；公开页面未明确承诺全文 AI 生成画面路线 |
| 主持人 | 自定义风格的绑定骨骼动画 avatar，有口型和手势，可放片头、片尾或中段 | 本次核查的公开页面未见 avatar 功能承诺 |
| 编辑 | 编辑脚本、单个场景、字幕和音乐；有时间线、替换素材、修单段配音 | 主张一键完成；FAQ 也说生成过程中可提前打开编辑器修改 |
| 语言 | 更新记录列英语、西/葡/法/德/意语及印地语；印地语配 Hinglish 罗马字字幕 | 官网称 14 种语言，每种 100+ 音色，可上传自己的旁白 |
| 供应商透明度 | 披露 Storyblocks、ElevenLabs 与多种视频模型 | 本次官方公开证据未披露素材供应商和完整内部模型清单 |

表中 Vid.AI 的定位和示例来自[官网](https://vid.ai/)，时长与套餐来自[定价页](https://vid.ai/pricing)，语言与近期改动来自[更新记录](https://vid.ai/changelog)，Shorts 参数来自[MCP 文档](https://vid.ai/docs/mcp)。GoMotion 列来自[其官网](https://gomotionai.com/)。

付费边界：Vid.AI 没有免费试用；月付公开价为 Starter $59、Plus $99、Pro $199。视频、动画和 avatar 使用额度；高级视频模型与 HD 图片有套餐限制，不能把套餐给出的基本视频数量理解为“任意选项都能生成这么多条”。[定价页](https://vid.ai/pricing)

## “用什么技术生成”可以确认到哪一层

| 环节 | 官方能确认的实现与名称 | 未披露的部分 |
|---|---|---|
| 脚本与分镜 | 输入主题或现有脚本，生成可逐段编辑的 sections | 脚本/分镜 LLM 的供应商与具体模型 |
| 真实视频素材 | Storyblocks 授权素材，官方称 300 万+，按脚本匹配；长场景补多个片段 | 检索、重排、视觉核对等内部算法 |
| AI 静态画面 | 12 种风格；可以与纯素材路线切换 | 图片基础模型及服务商 |
| AI 运动画面 | Moving frames / Moving images 可只动开头或全部场景；MCP 列 Wan 2.2、Seedance 1 Pro Fast、Kling 2.5 Turbo Pro | 各模型实际部署方式及模型之间的自动 fallback 规则 |
| 电影感片头 | 5 秒开场；MCP 列 Seedance 1 Pro Fast、Veo 3.1 Fast、Seedance 2.5，按套餐选择 | 提示词构建和后台调度逻辑 |
| 配音 | 官网明确标 ElevenLabs v4 / v2、33 位精选 narrator，也可添加 ElevenLabs Voice Library 音色 | 所有 voice engine 与底层型号的完整映射；不能自行把 Expressive 对应到某一型号 |
| 信息动画 | 更新记录披露 19 种可编辑模板；包括数字、图表、地图、流程、章节标题等，跟内容匹配 | 动画/渲染框架；没有证据可断言使用 Remotion、FFmpeg 或某个 JS 动画库 |
| 动画主持人 | 官方称生成 rigged animated avatar；口型、手势随旁白。MCP 的一个返回示例含 SVG avatar parts | 绑定、口型和动作的底层引擎；也不能将其笼统当成某家真人数字人服务 |
| 合成与交付 | 先生成媒体、再 render；异步状态、显式失败和重试，导出 1080p | 后台渲染集群、编码器及全部自愈策略 |

供应商披露见[官网](https://vid.ai/)与[定价页](https://vid.ai/pricing)，参数与生成/渲染分步见[MCP 文档](https://vid.ai/docs/mcp)，模板化信息动画见[更新记录](https://vid.ai/changelog)，avatar 定义见[官方 avatar 页](https://vid.ai/avatar)。

由上述公开接口可以作出的高置信度判断：这是把脚本、素材、TTS、信息动画及可选 AI 短镜头组合成成片的生产流水线。不能据此说“整条 60 分钟视频由一个文生视频模型直接生成”。本次也未找到官方承诺自动抓取网页截图作为配图的证据；上传照片/视频替换素材已由更新记录披露，但上传能力不等于自动网页截图采集。

## 官方页面存在的口径差异

- 官网、定价页、10 月 29 日更新支持最高 60 分钟；但 REST API 与 MCP 的长视频 `duration` 参数表仍写 1–20 分钟。应记录为“网页产品支持到 60 分钟，公开接口文档目前仍标 20 分钟”，未实际调用确认 API 的 60 分钟权限。[API](https://vid.ai/docs/api)、[MCP](https://vid.ai/docs/mcp)
- 官网/avatar 页还写 avatar 即将进入 MCP，而 MCP 文档已经列 `list_avatars`、`avatar` 参数。账户实际可用性应以授权后的发现接口为准，不能单靠营销页或一个文档示例断言全量开放。

## 对当前 MVP 的三点借鉴

1. **把真实素材、信息动画、AI 生成镜头做成明确的画面选择。** 基本版先完成可解释的素材匹配、旁白、字幕和信息动画；AI 镜头只在用户选定或内容确实需要时加入，并展示额外成本与等待时间。这是由 Vid.AI 的可选升级模式推导的产品建议。
2. **优先实现“修一段”。** 单段重录、替换素材、调整素材起点和时长、撤销，能把用户的修复成本限制在局部。Vid.AI 近期更新大量集中在这些工作，而不仅是首次一键生成。[官方更新记录](https://vid.ai/changelog)
3. **把预算和任务状态做实。** 借鉴 `estimate_credits` + `max_credits` 上限、媒体生成/最终渲染分步、失败重试、未交付选项退款。我们的界面可对应为预估费用、当前阶段、失败原因、重试范围；供应商失败不应静默换成低质量成片。[MCP 工作流与计费约定](https://vid.ai/docs/mcp)

最值得保存的四个 Vid.AI 原始入口：[官网](https://vid.ai/)、[定价](https://vid.ai/pricing)、[MCP 技术参考](https://vid.ai/docs/mcp)、[更新记录](https://vid.ai/changelog)。
