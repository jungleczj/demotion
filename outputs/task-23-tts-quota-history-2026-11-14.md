# 配音每日额度与历史接口核对

2026-11-14，Asia/Shanghai。此历史审计只读，没有新配音、整片或重试。

## 已确认的结论

不能把当前某次 Google 返回的 `FreeTier limit: 10` 解释为“Gemini 免费配音统一每天只有10次”，也不能据此认定用户 AI Studio 余额不足。此前的笼统结论已纠正。

11月11日的真实试听报告最终取得44组可解码音频。按报告里的实际完成时间分组，Google使用的太平洋配额日2026-11-10有29组成功，2026-11-11有15组成功。四轮是累积结果，不能把44乘以4；累计50次客户端请求，也不能当作50次上游生成。

| 项目 | 历史证据 | 当前证据 / 边界 |
|---|---|---|
| 应用入口 | `POST /api/narration` | 成片和试听共用配音请求实现；云试听也走相同请求协议。 |
| 模型 | 当时提交的实现为 `gemini-2.5-flash-preview-tts` | 当前默认仍是此模型；错误中Google规范化名称为 `gemini-2.5-flash-tts`，不能据此说换了模型。 |
| 上游协议 | `POST /models/{model}:generateContent`，AUDIO输出 | 官方API默认地址相同；历史运行时是否覆盖base URL没有保存在试听报告。 |
| 同日成功数 | 单个太平洋日29组音频成功 | 44组均未由接口披露缓存命中，不能证明29次全是新的上游请求。 |
| 密钥与Google项目 | 历史报告没有记录项目ID或密钥身份 | 11月13日实际轮换过角色密钥，不能断言旧成功和当前报错属于同项目。 |
| 当前错误 | 原任务Google429明确为Flash TTS免费层每日10次 | 另一次Pro TTS探针为免费层限额0；均没有得到音频，不是余额耗尽的证明。 |

[结构化历史核对](task-23-tts-quota-history-2026-11-14.json)、[44组真实音频报告](voice-live-acceptance-2026-11-11.json)、[四轮解释与限制](voice-async-progress-2026-11-11.md)、[角色密钥轮换记录](gemini-key-rotation-2026-11-13.json)、[当前失败与检索证据](task-23-gemini-switch-diagnosis-2026-11-14.md)、[Pro探针原始错误](task-23-paid-tts-probe-2026-11-14.json)。

## 付费调用应当如何生效

Google文档说明，配额按项目计算、每日配额在太平洋午夜重置，限额取决于模型和使用层级，不能用一个报错推导所有账户的固定上限。付费层需要关联有效计费账户，项目的Billing Tier和可用余额分别核对；同一Gemini API由项目计费状态决定服务层级，不存在在请求中传一个“paid=true”即可升级的开关。

官方入口：[配额说明](https://aistudio.google.com/docs/rate-limits)、[API Keys](https://aistudio.google.com/api-keys)、[项目与Billing Tier](https://aistudio.google.com/projects)、[计费状态](https://aistudio.google.com/docs/billing#verify-billing)、[TTS模型价格](https://aistudio.google.com/docs/pricing#gemini-2.5-flash-preview-tts)。本次没有读取用户的Google账户页面，不能给出其项目的实际Tier或余额结论。

## 已修复的程序配置问题

成片旁白原先把TTS模型写死，只有云端试听读取`TTS_MODEL`。现在本地、云执行器、短旁白、长旁白分块及云试听使用同一配置；缓存与事件记录包含实际配置模型。没有擅自换到Pro或把更换模型描述成升级付费层，默认模型和原缓存键保持兼容。

回归先失败再通过，覆盖短旁白真实文件处理、不同模型缓存隔离、相同模型复用、长稿所有分段同模型同音色；云试听与云执行环境的路由另行检查。完整离线范围402项：400通过、0失败、2项需媒体夹具；另行媒体夹具4/4通过，云角色路由12/12通过，补齐两项跳过。类型检查和构建通过。尚未在本地常驻服务或新版云执行快照完成运行验收，也没有新整片、听感或速度通过证据。

[失败复现](task-23-tts-model-red-2026-11-14.txt)、[修复后检查](task-23-tts-model-green-2026-11-14.txt)、[完整离线回归](task-23-tts-model-regression-2026-11-14.txt)、[云角色路由检查](task-23-tts-model-routing-2026-11-14.txt)、[媒体夹具检查](task-23-tts-model-media-fixtures-2026-11-14.txt)、[构建输出](task-23-tts-model-build-2026-11-14.txt)。
