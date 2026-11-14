# Demotion

本地视频制作 MVP：脚本 → 素材检索与视觉选材 → 统一旁白 → 视频合成与审片。界面及工作流研究参考 GoMotion；应用独立运行，不连接其生成服务。

## 启动

需要 Node.js 25.4+、FFmpeg 和 ffprobe。中文导出需可读的中文字体；macOS 自动定位 PingFang，其他系统可用 `CAPTION_FONTS_DIR` 指定已安装字体目录。

```sh
cd outputs/gomotion-mvp
npm ci
npm run dev
```

打开 http://localhost:3027 。在「设置与连接」配置自己的服务凭证；密钥不随仓库发布。`.env.example` 也可作为本机配置参考，`.env` 被 Git 排除。

生产构建：在应用目录运行 `npm run build`，然后 `npm start`。

## 线上部署

已接入同项目原生API、持久任务、私有媒体存储和独立视频执行环境；历史两幕云短片及检查点恢复通过。[云端历史实测](outputs/task-14-cloud-live-acceptance-2026-11-11.json)、[部署说明](outputs/gomotion-mvp/DEPLOYMENT.md)。最新短录音生成成功，但音频对齐仍超时，新版整片尚未复验通过。[当前失败与修复](outputs/narration-resume-progress-2026-11-14.md)。目录恢复不等于生成恢复。

当前模型已按用户要求统一切回Gemini；素材源实际并行查询有返回，但配音每日限额及主模型繁忙仍阻塞生成。[任务23排查与切换](outputs/task-23-gemini-switch-diagnosis-2026-11-14.md)。

## 代码与任务

- [应用说明](outputs/gomotion-mvp/README.md)
- [任务与逐项验收标准](TASKS.md)
- [GoMotion 轨道研究](outputs/gomotion-timeline-architecture-2026-11-11.md)
- [背景、音乐和动效实现研究](outputs/gomotion-page-controls-architecture-2026-11-11.md)
- [15分钟容量审计](outputs/long-form-capacity-audit-2026-11-11.md)

当前为持续验证的 MVP，完整状态以任务表为准。已有完整横竖短片和部分实际静音播放证据；真实冷生成2倍目标、浏览器逐帧/人工听审、来源补片整片、新版本云整片及 Sea Wolf 同稿对标仍未完成，不能把本地检查通过当成全部产品验收通过。

依赖、临时缓存、生成音视频与第三方公开网页/脚本存档不上传；报告中的这些本地附件不属于仓库交付文件。应用源码、自动检查和调研结论随仓库保存。
