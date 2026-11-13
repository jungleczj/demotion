# DeepSeek V4.1 Flash 角色切换与验收

日期：2026-11-13，时区 Asia/Shanghai。用户已选择 Gemini 保留整片视听审核；现有旁白服务保留。

## 模型与请求分工

| 环节 | 当前角色 | 输入及证据边界 |
|---|---|---|
| 脚本规划、检索词、目录排序、文字写稿 | DeepSeek V4.1 Flash（API ID `deepseek-flash`） | 文字；目录初筛不宣称看过画面。 |
| 候选镜头、整片画面编排、真实来源图片补片审核 | DeepSeek V4.1 Flash | 视频按现有时间网格抽帧；图片读取实际文件。抽帧不能替代连续视频或声音审查。 |
| 旁白生成与试听 | 原 Gemini TTS | 仍使用同一声音、语言、讲述方式；独立音频密钥与地址。 |
| 旁白时间对齐 | 原 Gemini 音频审核角色 | 实际读取音频确定边界，不能把音频交给仅支持文字和图片的 DeepSeek。已在聊天说明这一依赖。 |
| 最终成片视听审核 | 原 Gemini 审片模型 | 实际 MP4 及音轨，保留声音自然度、原文完整性、水印与过渡质量门槛。 |

官方[模型列表](https://api-docs.deepseek.com/api/list-models/)与[图片接口](https://api-docs.deepseek.com/guides/vision/)均确认 `deepseek-flash`。本次实际 GET /models 返回名称 DeepSeek-V4.1-Flash、输入 text/image、输出 text，[实际目录](deepseek-model-discovery-2026-11-13.json)。

## 已实现

- 新增[服务角色解析](gomotion-mvp/server/ai-services.mjs)，本地与 Vercel 使用相同配置。
- 文字和图片走官方兼容接口并关闭 thinking；服务错误脱敏涵盖所有角色密钥。
- 云端写稿不再硬编码 Gemini；配音、音频时间对齐和最终审核不再依赖主视觉密钥。
- 云工作程序在执行时接收各角色配置；复用快照不含任何凭证。
- 页面布局和用户操作未改；第10项脚本拆分逻辑未改。

## 验收证据

- [定向红灯记录](deepseek-routing-red-2026-11-13.txt)：7项新需求在旧代码中全部失败；随后[10项角色检查通过](deepseek-routing-green-2026-11-13.txt)。包含真实 FFmpeg 生成的离线音视频测试文件，确认最终审核请求发出带音轨MP4，不是替代静帧。模拟模型响应只证明路由，不证明真实自然度或实际审核通过。
- [完整回归](deepseek-full-regression-2026-11-13.txt)：369 tests、369 pass、0 fail、0 skip，使用独立临时任务目录；两项媒体等价检查提供现有HD样片，不跳过。
- [类型检查](deepseek-typecheck-2026-11-13.txt)与[构建](deepseek-build-2026-11-13.txt)通过。
- [一次实际读图](deepseek-image-live-2026-11-13.json)：HTTP200，约1.327秒，355输入/42输出tokens；识别海水、礁石和泡沫，与实际图像一致。只验证能力与凭证，不是第11项真实补片或整片质量批准。
- [本地启用](deepseek-local-activation-2026-11-13.json)：3027接口已返回新模型，30声音/15语言；确认活动0后重载自有服务，原4条终态任务及存档SHA不变。未重新执行错误任务。

## 云端与剩余验收

已生成[不含密钥的新执行快照](deepseek-cloud-snapshot-2026-11-13.json)，包含72个源码/资源文件和三首32.92MB已核验音乐；快照准备无模型调用。正式11项角色环境同步完成，[配置写入记录](deepseek-vercel-env-sync-2026-11-13.json)。新快照已配置。源码提交[5b3b874](https://github.com/jungleczj/demotion/commit/5b3b8748a61fa44397a4c6053eb840f15a0e8aff)已推送main；正式[部署日志](deepseek-production-deploy-2026-11-13.txt)显示READY并绑定正式域名。

[正式实测](deepseek-production-check-2026-11-13.json)：配置、健康、声音目录均200，模型deepseek-flash、render=true、30声音/15语言；一次短文字写稿HTTP200、约1.965秒。该次仅调用DeepSeek，不创建制作任务、不调用Gemini。云工作程序的角色传递与Linux快照已准备，但本轮没有用新工作程序生成完整视频。

本轮未重新调用已知402的 Gemini 配音/审片接口，未重新提交完整视频或重试用户任务。新完整云片、声音自然度、来源补片整片、第3项2倍速度与活动任务离页/刷新浏览器验收仍未通过。不能由一次读图推断这些已解决。

## 本轮调用与资源记录

DeepSeek模型目录GET一次（不做推理），实际推理两次：本地图片能力检查一次、正式短文字写稿一次。没有新Gemini调用、没有重新生成用户视频。按现有授权创建并停止一台快照准备环境，保存不含密钥的可复用快照；三首核验音乐缓存保留。新音频和完整视频仍需单独验收。
