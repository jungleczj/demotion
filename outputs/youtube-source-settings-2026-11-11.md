# 任务15：YouTube 加入既有素材来源列表

更新：2026-11-11 22:05（Asia/Shanghai）。

已在[设置组件](gomotion-mvp/src/components/Settings.tsx)现有“素材来源”列表增加 YouTube Data API 行，包含官方文档链接、已连接状态、检索参考说明和本地密钥输入。线上连接由服务端环境管理，不伪装保存到函数临时内存。

[界面合约检查](gomotion-mvp/src/components/Settings-sources.test.mjs)3项通过；[本地配置保存检查](gomotion-mvp/server/deployment-http.test.mjs)覆盖凭证脱敏与启停保存。最新[完整回归记录](youtube-settings-full-regression-2026-11-11.txt)244/244通过，0失败/取消/跳过。类型与构建通过。

YouTube 已是后台元数据检索来源，Data API不提供可剪辑MP4，因此此行明确标为“检索参考”；仍须取得可验证的授权原件才可入片。已随任务14部署到正式站；正式配置显示YouTube已连接。实际浏览器点击仍待用户复核。
