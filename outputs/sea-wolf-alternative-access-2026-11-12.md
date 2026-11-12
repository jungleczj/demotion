# Sea Wolf 私有视频的原稿获取渠道

更新：2026-11-12 11:21（Asia/Shanghai）。本轮只查询公开页面，未提交视频生成任务。

## 本轮结果

**尚未取得完整原稿。** 不能据此开展严格的同稿生成验收。

| 渠道 | 实际核对结果 | 能否取得同稿全文 |
|---|---|---|
| 标题、视频 ID、字幕及转载公开搜索 | 使用完整标题、`CSXelOdU8Yc`、缩短标题及 GoMotion 域名组合查询，未找到可核验的同片转载或完整转写；[加拿大海军协会页面](https://www.navalassoc.ca/nac-news-edition-k678-hmcs-runnymede/)仍提供历史标题链接。搜索范围有限，不代表全网不存在副本。 | 本轮未取得。 |
| Wayback 页面存档 | CDX 索引返回一条 2026-11-06 09:58:48、HTTP 200、text/html 的历史页面记录；实际读取存档返回 HTTP 429。索引记录不能证明字幕或音视频已保存。 | 未读取页面正文；字幕是否存在仍未知。[HTTP 与索引记录](sea-wolf-public-cache-check-2026-11-12.json)。 |
| 教程使用的 YouTube to Transcript | 从其公开首页确认表单指向 `/transcript`，并观察到 `v` 与 `current_language_code` 参数；随后查询目标视频的公开页面，返回 HTTP 403。不能据此断言该站从未缓存过转写，也不能声称已读取缓存。 | 本轮未取得。[查询记录](sea-wolf-transcript-cache-check-2026-11-12.json)。 |
| 浏览器人工页面检查 | 浏览器工具重新检查，仍返回 `Local browser use is disabled in Work settings`；未完成实际页面交互。 | 未完成，不作为字幕不存在的证据。 |
| GoMotion 教程中的输入框 | 既有逐帧核对只见 15,926 字符文稿的一小段；随后演示的成片属于其他项目。 | 不能由可见片段还原全文。[逐帧报告](gomotion-tutorial-script-analysis-2026-11-11.md)。 |

## 可行渠道与优先级

1. **向 GoMotion 教程制作者索取当时粘贴的原始 TXT/SRT 或该示例项目的脚本文本。** 如果对方仍保留输入，这是锁定同稿最直接的方式；不用先取得原视频。
2. **由原视频作者提供字幕、原稿或授权音视频文件。** 获得文件后可以转写并核对教程中可见的文字，区分原始字幕与重新识别结果。
3. **寻找公开视频副本或已经公开保存的字幕。** 必须核对旁白、时长、段落及教程可见文本，不能只凭同名或同题材认定同稿。本轮未命中。

目前没有向任何外部联系人发送消息，也没有创建新的收费服务。

## 权限边界的官方依据

- [YouTube 私有视频说明](https://support.google.com/youtube/answer/77272?hl=en)：观看私有视频需要视频所有者邀请，并使用获授权的账号登录。
- [YouTube Data API 授权说明](https://developers.google.com/youtube/data/guides/authentication)：普通 API key 用于公开数据；读取私有用户数据需要相应 OAuth 授权。更换 API key 不会自动赋予该视频的访问权。
- [字幕下载 API](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)：下载字幕要求对视频具备编辑权限及相应授权；仅被邀请观看不等于获得字幕下载 API 权限。

同稿基线仍按[既定验收方法](sea-wolf-same-script-benchmark-2026-11-12.md)执行；尚未得到完整输入文本及其对应的 GoMotion 参考片。
