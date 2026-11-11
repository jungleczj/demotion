# YouTube 与后台多来源素材接入验收

更新：2026-11-11（Asia/Shanghai）。本轮按用户纠正，**实际扩充后台自动检索和音乐文件接入**，不是增加前台选项。未修改 planner/recovery 或脚本切分；未重启 3027；未调用 AI、创建付费资源、获取 GoMotion 音乐或提交凭证。

## 1. 本轮实际交付

- `searchSources` 保持原签名；图片检索自动追加 **Openverse、Cleveland Museum of Art**。原来的真实图片补片流程已经调用它，因而不需要新增界面才能使用增源。
- 视频检索自动补充本轮规划未选中、但后端已有 key 的 Pexels/Pixabay/Coverr，最多额外两个。既有 Commons/NASA/Archive 保留。**没有新建一个未经实测的通用视频下载源**。
- 可用视频为空时，已配置的 YouTube 自动查找 CC 来源线索，写入独立 `references`。观看页、嵌入页均不会注册为可剪辑资产。自动发现默认每个凭证每天最多 5 个不同检索，按太平洋日期重置；配额错误停止当日自动发现，不重试。
- 新增音乐后端：**Scott Buckley 两首已核对的官方逐曲 CC BY 4.0 音乐**，以及 Openverse 的音乐检索适配。支持按需下载原文件、大小/时间限制、完整音轨解码、散列与许可凭据、复用本地缓存；没有更改混音流程。
- 补齐 `ensureAnalysisPreview(asset, config, signal)` 的 Commons/Pixabay/Coverr 元数据取消信号；有用户 signal 时仍保留 12 秒请求超时。

### 真实验收状态

| 项目 | 结果 |
|---|---|
| Cleveland 官方 CC0 图片 API | **通过**：真实查询 `bird` 返回 8 项，3,026ms；只接纳逐条 `share_license_status=CC0`、API 明确发布的 JPEG |
| Cleveland 实际原图 | **通过**：1,381,412 字节，取得及完整解码 6,451ms；保留原件，供现有流程审查的完整视野 PNG 为 1275×1600 |
| Scott Buckley Undertow 官方逐曲页面 | **通过**：8,697ms，实际校验 CC BY 4.0 链接及准确 MP3 href |
| Undertow 真实 MP3 下载 | **未通过**：120,011ms 到时中止，未取得完整文件，未冒充可播/已解码音乐；未继续重试。实验残留不完整文件已清理 |
| Openverse 真实网络 | **未通过**：两次只读初探均 `fetch failed / ECONNRESET`；不声称网络或原件验收已通过。代码有部分来源失败降级、并发去重和一分钟冷却 |
| LoC 新视频来源 | **未接入**：官方 JSON 搜索和详情初探均 403；集合“无已知限制”不能直接当逐件全球公版许可，故没有加入默认源 |
| 本地定向检查 | **21 项全部通过**，包括原 YouTube 7 项；另 `npx tsc --noEmit` 退出 0 |

