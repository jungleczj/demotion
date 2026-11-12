# 本地任务与媒体持久目录修复（2026-11-12）

本轮完成本地默认目录与目录保留逻辑修复，并通过专项离线检查。未启动或重启主服务，未生成新成片，未调用模型，未部署或提交 Git。本报告不代表 `TASKS.md` 的浏览器、真实视频、语言听审或云端全部验收通过。

## 已知旧数据的真实状态

2026-11-12 09:32:36（上海时间）再次检查时，以下路径均不存在：

- `outputs/gomotion-mvp/work`
- `/private/tmp/gomotion-local-mvp`
- `/var/folders/l5/164spx8n27nbbtz29bp4kf1m0000gn/T/gomotion-local-mvp`

没有从这两个已知旧目录找到可供迁移的 `productions/jobs.json` 或媒体树。本轮没有恢复旧的20条任务或此前声音文件，没有从旧报告构造任务，也没有写入空的 `jobs.json` 去覆盖旧记录。缺失发生的时间与原因仍未知；不能据此归因于某次操作或系统清理。对系统临时父目录的额外只读文件搜索遇到部分系统子目录权限限制，因此不声称已搜遍全磁盘或不存在其他备份。

## 改动

| 文件 | 实际变化 |
|---|---|
| `gomotion-mvp/server/runtime.mjs` | 默认目录由 `os.tmpdir()/gomotion-local-mvp` 改为模块位置对应的应用 `work/`；保留 `GOMOTION_DATA_DIR` 显式覆盖。新增启动初始化入口。 |
| `gomotion-mvp/server/data-directory.mjs` | 新增目录初始化与旧目录安全兼容。仅在目标不存在时复制旧树，保留原树备份和旧绝对路径链接；不改写任务/素材 JSON、SHA256 或缓存名；已存在的目标不合并、不覆盖。保存迁移凭据，后续启动可重建丢失的旧路径链接。路径被其他文件占用时保留双方并报错。 |
| `gomotion-mvp/server/index.mjs` | 仅修改 runtime 导入和原有目录初始化调用；仍在读取 assets/jobs 之前完成初始化。 |
| `gomotion-mvp/server/media-retention.mjs` | 用真实文件路径识别迁移链接指向的稳定文件，补保留已保存任务的 playbackKey 及别名对应 MP4/JPG。移除任务后仍释放引用。 |
| `gomotion-mvp/server/playback-cache.mjs`、`playback.mjs` | 提取原有磁盘淘汰循环，新增已保存任务文件的保留判断；维持原有24小时有效期、256MB容量、温热缓存保护与其他未引用文件清理。保护文件占满容量时拒绝新预留。该项由根代理明确扩大授权。 |
| `gomotion-mvp/.gitignore` | 加入 `work/`，独立使用应用目录时也忽略运行数据。 |
| `gomotion-mvp/DEPLOYMENT.md` | 记录本地默认位置、显式覆盖、兼容策略、真实缺失状态和迁移限制。 |
| `gomotion-mvp/server/deployment-runtime.test.mjs`、`data-directory.test.mjs`、`media-retention.test.mjs`、`playback-cache.test.mjs` | 增补跨临时目录/进程重启、无覆盖迁移、来源与缓存一致性、目录占用保护、保留与清理的回归。 |

没有修改 `render.mjs`、`source-images.mjs`、`motion-graphics.mjs`、`TASKS.md` 或云 worker 执行业务。

## 目录审计

| 数据 | 原有调用与现在的根目录 |
|---|---|
| 本地任务/素材登记 | index 的 `work` 传给 production manager；`productions/jobs.json` 与 `assets.json` 同根。 |
| 上传/来源图片/补片/导出 | index、visual director、motion graphics 和 render 沿用传入的同一个 `work`。 |
| 旁白/统一时间轴 | narration 与 narration-timeline 使用 runtime.workDirectory 下的 `narration/`。 |
| 播放/试听 | playback 与 voice-samples 使用 runtime.workDirectory 下的 `playback/`、`voice-samples/`。 |
| 音乐 | index 传入 `work/music-sources`。 |
| 定期清理与保留 | index 的 cleanup 与 production manager 的 retainTaskMedia 沿用同根；playback 自身的容量清理也检查保留引用。迁移凭据置于本来就保留的 `productions/` 内。 |
| 云端执行 | executor 与 worker 仍显式传入 `/vercel/sandbox/work`；新的默认位置不会改变云执行路径。 |

## 实际验证

在 `outputs/gomotion-mvp` 执行：

```sh
node --test --test-reporter=tap server/deployment-runtime.test.mjs server/data-directory.test.mjs server/media-retention.test.mjs server/playback-cache.test.mjs server/productions.test.mjs
```

结果：**19/19通过，0失败、0取消、0跳过**。完整输出保存在 [专项检查日志](local-persistence-checks-2026-11-12.txt)。

- 默认路径检查实际启动子进程，分别改变 `TMPDIR` 和工作目录，仍得到应用 `work/`。
- 进程重启检查在隔离的应用夹具内提交离线 queued 任务，写入运行中检查点，再以不同 `TMPDIR` 启动新进程；恢复为同一 ID 的 queued 任务且场景检查点保留。另一个新进程显式停止后，第四个进程仍读到 cancelled 与已保留草稿。测试关闭视觉服务，不请求外部 API。
- 迁移检查使用实际磁盘原件、JSON 与缓存文件：迁移前后 JSON 字节完全相同，原绝对路径可读、SHA256相同、实际 playbackKey 仍对应原缓存名。删除整个旧临时父目录后，用不同临时目录初始化，保存的旧路径链接可重建。
- 无覆盖检查确认已有稳定任务文件与旧任务文件各自保持原字节。目标/旧目录缺失时只建立目录，不伪造 jobs 文件；显式目录不会扫描迁移无关临时数据。
- 磁盘清理检查使用实际文件和修改时间，确认过期无引用 MP4/JPG 被删除、保存任务文件及温热缓存保留；释放任务后可清理；容量不足时拒绝预留且保留已保存文件。这些文件是字节夹具，未编码或解码视频。
- 现有 production 持久化、同时提交去重、旧不合格来源缓存和字幕缓存资格检查继续通过。
- `node --check` 检查 runtime、data-directory、media-retention、playback-cache、playback、index 六个模块，退出0；`git diff --check` 无输出，退出0。

全量应用回归与主服务实际启动由根代理统一执行，本专项不据此宣称完整应用验收完成。

## 限制与后续

- 稳定存储修复不能恢复已经缺失的旧数据。根代理可以在新默认目录启动后续工作，但应保持旧任务恢复状态为未恢复。
- 自动迁移只检查当前系统临时目录中的旧约定路径；已经换过临时位置且找不到旧路径时，需先定位真实备份，再明确选择数据目录。
- 迁移复制需要额外磁盘空间，旧目录不应有并发写入进程。中断时可能保留完整目标副本和旧目录/备份，需要核对内容后再处理；不会自动混合两份任务。
- 迁移后的绝对旧路径通过链接兼容。旧链接被系统清理后会在下次初始化重建；若运行期间链接被删除，相关旧路径访问可能失败至再次初始化，稳定目录内的实际字节仍保留。
- 默认 `work/` 随当前代码目录定位。若要移动整个应用，应使用固定外部持久目录并保留完整媒体及路径兼容，不能只迁移任务 JSON。
- 已保存的播放缓存受保护后可能占满原有256MB上限；这时新增候选会收到原有容量不足错误，已有任务文件不会因此被淘汰。
