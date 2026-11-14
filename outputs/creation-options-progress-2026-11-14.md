# 创建选项：本地实施与验收

2026-11-14（Asia/Shanghai）。本地工作台已加载本轮版本。正式站与真实新版成片未验收。

| 验收点 | 实际证据 | 尚未证明 |
|---|---|---|
| 配音下方的背景 | 本地浏览器可见 Blue、Cinematic、Vintage、Light、Grid，选 Cinematic 后刷新仍保留；五种主题在 1280×720 与 720×1280 均通过渲染检查。 | 成片中不同背景风格的视觉一致性，需看真实导出。 |
| 字幕下方的选项 | 浏览器验证动效开关、Epic 分类及刷新保留；下方改为英语后，上方旁白语言也切为英语。 | 当前动效实际控制的是来源图加工补片。独立数据图表、地图及完整图文编排尚未实证。 |
| 曲目与音量 | 接口返回三首授权曲目，真实 The Great Sea Range 206；浏览器实际播放到 17.218 秒，readyState 4，关闭后暂停并清除音源。默认 3%；离线混音检查覆盖关闭、0%、指定曲和旁白保护。 | 三曲之外的风格库仍有限；新版完整成片的听审与正式站试听待验收。 |
| 上传与继续制作 | 浏览器选择 1 秒 WAV 校验样本，页面显示已选为自定义配乐，随后移除选择。云端离线检查覆盖 owner 隔离、首发入工作进程、检查点转存与重试恢复。 | 正式站实际上传、私有存储及真实成片验收未执行。 |
| 本地服务及历史任务 | 重新启动后健康和音乐目录 200，原五条任务存档 SHA-256 未变，活动任务 0。 | 此次没有提交新的制作任务。 |

- [本地浏览器截图](creation-options-browser-2026-11-14.png) · [服务与档案核对](creation-options-service-2026-11-14.json)
- [382 项完整回归](creation-options-regression-2026-11-14.txt)：0 失败，0 跳过；TypeScript 和 Vite 构建通过。另单独重查五种背景栅格与选项归一化，共 4 项通过。
- 实现入口：[创建页](gomotion-mvp/src/components/Creator.tsx)、[制作选项](gomotion-mvp/shared/production-options.mjs)、[云检查点回归](gomotion-mvp/server/cloud-production.test.mjs)、[上传校验回归](gomotion-mvp/server/cloud/music-upload.test.mjs)。
- 参考：[GoMotion 创建页](https://gomotionai.com/app)、[现有页面证据](gomotion-page-controls-architecture-2026-11-11.md)。