完整脱敏实测：[expanded-media-sources-live-2026-11-11.json](expanded-media-sources-live-2026-11-11.json)。图片 SHA-256：`65aaa5e0fbdc655077e2b88c8dabe3dc386e8db1a85d21cf196090cd1e17f57c`。样本是[馆藏鸟形金饰](https://clevelandart.org/art/2015.3)，**不是企鹅照片或实拍鸟**；本轮只验收来源、下载与解码，没有做内容匹配或入片验收。

## 2. YouTube 已有接入审计与安全配置

已检查 `server/youtube.mjs`、`server/index.mjs`、`.env.example` 及既有集成记录。后端支持 `YOUTUBE_API_KEY`，或 `POST /api/config` 的 `youtubeKey` 进入服务内存；公开配置只给 `youtubeConnected`，请求头使用 `X-Goog-Api-Key`，错误不会回显凭证。报告不包含 key，也不需要再向用户索取。

既有 `POST /api/youtube/search` 调用一次 `search.list`，再用一次批量 `videos.list` 核对公开、已处理、可嵌入、非直播、许可和时长。最多 24 项、24 小时内存缓存、同请求合并、取消订阅隔离；元数据与可用媒体分开。[既有真实验收](youtube-live-acceptance-2026-11-11.json)记录 200/5 项，首次 978ms，重复 10ms 且缓存命中。本轮没有使用真实 key 再消耗查询额度。

### 申请、配额、收费

1. 在 [Google Cloud 项目](https://console.cloud.google.com/)中[启用 YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)，在[凭证页](https://console.cloud.google.com/apis/credentials)建立 API key 并限制到该 API；公共检索用 key，需要用户授权的操作另走 OAuth。[官方入门](https://developers.google.com/youtube/data/getting-started)
2. **截至本次核实的官方新规则**：`search.list` 独立默认 **100 次/天，每次 1 配额**；其他端点合计默认 10,000 units/天，`videos.list` 每次 1 unit。每日太平洋午夜重置。不要继续套用旧的“search 每次扣通用 100 units”。[官方配额表，2026-11-10 更新](https://developers.google.com/youtube/data/determine_quota_cost)
3. 官方列的是额度成本，没有按调用次数直接购买的美元价目表；不能把 unit 当美元。更高额度先做[合规审查](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits)，入口为[审查与额度扩展表](https://support.google.com/youtube/contact/yt_api_form)。素材版权授权、后端网络/存储/转码成本另计。

### 发现参考与取得媒体的区别

Data API 提供[搜索](https://developers.google.com/youtube/data/reference/rest/v3/search/list)和[视频元数据](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)，不交付剪辑用原 MP4。开发者政策限制未经允许下载、导入、缓存或存储 YouTube 视听内容；元数据缓存权限不等于原视频下载授权。[开发者政策 III.E / III.I](https://developers.google.com/youtube/terms/developer-policies)

CC BY 条目也要核对上传者是否有权授权、第三方音乐/人物等权利，并按许可署名。标准 YouTube 许可不自动授予外部剪辑重用权；Premium 离线内容也不是编辑原文件。[YouTube 许可类型](https://support.google.com/youtube/answer/2797468?hl=en)、[离线说明](https://support.google.com/youtube/answer/7381437?hl=en)

可行流程仍是：**自动发现 → 核对权利 → 用户提供自己持有的文件、自己的官方导出，或权利人独立交付的原文件 → 按需下载/审核/取段**。自己的视频可用 [Studio 下载](https://support.google.com/youtube/answer/56100?hl=en)或 [Google Takeout](https://support.google.com/accounts/answer/3024190?hl=en)。

## 3. 真实来源矩阵与优先级

P0：本轮可直接复用的代码路径；P1：已实现但需特定凭证/网络/逐件审查；P2：有官方能力，未在本轮写成适配器。下表的“能取得文件”不代表某一脚本一定有匹配画面。

| 来源 | 媒体 / 文件能力 | 申请、许可、成本与接入状态 |
|---|---|---|
| **Cleveland，P0** | 图片；API 直接给 web/print JPEG | 免 key，逐件 CC0；本轮新增并取得真实原图。适合历史、艺术、器物，必须避免把作品照片当成其描绘对象的实拍。[API](https://openaccess-api.clevelandart.org/)、[官方开放使用说明](https://www.clevelandart.org/open-access) |
| **Pixabay，P0/P1** | 图片、实拍视频；API 文件地址 | 原有适配器，新增自动并查。需要 key，默认 100/60秒，缓存 24h，禁止系统性大量自动请求/批量下载。官方公开 API 文档列图片/视频，**不能据网页音乐目录猜一个音乐 API**。[API](https://pixabay.com/api/docs/)、[许可](https://pixabay.com/service/license-summary/) |
| **Coverr，P0/P1** | 原有实拍视频 MP4 | 原有适配器，新增自动并查；排除 AI/premium。Demo 50/小时；Production 2000/小时需 Pro/Ultimate。免费 API 需署名，选用时回传下载统计。[申请/额度](https://coverr.co/api/docs/start)、[API 许可](https://coverr.co/license) |
| **Pexels，P1** | 图片、视频原件/尺寸版本 | 原有适配器，新增自动并查；有已有 key 时使用。**2026-11-10 官方帮助明确新 key 签发暂停**，不能承诺现在申请立即获得；文档通常额度 200/小时、20,000/月。内容许可与 API 展示署名规则都要遵守。[当前申请状态](https://help.pexels.com/hc/en-us/articles/900004904026-How-do-I-get-an-API-key)、[文档](https://www.pexels.com/api/documentation/)、[API 条件](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions) |
| **Commons，P0/P1** | 既有图片、视频；元数据/衍生文件 | 免 key 公共检索。许可逐文件不同，保留来源、作者、署名及 SA 条件；不能把全库当 CC0。[文件 API](https://www.mediawiki.org/wiki/API:Imageinfo)、[重用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) |
| **NASA，P0/P1** | 既有图片、视频；asset 清单 | 当前检索无需新 key；航天/地球科学优先。第三方版权、标识、人物肖像及商业背书条件仍要核对。[官方 API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf)、[媒体规则](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| **Internet Archive，P1** | 既有影片搜索、metadata、MP4 | 已接入。集合标签不保证逐件权利；未知许可候选不能据“Archive”一词自动成为商用授权。[官方开发文档](https://archive.org/developers/) |
| **Openverse，P1** | 新增图片、音乐索引；返回实际文件地址 | 匿名/注册均有官方访问路径，受速率限制；本轮网络未通。只接 BY/CC0/PDM，去掉 NC/ND/SA。它不替第三方验证版权，许可仍需原站确认；音乐下载 helper 已设原页文件+许可同时确认门槛。[API](https://api.openverse.org/v1/)、[认证](https://docs.openverse.org/api/reference/authentication_and_throttling.html)、[条款](https://docs.openverse.org/terms_of_service.html) |
| **Scott Buckley，P0 接口 / P1 网络** | 新增两首官网直接 MP3；无生成费用 | Undertow / The Great Sea 逐曲 CC BY 4.0；商业视频可按条件署名使用，YouTube 描述需署名。不要作为独立音乐产品转售或加入指纹系统。本轮只通过官网元数据，实际 MP3 下载超时。[逐曲 Undertow](https://www.scottbuckley.com.au/library/undertow/)、[The Great Sea](https://www.scottbuckley.com.au/library/the-great-sea/)、[使用规则](https://www.scottbuckley.com.au/library/using-this-music/) |
| **YouTube Audio Library，P2 手动** | Studio 官方 MP3 下载 | 不是 Data API 音频下载端点。登录 Studio，逐曲读 License type/复制归属，再由用户提供官方 MP3；标准库许可与 CC 音乐不可混为一谈。本轮未自动抓登录页。[官方流程](https://support.google.com/youtube/answer/3376882?hl=en) |
| **Jamendo，P2** | 官方音乐检索/stream/download URL | 需 client_id；必须检查 `audiodownload_allowed`，且下载允许与商业同步许可是两层条件。商业计划/单曲权利另核，未注册或付费。[官方 tracks 文档](https://developer.jamendo.com/v3.0/tracks)、[开发门户](https://devportal.jamendo.com/) |
| **Freesound，P2** | 音效/环境声优先，原质量下载 | 搜索和原件下载的鉴权不同，原件下载需要 OAuth2；每个声音可为 CC0/BY/NC 等，应排除不适用许可。未使用低质量试听冒充授权原件。[官方文档](https://freesound.org/docs/api/)、[原件下载](https://freesound.org/docs/api/resources_apiv2.html#download-sound-oauth2-required) |
| **DVIDS / LoC，P2** | 官方视频/图片检索候选 | DVIDS 可申请 API key，但本轮没新开账号；LoC JSON 接口本次 403。权利与主题适用条件逐件核验，未加入默认来源。[DVIDS](https://api.dvidshub.net/docs)、[LoC API](https://www.loc.gov/apis/)、[LoC 电影权利说明](https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/) |

## 4. 精确调用合同

```js
// 原有调用不需要改变：默认自动增源；关闭仅用于隔离验收/诊断。
await searchSources(query, enabledProviders, { ...config, expandSources: true }, 'image');
// 返回 {assets, references, warnings, queriedSources, cached}。
// references 不能交给 verifiedAsset/下载器，也不能变成 scene.selected。

import { searchMusicSources, acquireMusicAsset } from './music-sources.mjs';
const found = await searchMusicSources('reflective', config, {
  providers: ['scottbuckley', 'openverse'], signal,
});
// found.assets 是独立 audio 记录，不进视频 assets Map。
const ready = await acquireMusicAsset(found.assets[0].id, musicWorkDirectory, { signal });
// 成功才有 localPath、duration、sha256、fullDecode:true、attribution、rights。
// downloadedBytes=0/cacheHit:true 表示本地文件复用，仍重新核对散列和完整解码。
```

- `searchMusicSources('')` 可返回两首已核对的馆藏曲目；`reflective` 命中 Undertow，`sea` 命中 The Great Sea。不是全站爬虫，没有暗中下载全曲库。
- 48MB/单文件、120秒下载及解码窗口；只接受已注册检索结果，HTTPS、有限重定向，拒绝 loopback/IP/非标准端口；必须是完整 HTTP 200 文件。实际解码确认有音频、没有动态视频，允许 MP3 封面图。
- 许可、原页地址、署名和取得日期进入本地 JSON 凭据；音频散列不符/文件坏损会重新取得，失败不会返回可播文件。原始音乐不放进源码仓库。
- 主代理负责 HTTP 音乐路由、加载新版服务和后续混音集成；本轮没有把“后端能检索”记为“音乐已经自动配入成片”。

## 5. 文件与可复现验收

变更：`server/sources.mjs`、`server/youtube.mjs`、`server/music-sources.mjs`、`server/source-adapters/{openverse,cleveland,scottbuckley}.mjs`；必要的 `src/types.ts` Provider union/sourceLabels（没有布局变更）；四个对应检查文件及 `sources.test.mjs`；真实验收脚本 `scripts/verify-expanded-sources.mjs`。

```sh
node --test server/source-adapters.test.mjs server/music-sources.test.mjs server/sources.test.mjs server/youtube.test.mjs server/youtube-discovery.test.mjs
npx tsc --noEmit
```

本轮输出：21 tests / 21 pass / 0 fail，约 0.64 秒；tsc 退出 0。音乐原件下载/完整解码/缓存/损坏修复/拒绝不安全来源的本地验证使用实际 1.25 秒 WAV 文件，**属于真实解码的本地 fixture，不是远端 MP3 已成功的证据**。Openverse 原页许可不符时，检查确认不会请求音频文件。

需要真实外网时可显式运行 `node scripts/verify-expanded-sources.mjs`，它只下载一张 CC0 图片和一首明确许可音乐；冷下载失败后不再执行伪“热缓存”重试。本次运行已按上述结果结束，不持续后台下载。

剩余验收：Openverse 在部署环境的真实联通、至少一首官网音乐完整取得与试听、实际片长的混音/ducking/响度/成片审片，以及视频增源对固定脚本的匹配收益。没有编造命中率提升、下载加速比例或全片质量已通过结论。
