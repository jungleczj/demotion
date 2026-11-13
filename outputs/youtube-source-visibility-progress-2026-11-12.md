# 第15项：YouTube来源首屏可见性

2026-11-12。后台检索与来源连接沿用原接入；本轮未修改凭证、调用YouTube API或把元数据当作可剪原片。

## 原因与修复

原生Chrome实际打开本地“素材来源”弹窗：YouTube行存在且已连接、启用，但排在六个来源之后，弹窗首屏未显示。已将同一YouTube行移到列表第一行，未改变整体弹窗布局或来源语义。

[本地实际截图](youtube-source-visible-local-2026-11-12.png)确认第一行显示“YouTube Data API”“已连接·检索参考”，开关启用。官方文档链接地址核对为developers.google.com/youtube/v3。本轮未切换来源开关、保存配置或更改用户密钥。

## 验证

- 首屏顺序回归先出现失败（首个来源仍为Wikimedia），移动后4/4通过，[定向记录](youtube-source-visibility-check-2026-11-12.txt)。
- 最终[完整回归336/336](youtube-source-visibility-full-regression-2026-11-12.txt)，0失败/取消/跳过，50.425秒，数据目录隔离，未调用真实模型或提交视频。
- 类型检查与生产构建通过；构建产物为index-DvReKZz2.js。
- [当前连接实测](task-status-service-check-2026-11-12-20.json)：本地与正式youtubeConnected=true、youtubeDiscovery=true。正式目录200不等于新版排序已发布。

已推送[31ec2c2](https://github.com/jungleczj/demotion/commit/31ec2c2e13e542a393cd9dc0d6107fe84bb5ddd0)，官方CLI核对正式部署READY。20:19正式首页、JS及配置均200，新JS的SHA256与本地构建相同，配置YouTube已连接且启用、render=true。[实际线上核对](youtube-source-visibility-online-2026-11-12.json)。线上实际弹窗尚未点击复核，不把JS发布等同浏览器验收；没有新增模型或视频生成请求。第15项本轮仅首屏可见性通过；完整原片取得与片段入片不在此窄结论内。

## 11月13日正式浏览器补验

原生Chrome实际打开正式站首页，声音列表显示30种、中文语言选项正常，未见原连接报错。打开素材来源弹窗，YouTube Data API在第一行、已连接/勾选、官方链接正确；[正式实际截图](youtube-source-visible-production-2026-11-13.png)。未更改开关或密钥，也未触发YouTube搜索或新试听。当前声音服务的新生成仍受最近402影响，不将目录可见当作完整视频恢复。[最新接口与任务](hourly-service-check-2026-11-13-08.json)。
