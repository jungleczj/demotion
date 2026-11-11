# Vercel 连接与声音列表修复记录

更新：2026-11-11。正式地址：[gomotion-mvp.vercel.app](https://gomotion-mvp.vercel.app/)。

## 根因与实际修改

旧部署只有 Vite 静态产物；配置与声音目录均返回 Vercel 404，Node HTTP 服务不会由 `npm run build` 自动启动。已在当前 Root Directory 内增加 [API 入口](gomotion-mvp/api/index.mjs)、[无状态接口适配器](gomotion-mvp/server/vercel-api.mjs)和[路由配置](gomotion-mvp/vercel.json)，先处理 `/api/*`，再处理 SPA。没有把本地任务泵直接搬进临时函数实例。

用户已有四个服务凭证已存入指定项目的 Production/Preview 敏感环境变量；报告及 Git 不保存值。短声音试听在同一次响应中返回完整 WAV，不依赖下一次请求是否命中同一实例的临时文件。目录读取不预下载 30 条声音。保留所选声音、风格、语言；增加短请求与音频大小检查、超时、错误脱敏。

## 实际验证

| 层级 | 结果 | 证据 |
|---|---|---|
| 正式配置接口 | 200 / JSON，原先404 | [结构化验收](vercel-native-api-acceptance-2026-11-11.json) |
| 正式声音目录 | 200，30声音、15语言 | 同上 |
| 受保护预览真实中文试听 | 200，Kore，5.210958秒，250170字节，FFmpeg完整解码通过；真实模型请求1次 | 同上；音频位于本机临时目录，不上传Git |
| 预览嵌套未知API | 404 JSON，不回退为首页HTML | 同上 |
| 最终本地全范围回归 | 241/241，0失败/取消/跳过，52.26秒；使用已有真实本地视频fixture，无新视频生成 | [完整日志](vercel-native-final-regression-2026-11-11.txt) |
| 浏览器点击 / 听感 | 未验收 | 未以HTTP成功冒充浏览器或自然度验收 |

先验证预览部署，再部署正式版本 `dpl_F5Mh8sYKJcof3gbD9qxsoaozftC1`。真实试听在预览完成；没有为正式域重复调用模型。

## 仍未完成的范围

**完整云端视频制作尚不可用，D1没有完成。** 任务/导出接口明确返回503，配置 `render:false`，新建及已有草稿的制作/导出动作均根据能力禁用；不创建请求结束即消失的假任务。已有本地完整流程仍可运行。

当前 Vercel scope 没有 Blob store；现有40分钟任务、FFmpeg/Resvg和来源文件需迁移到持久执行与存储。[同项目迁移方案](vercel-video-async-migration-2026-11-11.md)已区分 Workflow、Sandbox、Daemon 的适用性、限额及资源需求。没有新建资源或接受新计费。

本适配器不是多用户账号/额度隔离实现；独立审查还指出公开模型接口需要工作区访问与共享用量控制。此限制未作为完整线上产品验收通过。

## 后台增源

已实际修改后台搜索：图片自动扩展 Openverse/Cleveland，视频自动补查已配置 stock，YouTube仅提供独立线索；音乐新增可核实许可的检索和按需原文件取得。[增源实现与实测](youtube-expanded-media-sources-2026-11-11.md)。本地音乐搜索/下载/文件接口已接入；真实远程音乐下载尚未通过，不能称已试听或已混入成片。
