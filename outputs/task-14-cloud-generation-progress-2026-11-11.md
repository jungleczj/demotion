# 任务14：线上 Generate video 无法点击

更新：2026-11-11 22:05（Asia/Shanghai）。

## 原因与实施

原生线上 API 之前明确返回 `render:false`，避免把 Function 临时内存冒充长期视频后台。静态页面与声音目录恢复并未接通 FFmpeg 生产链路，因此按钮禁用是真实后台缺失。

本轮已实现以下云端适配，保留既有制作和审片算法：

- [原生 API 接入](gomotion-mvp/server/vercel-api.mjs)与[云端路由](gomotion-mvp/server/cloud/api.mjs)：只有存储、执行环境、会话密钥、模型连接与启用开关齐备，才返回可生成状态。
- [持久任务控制](gomotion-mvp/server/cloud/productions.mjs)：私有对象存储、条件写、跨实例去重、仅主动停止取消、旧 attempt 隔离、有限恢复。
- [存储适配](gomotion-mvp/server/cloud/blob-store.mjs)：实时读取、ETag 条件写、文件按哈希保存、完整 SHA-256 复核、短时签名直传与播放地址。
- [执行器](gomotion-mvp/server/cloud/executor.mjs)与[独立 worker](gomotion-mvp/server/cloud/worker.mjs)：脱离网页请求的 Linux 视频进程；注入执行所需连接，不把用户密钥写入基础快照；阶段文件检查点及恢复时哈希校验。
- [环境准备脚本](gomotion-mvp/scripts/prepare-cloud-snapshot.mjs)：FFmpeg、中文字体和 Linux 依赖，不带本机媒体、环境文件与 Darwin 原生包。

## 最新验收（2026-11-11 22:37）

- **真实云端制作已通过**：两幕真实视频、9.525625秒旁白，MP4实际9.767秒；1280×720、30fps、H.264+AAC，画面全部覆盖，实际视听审片通过。正式站MP4返回200，Range返回206/32字节，完整解码通过；字幕SRT与来源JSON均200。另一个11,545,388字节的入选镜头经正式站流式下载和完整解码通过。详见[结构化实测](task-14-cloud-live-acceptance-2026-11-11.json)。
- **本次为恢复验收**：在修复最终字幕上传后，复用已核验的选材和旁白，从Blob在新执行实例恢复；恢复提交到持久化完成26.049秒。不能当作首次冷生成或2倍速度达标。此前同一任务在修复过程中失败，未隐去这些失败。
- **云存储实测通过**：[实际预检](task-14-cloud-storage-probe-2026-11-11.json)覆盖并发条件写、签名上传、SRT媒体类型、SHA-256、重复上传及私有Range/完整解码，模型调用0。
- **本地验收**：[任务控制与原生 API 检查](task-14-cloud-contract-2026-11-11.txt)23项通过；最终完整263/263通过（0失败/取消/跳过，52.77秒），含有效云端配置下按钮启用的3项界面合约检查；类型与构建通过。[完整日志](task-14-full-regression-2026-11-11.txt)、[按钮检查](gomotion-mvp/src/components/Creator-generation.test.mjs)。SDK依赖审计0项漏洞。[依赖审计](task-14-dependency-audit-2026-11-11.json)。
- **正式部署已就绪**：[正式站](https://gomotion-mvp.vercel.app/)目前返回真实`render:true`。部署dpl_9JLE11A6VdpyBpXks5guagfH1GCh，使用已配置的private Blob与Linux执行快照；用户明确允许相关Vercel用量。
- **仍待验收**：Work浏览器控制不可用，未冒称真实页面点击、浏览器切镜录屏或自然听感已通过；15分钟容量、真实冷生成2倍目标和任务11补片整片继续独立跟踪。

## 实测发现并修复的故障

1. Blob真实异常的`name`可为通用`Error`，不能仅按类名识别缺文件/冲突；补实际错误分类与有限退避。
2. 条件写改用控制面版本，在读取正文前取得ETag，避免CDN表示版本造成冲突。
3. SRT签名上传需显式提供Blob对象媒体类型`x-content-type`；补Content-Length、有限瞬态重试及内部脱敏失败阶段。
4. 失败重试保留已核验文件和检查点；停止与旧attempt隔离持久化，后台迟到结果不能复活已停止任务。
5. 正式站媒体使用同域流式读取并保留Range语义，避免让浏览器直接访问私有Blob域名或缓冲整个文件。

## 完成标准

1. 正式页 Generate video 对有效脚本可用，实际提交返回持久任务，不只是解除 disabled。
2. 真实短片完成规划、检索、配音、合成与审片，获得完整 MP4；完整解码与 Range 播放通过。
3. 离开页面、再次进入、刷新或请求被中断不停止任务；只有主动停止取消。
4. 原第11项真实素材来源、无空镜头、同一声音、画幅与审片约束继续有效。
5. 记录本轮真实耗时；没有2倍速度实测，不宣称达标。
