# YouTube 素材接入与费用核实

核实日期：2026-11-11。范围：本地脚本自动配真实视频的 MVP，需要可编辑、可重新导出的文件；不预存全网视频。仅核对公开官方文档，未申请密钥、未下载视频、未修改应用代码。

**结论：可以用 YouTube Data API 接入搜索和视频资料；它不提供可供剪辑的原视频下载接口。MVP 应把 YouTube 用作发现入口，实际剪辑接收用户自有文件、官方导出文件，或权利人从其自有存储交付的授权原片。**

## 接入步骤

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建或选择项目，启用 [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)。
2. 打开 [Credentials](https://console.cloud.google.com/apis/credentials)，选择 Create credentials → API key。公开搜索和公开视频资料可使用 API key；访问私有账户数据或写入账户才需要 OAuth 2.0。正式使用前限制密钥可调用的 API 和适用来源。[官方身份验证说明](https://developers.google.com/youtube/data/guides/authentication?hl=en)
3. 调用 `GET https://www.googleapis.com/youtube/v3/search`，使用 `part=snippet&type=video&q=关键词&maxResults=25` 搜索候选。需要 CC 候选时增加 `videoLicense=creativeCommon`。单页最多 50 条；下一页是新的请求。[search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list)
4. 用候选的 `videoId` 调用 `GET https://www.googleapis.com/youtube/v3/videos`，请求 `part=snippet,contentDetails,status`，获得标题、描述、时长和许可等资料。[videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)

视频的 `status.license` 可为 `creativeCommon` 或 `youtube`。`fileDetails` 只描述上传文件的编码、分辨率等信息，而且只有视频所有者能取得；该字段不提供原片下载地址。依据官方公开方法和资源字段，Data API 的视频接口不能返回可编辑 MP4 或视频流文件。[video 资源定义](https://developers.google.com/youtube/data/reference/rest/v3/videos)

## 配额已在 2026 年变化

| 操作 | 当前默认配额 | 一次请求消耗 |
|---|---:|---:|
| `search.list` 搜索 | 独立 Search Queries 桶，100 次/日 | 1 个搜索配额 |
| `videos.list` 详情 | 与其他普通接口共享 10,000 单位/日 | 1 单位 |
| `videos.insert` 上传 | 独立桶，100 次/日 | 1 个上传配额 |

每天按太平洋时间午夜重置，翻页继续计数，无效请求也会消耗配额。以 Google Cloud Console 中项目实际额度为准。[官方配额表](https://developers.google.com/youtube/data/determine_quota_cost)

官方修订史记录 2026-06-01 开始将 `search.list`、`videos.insert` 拆为独立配额桶。因此不要继续按旧教程的“搜索一次扣共享桶的 100 单位”估算；每天默认能搜 100 次的数量仍相近，配额机制已经变化。[官方修订史](https://developers.google.com/youtube/data/revision_history)

例如：一个脚本生成 5 组关键词、每组搜 1 页，消耗 5 次搜索额度；如果每组翻 3 页则为 15 次。不同搜索结果还可能重复，返回数量不是可用素材数量。

## 是否收费

| 成本 | 对 MVP 的意义 |
|---|---|
| 官方搜索与详情 API | 当前官方文档按配额管理，没有公布按次美元收费或付费购买超额额度的价目表。文档中的 `quota cost` 是配额消耗。工程预算可先按默认配额内无按次现金费用处理，但这不是无限调用承诺。 |
| 配额扩容 | 官方路径是提交合规审查与配额扩展申请，说明用途；不是简单绑定信用卡后按量购买。 |
| 素材版权授权 | 与 API 配额分开。自己拥有完整权利的素材不需再向他人买版权；合规 CC BY 素材按许可使用；标准许可视频通常要向权利人另行取得剪辑、商用、再发布等权限，价格由权利人决定。 |
| 本地处理和存储 | 本机磁盘、处理时间、下载带宽等是自身资源成本；如用云存储、云转码或模型分析，则按选用服务计费。API 搜索额度不包含这些资源。 |

上述 API 现金成本判断来自当前官方配额和扩容规则；官方没有在这些页面给出货币费率。超过默认配额，应走 [Quota and Compliance Audits](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits)，提交 [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form)。

## 下载权限与版权许可需要分别满足

YouTube 开发者政策 III.E.1 禁止未获得 YouTube 事先书面批准就下载、导入、备份、缓存或存储 YouTube 视听内容；III.I.7 禁止拆分或修改通过 API 服务提供或与之相关的影音组成部分。公开视频元数据的有限缓存通常须在 30 天内刷新或删除，这条元数据规则不能当成缓存视频文件的许可。[Developer Policies](https://developers.google.com/youtube/terms/developer-policies)

普通 YouTube 条款也限制服务外下载、复制、修改等使用，并说明给其他用户的许可限于服务功能所允许的使用。因此，拿到创作者版权许可，不应自动理解为也拿到了从 YouTube 平台抓取文件的许可。[YouTube Terms of Service](https://www.youtube.com/static?template=terms)

- **标准 YouTube 许可**是默认选项。视频公开、允许嵌入或能被 API 搜到，并不自动授予把画面剪进新成片的权限。
- **CC BY**允许按具体许可复用。YouTube 当前帮助页链接到 CC BY 4.0；该许可允许商用与改编，要求适当署名、许可链接和修改说明。应核查真实权利、记录来源和具体许可版本；素材里的音乐、人物等可能涉及其他权利。[YouTube 许可说明](https://support.google.com/youtube/answer/2797468?hl=en)、[CC BY 4.0 原文](https://creativecommons.org/licenses/by/4.0/)
- **YouTube Premium 离线**是观看功能。官方说明文件加密且只能在 YouTube 应用内观看，不能据此获得可导入剪辑器的通用素材文件或再利用授权。[离线观看 FAQ](https://support.google.com/youtube/answer/7381437?hl=en)

## 自己上传的作品如何官方取得文件

- 在 [YouTube Studio](https://studio.youtube.com/) → Content → 视频菜单 → Download。官方说明可下载 MP4，分辨率为 720p 或 360p，取决于视频情况；所以不要把 Studio 下载当成保证保留原始画质的原片。[官方操作与限制](https://support.google.com/youtube/answer/56100?hl=en)
- 需要批量导出自己的视频，可用 [Google Takeout](https://takeout.google.com/)。官方说明视频可能以原格式，或 H.264 视频加 AAC 音频的 MP4 格式导出。[Google 数据导出说明](https://support.google.com/accounts/answer/3024190?hl=en)

用户原本保留的相机原片通常更适合作为剪辑输入。自己上传过某个视频也不代表拥有其中全部音乐、片段等第三方内容的再利用权利。

## 适合这个 MVP 的工作流

```text
脚本文案 → 关键词 → YouTube API 搜索候选 → 元数据/官方播放器预览
                                      ↓
                             确认许可、用途和来源
                                      ↓
          用户自有文件 / 用户官方导出文件 / 权利人交付原片地址
                                      ↓
                  按需导入 → 场景分析 → 剪辑 → 导出新成片
```

这是基于上述规则的产品建议：给候选记录保存 `videoId`、来源链接、作者、许可及核实日期；只有拿到独立交付且权利充分的文件，才进入剪辑流程。按项目临时保存这些文件或代理文件，完成后清理；不建立全网视频仓库。YouTube 播放器用于观看预览，剪辑器处理合法取得的本地原片。

首版可先支持“粘贴 YouTube 链接做来源记录 + 上传对应合法文件”，再接 API 自动搜索。这样能先验证脚本拆镜、素材匹配和重新导出的核心效果。
