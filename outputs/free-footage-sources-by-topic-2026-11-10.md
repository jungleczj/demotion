# 免费素材来源与主题路由调研

调研日期：2026-11-10（亚洲/上海）。

覆盖当前 MVP 的 **43 个主题**，补充 **16 个主题**，共 **59 个主题**；整理 **25 个来源**。这里的“全覆盖”指主题都有可查来源或明确缺口，不代表每个主题都有足够的免费精确视频。

## 1. 可直接指导 MVP 的结论

首批应保留 **Pixabay + Wikimedia Commons + NASA + Internet Archive**。Pixabay 提供通用短镜头；Commons 补具名对象；NASA 补航天；Archive 补历史。搜索成功和允许导出分开处理。

**下一步最值得申请 Coverr 和 DVIDS。** Coverr 是第二个通用视频候选，免费 Demo 可商业集成但仅 50 次/小时；DVIDS 适合军事、航空、舰船、救灾和后勤实拍。LoC 可以做无 key 的档案补充；Europeana 适合欧洲文化资料；NPS 适合美国公园自然题材。

不能承诺目前有 10 个“免付费、即时发 key、通用高清实拍、可直接下载且无额外条件”的成熟 API。本轮有 4 个优先来源、2 个值得申请的专业/通用来源、以及 3 个需要处理授权/交付链的补充；其中 NPS 的视频端点 schema 尚待联调。

### 申请入口与接入状态

| 来源 | 当前 API 状态 | 申请/文档入口 | 视频交付与限制 |
|---|---|---|---|
| Pixabay | free_self_service_key | [申请](https://pixabay.com/api/docs/) · [官方文档](https://pixabay.com/api/docs/) | 默认 100 次/60 秒；查询缓存 24 小时；禁止系统性批量下载，要求真实用户请求。 文档仍显示登录/注册查看 key；用户已有 key。文档没有公开的通用排除 AI 参数，不要杜撰 exclude_ai。API 查询不是批量采集授权。 |
| Wikimedia Commons | free_no_key | 无需 key · [官方文档](https://commons.wikimedia.org/wiki/Help:Machine-readable_data) | 设置可识别 User-Agent；限流和服务政策适用；无固定无限请求承诺。 视频常为 WebM/Ogg，不保证 MP4；视频密度低于图片。读取 extmetadata，并提取 LicenseUrl、Artist、Credit。 |
| NASA Image and Video Library | free_no_key | 无需 key · [官方文档](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) | 本视频库 API 不需要 api.nasa.gov key；其他 NASA API 的 DEMO_KEY/配额不要混用。 先搜索 nasa_id，再请求 asset manifest 选视频变体；搜索结果的预览 links 不一定是视频文件。科学动画不能冒充任务实录。 |
| Internet Archive Moving Image Archive | free_no_key | 无需 key · [官方文档](https://archive.org/developers/) | 合理并发、缓存、可识别 User-Agent，遵从 429/Retry-After；不是全站镜像许可。 metadata.files 取可下载变体；licenseurl 缺失很常见，标为待核实。平台不新设版权不代表上传者有权授权。 |
| Coverr | free_demo_key_paid_production | [申请](https://coverr.co/developers/) · [官方文档](https://api.coverr.co/docs/start/) | Demo 免费 50 次/小时；Production 2,000 次/小时需要 Pro 或 Ultimate；Premium 一般需 Plus+。 最新许可要求选用/下载时计数；旧 API 页称 recommended，按最新许可执行。旧 intro 曾否定商业使用，最新许可已明确允许；仍应保存所用许可版本。 |
| DVIDS | free_self_service_key | [申请](https://api.dvidshub.net/) · [官方文档](https://api.dvidshub.net/docs) | 官方公开表示 API access currently open；注册/登录申请，域名/Origin 与 key 绑定；未核实统一固定配额。 asset.files 提供 MP4、宽高、大小和码率；category=B-Roll 有助于找原始镜头。强烈美国军方视角，不应代替一般世界历史或具体他国事件。 |
| Library of Congress | free_no_key | 无需 key · [官方文档](https://www.loc.gov/apis/json-and-yaml) | 公开无 key；有动态限流和深分页限制，本轮直接抓 docs 曾遇 429。 JSON 目录元数据不是可靠 MP4 下载清单；需解析 item/resources，部分只有流或不可下载。 |
| Europeana | free_personal_key_reviewed_project_key | [申请](https://www.europeana.eu/account/api-keys) · [官方文档](https://api.europeana.eu/en) | 免费个人 key 自助即得，仅个人/非生产；生产 Project key 审核，官方目标 1–5 工作日；生产具体限额按申请条件。 2025-05-28 起在 Europeana 账号 Manage API keys 申请；请求首选 X-Api-Key，旧 wskey 参数已弃用。视频可能只有提供方落地页/流，没有可下载 MP4。 |
| U.S. National Park Service | free_self_service_key | [申请](https://www.nps.gov/subjects/developer/get-started.htm) · [官方文档](https://www.nps.gov/subjects/developer/api-documentation.htm) | 官方 API 免费登记；默认 1,000 次/小时。 官方动态 Swagger 在本轮未能展开，候选 /multimedia/videos 路径没有完成官方 schema 核实，故不写为已验证 endpoint。先用官网媒体页人工导入或取得 key 后再联调。 |
| Pexels | new_key_issuance_paused | [申请](https://www.pexels.com/api/) · [官方文档](https://www.pexels.com/api/documentation/) |  官方帮助 2026-11-09 更新明确 New API key issuance is currently paused，旧的即时签发说明不可继续引用；手动网站素材可作备用。 |

**申请可用性范围：** 以上是当前官方公开流程，未替用户注册或提交新申请。Pixabay 用户已有 key；Coverr/DVIDS/NPS 只是公开申请入口可见，不能据此保证任一账户或地区一定签发成功。Europeana 生产 Project key 明确需要审核。

**Pexels 暂停签发已获官方确认。** 官方帮助 2026-11-09 更新明确暂停新 API key，不能继续引用下面残留的旧“立即签发”步骤。[官方帮助](https://help.pexels.com/hc/en-us/articles/900004904026-How-do-I-get-an-API-key)

## 2. 每个来源的媒体、许可与接入边界

### 1. Pixabay

- **媒体/内容：** video、image；社区实拍、动画及 AI 内容混合；film/animation 不是可靠的非 AI 标志。
- **适用方向：** 通用生活、自然风景、动物宠物、城市、商业、食物、运动、抽象动效。
- **接入：** free_self_service_key；优先级 P0。
- **使用条件：** Content License 允许免费改编使用；禁止原样独立分发或转售，品牌、肖像等另有边界。API 展示搜索结果要标示来源。
- **实际限制：** 文档仍显示登录/注册查看 key；用户已有 key。文档没有公开的通用排除 AI 参数，不要杜撰 exclude_ai。API 查询不是批量采集授权。
- **配额：** 默认 100 次/60 秒；查询缓存 24 小时；禁止系统性批量下载，要求真实用户请求。
- **依据：** [官网](https://pixabay.com/videos/) · [API 文档](https://pixabay.com/api/docs/) · [申请入口](https://pixabay.com/api/docs/) · [许可/使用说明](https://pixabay.com/service/license-summary/)。

```text
GET https://pixabay.com/api/videos/?key=SERVER_SIDE_KEY&q=QUERY
GET https://pixabay.com/api/?key=SERVER_SIDE_KEY&q=QUERY
```

### 2. Wikimedia Commons

- **媒体/内容：** video、image、audio；实拍、历史资料、动画和部分 AI 内容并存。
- **适用方向：** 具名地标、物种、铁路航空、历史、艺术文化、科学。
- **接入：** free_no_key；优先级 P0。
- **使用条件：** 按每条文件的 PD/CC0/CC BY/CC BY-SA 等条件使用；作者署名、许可链接及改编的相同方式共享条件可能适用，平台不保证所有权利无误。
- **实际限制：** 视频常为 WebM/Ogg，不保证 MP4；视频密度低于图片。读取 extmetadata，并提取 LicenseUrl、Artist、Credit。
- **配额：** 设置可识别 User-Agent；限流和服务政策适用；无固定无限请求承诺。
- **依据：** [官网](https://commons.wikimedia.org/) · [API 文档](https://commons.wikimedia.org/wiki/Help:Machine-readable_data) · [许可/使用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)。

```text
GET https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=QUERY%20filetype:video&prop=imageinfo&iiprop=url|extmetadata&format=json
```

### 3. NASA Image and Video Library

- **媒体/内容：** video、image、audio；任务实拍、历史档案、CGI/科学可视化混合。
- **适用方向：** 航天任务、火箭、宇航员、月球、地球观测、航空研究。
- **接入：** free_no_key；优先级 P0。
- **使用条件：** NASA 自有素材一般在美国无版权保护；第三方素材例外，须署 NASA 来源，不能暗示背书；广告中的标志及可识别人员有额外约束。
- **实际限制：** 先搜索 nasa_id，再请求 asset manifest 选视频变体；搜索结果的预览 links 不一定是视频文件。科学动画不能冒充任务实录。
- **配额：** 本视频库 API 不需要 api.nasa.gov key；其他 NASA API 的 DEMO_KEY/配额不要混用。
- **依据：** [官网](https://images.nasa.gov/) · [API 文档](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) · [许可/使用说明](https://www.nasa.gov/nasa-brand-center/images-and-media/)。

```text
GET https://images-api.nasa.gov/search?q=QUERY&media_type=video
GET https://images-api.nasa.gov/asset/NASA_ID
```

### 4. Internet Archive Moving Image Archive

- **媒体/内容：** video、image、audio；旧电影、历史档案、用户上传与当代内容，出处与许可混合。
- **适用方向：** 历史战争、旧工业交通、早期电影、旧广告、社会文化。
- **接入：** free_no_key；优先级 P0。
- **使用条件：** API 免费读取不代表条目可免费再剪辑。优先明确 PD/CC0/CC BY 的可信机构条目；无许可或仅可观看者不自动进入导出。
- **实际限制：** metadata.files 取可下载变体；licenseurl 缺失很常见，标为待核实。平台不新设版权不代表上传者有权授权。
- **配额：** 合理并发、缓存、可识别 User-Agent，遵从 429/Retry-After；不是全站镜像许可。
- **依据：** [官网](https://archive.org/details/movies) · [API 文档](https://archive.org/developers/) · [许可/使用说明](https://archive.org/about/terms.php)。

```text
GET https://archive.org/advancedsearch.php?q=mediatype:movies%20AND%20QUERY&output=json
GET https://archive.org/metadata/IDENTIFIER
```

### 5. Coverr

- **媒体/内容：** video、image、audio；实拍和 AI 库内容同索引，可按 is_ai_generated 过滤。
- **适用方向：** 航拍风景、城市旅行、人物生活、健身、商业、食物、科技。
- **接入：** free_demo_key_paid_production；优先级 P1。
- **使用条件：** 2026-11-04 最新许可明确 Demo 在内各 API 层可用于商业 SaaS/编辑器；Demo 必须署 Coverr/作者链接。Premium、赞助商内容另受访问和授权限制。禁止原样转售、竞争素材库、批量下载和模型训练。
- **实际限制：** 最新许可要求选用/下载时计数；旧 API 页称 recommended，按最新许可执行。旧 intro 曾否定商业使用，最新许可已明确允许；仍应保存所用许可版本。
- **配额：** Demo 免费 50 次/小时；Production 2,000 次/小时需要 Pro 或 Ultimate；Premium 一般需 Plus+。
- **依据：** [官网](https://coverr.co/stock-video-footage) · [API 文档](https://api.coverr.co/docs/start/) · [申请入口](https://coverr.co/developers/) · [许可/使用说明](https://coverr.co/license)。

```text
GET https://api.coverr.co/videos?query=QUERY&urls=true&filter=is_ai_generated:false
GET https://api.coverr.co/videos/ID
PATCH https://api.coverr.co/videos/ID/stats/downloads
```

### 6. DVIDS

- **媒体/内容：** video、image、audio；以美国国防/联邦部门现场实拍与报道为主，也有成片和图形。
- **适用方向：** 军事训练装备、舰船航空、救灾、人道援助、军医、军人体能、后勤工业。
- **接入：** free_self_service_key；优先级 P1。
- **使用条件：** API 条款明确免费商业使用；版权页注明联邦作品原则上 PD，单条标注其他版权者除外；不能暗示国防部门背书，保留拍摄者信息。
- **实际限制：** asset.files 提供 MP4、宽高、大小和码率；category=B-Roll 有助于找原始镜头。强烈美国军方视角，不应代替一般世界历史或具体他国事件。
- **配额：** 官方公开表示 API access currently open；注册/登录申请，域名/Origin 与 key 绑定；未核实统一固定配额。
- **依据：** [官网](https://www.dvidshub.net/) · [API 文档](https://api.dvidshub.net/docs) · [申请入口](https://api.dvidshub.net/) · [许可/使用说明](https://api.dvidshub.net/docs/copyright)。

```text
GET https://api.dvidshub.net/search?api_key=SERVER_SIDE_KEY&type=video&q=QUERY
GET https://api.dvidshub.net/asset?api_key=SERVER_SIDE_KEY&id=video:ID
```

### 7. Library of Congress

- **媒体/内容：** video、image、audio；早期实拍、历史影片、馆内讲座及文化收藏。
- **适用方向：** 早期电影、历史文化、旧工业、铁路交通、艺术、历史人物。
- **接入：** free_no_key；优先级 P1。
- **使用条件：** 逐条看 Rights & Access。明确 Public Domain Films / Free to Use and Reuse 集合比全站搜索更适合 MVP；不是所有馆藏可下载或免许可。
- **实际限制：** JSON 目录元数据不是可靠 MP4 下载清单；需解析 item/resources，部分只有流或不可下载。
- **配额：** 公开无 key；有动态限流和深分页限制，本轮直接抓 docs 曾遇 429。
- **依据：** [官网](https://www.loc.gov/film-and-videos/) · [API 文档](https://www.loc.gov/apis/json-and-yaml) · [许可/使用说明](https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/)。

```text
GET https://www.loc.gov/film-and-videos/?fo=json&q=QUERY
GET https://www.loc.gov/item/ITEM_ID/?fo=json
```

### 8. Europeana

- **媒体/内容：** video、image、audio、3d；文化机构聚合目录，历史图片占比高，也含视频。
- **适用方向：** 欧洲文化、艺术、民俗、历史、博物馆、传统工艺。
- **接入：** free_personal_key_reviewed_project_key；优先级 P2。
- **使用条件：** 元数据 CC0 与媒体许可分开；媒体由各机构持有，过滤 edm:rights/rights 仍需落地页核对；不能把免费目录 API 当全库免费授权。
- **实际限制：** 2025-05-28 起在 Europeana 账号 Manage API keys 申请；请求首选 X-Api-Key，旧 wskey 参数已弃用。视频可能只有提供方落地页/流，没有可下载 MP4。
- **配额：** 免费个人 key 自助即得，仅个人/非生产；生产 Project key 审核，官方目标 1–5 工作日；生产具体限额按申请条件。
- **依据：** [官网](https://www.europeana.eu/) · [API 文档](https://api.europeana.eu/en) · [申请入口](https://www.europeana.eu/account/api-keys) · [许可/使用说明](https://www.europeana.eu/en/rights/terms-of-use)。

```text
GET https://api.europeana.eu/record/v2/search.json?query=QUERY&qf=TYPE:VIDEO
```

### 9. U.S. National Park Service

- **媒体/内容：** video、image、audio；美国国家公园现场影像、解说和自然文化资料。
- **适用方向：** 美国目的地、山川湖泊、国家公园、野生动物、徒步、地质、遗产建筑。
- **接入：** free_self_service_key；优先级 P2。
- **使用条件：** NPS 员工公务作品通常在美国 PD，但供稿人、商标、人物等例外；逐条查看 credit/copyright。
- **实际限制：** 官方动态 Swagger 在本轮未能展开，候选 /multimedia/videos 路径没有完成官方 schema 核实，故不写为已验证 endpoint。先用官网媒体页人工导入或取得 key 后再联调。
- **配额：** 官方 API 免费登记；默认 1,000 次/小时。
- **依据：** [官网](https://www.nps.gov/) · [API 文档](https://www.nps.gov/subjects/developer/api-documentation.htm) · [申请入口](https://www.nps.gov/subjects/developer/get-started.htm) · [许可/使用说明](https://www.nps.gov/aboutus/disclaimer.htm)。

### 10. Mixkit

- **媒体/内容：** video；以实拍 stock 为主，另有动画与模板；不保证每条不是 AI。
- **适用方向：** 生活人物、健身、美食、旅行、城市、自然、节日。
- **接入：** manual_no_public_api_confirmed；优先级 P1 手动。
- **使用条件：** 必须区分 Video Free License（可商业项目）与 Restricted License（仅非商业）；不要求署名不等于允许重发成素材库。
- **实际限制：** 本轮未找到官方开放搜索/下载 API；不要把网站内部接口当获准公共 API。
- **依据：** [官网](https://mixkit.co/free-stock-video/) · [许可/使用说明](https://mixkit.co/license/)。

### 11. Dareful

- **媒体/内容：** video；官方称由摄影师 Joel Holland 拍摄的 4K/HD 实拍库。
- **适用方向：** 航拍、自然风景、山林湖海、旅行、城市、延时。
- **接入：** manual_no_public_api_confirmed；优先级 P1 手动。
- **使用条件：** 首页 License 指向 Creative Commons Attribution 4.0，需署名/链接并说明改动；不要把 open source 描述解读成无署名。
- **实际限制：** 本轮首页显示 242 个视频，适合精选补充，不是海量通用库；无已确认公共 API。
- **依据：** [官网](https://dareful.com/) · [许可/使用说明](https://creativecommons.org/licenses/by/4.0/)。

### 12. Vidsplay

- **媒体/内容：** video；摄影师拍摄的通用实拍库。
- **适用方向：** 自然、城市、旅行、动物、生活、交通。
- **接入：** manual_no_public_api_confirmed；优先级 P2 手动。
- **使用条件：** 免费个人/商业改编使用，要求网站/片尾/视频描述中加入 Vidsplay 可见链接；禁止原样分发、转售或再许可。
- **实际限制：** 无已确认公共 API；小型素材集合，不能视作主题全覆盖。
- **依据：** [官网](https://www.vidsplay.com/) · [许可/使用说明](https://www.vidsplay.com/terms/)。

### 13. Videezy

- **媒体/内容：** video；社区实拍与动态图形等，逐条检查。
- **适用方向：** 风景航拍、背景动效、城市、商业、交通。
- **接入：** manual_no_public_api_confirmed；优先级 P2 手动。
- **使用条件：** 免费 Standard/Community 内容通常须署名；Pro 付费；CC 非商业和 Editorial Only 与普通商业广告使用不同。以每条 License Info 为准。
- **实际限制：** 免费页与付费内容混合；本轮未确认公开素材搜索 API。
- **依据：** [官网](https://www.videezy.com/) · [许可/使用说明](https://support.videezy.com/en_us/videezy-standard-license-and-usage-HylDtxsDK)。

### 14. Magnific（原 Freepik；Videvo/Mazwai 当前跳转）

- **媒体/内容：** video、image；实拍、动画与 AI 创作功能混合的商业平台。
- **适用方向：** 通用人物、商业科技、自然旅行、食物、体育、动效。
- **接入：** manual_free_subset_api_not_verified；优先级 P2 手动。
- **使用条件：** 当前视频页有 Free 筛选，免费使用须署作者；Premium 与免费素材分开。页面所说可编辑不等于允许原始文件转售。
- **实际限制：** 本轮直接访问 mazwai.com 与 videvo.net 均跳到此站，不再计为两个独立库；普通许可对向第三方交付要求具体人工参与，并限制 AI/ML 使用，不能默认拿免费素材做自动 SaaS。存在 API 入口，但未核实免费视频目录权限。
- **依据：** [官网](https://www.magnific.com/videos) · [许可/使用说明](https://www.magnific.com/legal/terms-of-use)。

### 15. NOAA Ocean Exploration

- **媒体/内容：** video、image；深海科考、海洋生物现场实拍与科学展示。
- **适用方向：** 深海、海洋生物、水下地形、科考、海洋气候。
- **接入：** manual_no_public_stock_api_confirmed；优先级 P1 手动。
- **使用条件：** Ocean Exploration 说明除特别标注外原则上 PD，使用原条目 credit；NOAA 其他部门成片常混第三方镜头，不能全站自动白名单。
- **实际限制：** 未确认统一 stock 视频检索下载 API；数据 API、天气 API 不等于素材 API。
- **依据：** [官网](https://oceanexplorer.noaa.gov/) · [许可/使用说明](https://oceanexplorer.noaa.gov/faqs/)。

### 16. USGS Multimedia Gallery

- **媒体/内容：** video、image、audio；地质、水文、生态、灾害现场实拍及可视化。
- **适用方向：** 火山地震、地质、河流、生态、矿产、自然灾害。
- **接入：** manual_no_public_stock_api_confirmed；优先级 P1 手动。
- **使用条件：** Gallery 条目除注明外 PD；USGS 自有作品通常美国 PD，第三方例外，人员肖像商业使用可能需另许可。
- **实际限制：** 数据服务丰富不代表存在统一视频 stock API；本轮不把 ScienceBase 元数据接口当已接入视频供应商。
- **依据：** [官网](https://www.usgs.gov/products/multimedia-gallery) · [许可/使用说明](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)。

### 17. ESO Videos

- **媒体/内容：** video、image；天文台、星空实拍与大量天文学 CGI/科学动画。
- **适用方向：** 天文台、望远镜、星空、宇宙可视化。
- **接入：** manual_no_public_stock_api_confirmed；优先级 P1 手动。
- **使用条件：** 公共站视频通常 CC BY 4.0（例外按条目）；完整 credit 清晰可见、说明改动，YouTube 仅描述栏署名不足其要求；不能暗示背书，可识别人员商业使用有限制。
- **实际限制：** 有 CGI/艺术想象，不应说成真实星际摄像；未确认稳定通用视频检索 API。
- **依据：** [官网](https://www.eso.org/public/videos/) · [许可/使用说明](https://www.eso.org/public/copyright/)。

### 18. ESA Multimedia

- **媒体/内容：** video、image；航天任务实录、节目及动画可视化。
- **适用方向：** 欧洲航天、任务背景资料、地球观测。
- **接入：** manual_permission_mixed；优先级 暂不自动接入。
- **使用条件：** 不能作为默认免费可剪素材库。ESA Help 明确部分 VOD 含已授权音乐/stock，未经明确同意不得切片用于别的制作；商业目的联系 ESA。
- **实际限制：** 按具体许可开放的条目可单独评估；机构网站可看不等于可再剪辑。
- **依据：** [官网](https://www.esa.int/ESA_Multimedia) · [许可/使用说明](https://www.esa.int/ESA_Multimedia/Help)。

### 19. Pond5 Public Domain Project

- **媒体/内容：** video、image、audio；历史档案、公有领域媒体精选。
- **适用方向：** 历史、旧工业、旧交通、早期电影。
- **接入：** manual_free_subset_commercial_api_separate；优先级 P2 手动。
- **使用条件：** 仅 Public Domain 项目可作免费候选；不外推整个 Pond5 商业库存。仍核对原件状态和使用地区。
- **实际限制：** Pond5 API 是商务定制授权/报价，免费网页集合不等于免费 API。
- **依据：** [官网](https://www.pond5.com/public-domain) · [API 文档](https://www.pond5.com/api) · [许可/使用说明](https://www.pond5.com/public-domain)。

### 20. Blender Open Movies

- **媒体/内容：** video、3d；人工制作动画/CGI，也有实拍合成开放电影。
- **适用方向：** 动画、电影制作、视觉特效、科幻示意。
- **接入：** manual_no_stock_search_api；优先级 P2 手动。
- **使用条件：** 开放影片依各片 CC BY 等许可署名；制作文件/样例可能不同许可，不统一外推。
- **实际限制：** 用于开放影片片段/动画示意，不是现实历史、动物行为或新闻实录的替代品。
- **依据：** [官网](https://studio.blender.org/films/) · [许可/使用说明](https://www.blender.org/download/demo-files/)。

### 21. Wellcome Collection

- **媒体/内容：** image、catalogue、possible_video；医学史、健康文化馆藏，以图片、书籍和档案为主。
- **适用方向：** 医学史、疾病图像史、科学史、健康文化。
- **接入：** free_no_key_catalogue_video_delivery_not_verified；优先级 P2 图片补充。
- **使用条件：** Wellcome 自有元数据 CC0，但原始媒体许可有 PD/CC BY/NC/在版权期等不同，不能统一商用。
- **实际限制：** 无 key 元数据 API 已核实；本轮未核实稳定的 MP4 素材交付链，不计入即接即用视频 API 数量。
- **依据：** [官网](https://wellcomecollection.org/) · [API 文档](https://developers.wellcomecollection.org/docs/catalogue) · [许可/使用说明](https://wellcomecollection.org/research-access-to-our-collections)。

```text
GET https://api.wellcomecollection.org/catalogue/v2/works?query=QUERY
```

### 22. The Met Collection API

- **媒体/内容：** image；艺术品实物摄影/扫描。
- **适用方向：** 艺术、服饰史、古文明、器物、宗教艺术。
- **接入：** free_no_key；优先级 P2 图片补充。
- **使用条件：** Open Access 公有领域图像与数据 CC0；筛选 isPublicDomain 并确认有图，不是所有艺术品图片都开放。
- **实际限制：** 仅图片，不是视频库。
- **配额：** 无需 key；官方要求低于 80 次/秒；2026-10-01 旧 v1/search 退休，应使用 v1.1/search。
- **依据：** [官网](https://www.metmuseum.org/) · [API 文档](https://metmuseum.github.io/) · [许可/使用说明](https://www.metmuseum.org/policies/terms-and-conditions)。

```text
GET https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=QUERY
GET https://collectionapi.metmuseum.org/public/collection/v1/objects/OBJECT_ID
```

### 23. Art Institute of Chicago API

- **媒体/内容：** image；艺术品图像与元数据。
- **适用方向：** 绘画、艺术、历史人物肖像、设计。
- **接入：** free_no_key；优先级 P2 图片补充。
- **使用条件：** 媒体版权逐条，以 is_public_domain 与可用 image_id 筛选开放图，不能用元数据开放推断所有图像开放。
- **实际限制：** 普通公开 API 无 key；主要用 IIIF 图片，不计视频来源。
- **依据：** [官网](https://www.artic.edu/) · [API 文档](https://api.artic.edu/docs/) · [许可/使用说明](https://api.artic.edu/docs/#copyright)。

```text
GET https://api.artic.edu/api/v1/artworks/search?q=QUERY
```

### 24. Smithsonian Open Access

- **媒体/内容：** image、3d、catalogue；馆藏图像、三维及数据。
- **适用方向：** 自然史、艺术、历史文化、航空器物、动物标本。
- **接入：** free_self_service_key；优先级 P2 图片补充。
- **使用条件：** 只把 CC0 明确标识媒体纳入可商用；非 CC0 的商业使用可能需书面许可。元数据开放不代表媒体开放。
- **实际限制：** 官方 FAQ 核实 api.data.gov key 注册入口；不承诺视频供应，适合静态补充。
- **依据：** [官网](https://www.si.edu/openaccess) · [API 文档](https://www.si.edu/openaccess/faq) · [申请入口](https://api.si.edu/) · [许可/使用说明](https://www.si.edu/openaccess/faq)。

### 25. Pexels

- **媒体/内容：** video、image；以实拍 photo/video 为核心；不作每条真实性担保。
- **适用方向：** 自然旅行、城市建筑、人物生活、商业、健身、食物。
- **接入：** new_key_issuance_paused；优先级 已有 key 时 P0；新项目不能依赖。
- **使用条件：** Pexels License 允许免费使用和修改，禁止未修改转售、做其他 stock 平台分发、暗示人物品牌背书等。API 还要遵守自身条款与来源展示要求。
- **实际限制：** 官方帮助 2026-11-09 更新明确 New API key issuance is currently paused，旧的即时签发说明不可继续引用；手动网站素材可作备用。
- **依据：** [官网](https://www.pexels.com/videos/) · [API 文档](https://www.pexels.com/api/documentation/) · [申请入口](https://www.pexels.com/api/) · [许可/使用说明](https://www.pexels.com/license/)。

```text
GET https://api.pexels.com/videos/search?query=QUERY
```

## 3. 所有主题与免费来源映射

**读表方式：** “优先 API”里的来源均有公开接口，Coverr 等仍须申请、Europeana 生产须审；“人工/后续补充”可包含有 API 但尚不适合本轮自动接入的专业目录。Pexels 新 key 暂停，表内不把它当新项目 API 依赖，但已有 key 或手动下载时可作为通用备用。

**覆盖判断为产品判断。** 根据库的定位、媒体类型与许可评估，尚未进行同等关键词、同等条数的召回率实测，所以不能断言“某个库的风景最多”或“某个库有某场比赛”。

### 人物与生活

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 体育赛事 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Videezy](https://www.videezy.com/) | 比赛实录稀缺。指定球星/比赛的免费精确覆盖没有可靠保证；通用足球场不是比赛本身。 |
| 运动与健身 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用覆盖较好。具体健身教程动作需人工检查正确性。 |
| 日常生活 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 通用覆盖较好。优先真实人物、生活动作，不让 AI/摆拍冒充事件。 |
| 家庭与亲子 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用覆盖较好。亲子/儿童肖像和敏感叙事需匹配使用条件。 |
| 情感与关系 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/) | 概念表达较好。特定情绪/动作需要画面审核，人物不能被诽谤性关联。 |
| 手工、DIY 与维修（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用流程可做。步骤连续性和安全操作必须人工审核。 |
| 无障碍、老龄与社会服务（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [DVIDS](https://www.dvidshub.net/)、[Library of Congress](https://www.loc.gov/film-and-videos/) | 概念画面可做。避免以可识别人物暗示疾病、贫困或其他敏感身份。 |

### 文化与娱乐

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 明星与娱乐新闻 | [Wikimedia Commons](https://commons.wikimedia.org/) | [Internet Archive Moving Image Archive](https://archive.org/details/movies) | 当前精确视频明显不足。免费人物照片可能有，明星采访/红毯片段不应默认免费复用。 |
| 影视与电影文化 | [Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Library of Congress](https://www.loc.gov/film-and-videos/)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Pond5 Public Domain Project](https://www.pond5.com/public-domain)、[Blender Open Movies](https://studio.blender.org/films/) | 早期开放影片可做。现代影视切片不存在通用免费授权库；开放动画另计。 |
| 音乐与演出 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用乐器舞台较好。画面许可不等于录音/词曲许可，指定歌手演出往往需另授权。 |
| 艺术与博物馆 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Europeana](https://www.europeana.eu/) | [Library of Congress](https://www.loc.gov/film-and-videos/) | 图片强、视频偏少。可用 Met/Artic/Smithsonian 图片做运镜；馆内拍摄仍查作品权利。 |
| 传统文化与民俗 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Europeana](https://www.europeana.eu/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies) | [Library of Congress](https://www.loc.gov/film-and-videos/) | 机构资料较好。地区、年代、民族与仪式要精准，避免泛亚洲/泛欧洲替代。 |
| 时尚与美妆 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 通用画面可做。具体品牌秀场和明星广告不是免费 stock。 |
| 游戏与电竞 | [Pixabay](https://pixabay.com/videos/)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 玩家设备可做。游戏内画面建议用户自录并按发行商规则；赛事转播不是 stock。 |
| 宗教、寺庙与仪式（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[Europeana](https://www.europeana.eu/)、[Pixabay](https://pixabay.com/videos/) | [Library of Congress](https://www.loc.gov/film-and-videos/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies) | 图片强、精确视频不均。尊重具体仪式背景；艺术品与拍摄许可分别核对。 |
| 考古、古文明与文物（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[Europeana](https://www.europeana.eu/) | [Library of Congress](https://www.loc.gov/film-and-videos/) | 图片强、现场视频稀缺。Met/Artic/Smithsonian 是静态补充；CGI 复原需标示意。 |
| 舞蹈与舞台表演（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用表演可做。具体编舞、现场音轨、演出者许可分别核对。 |

### 自然与地点

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 旅行与目的地 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Dareful](https://dareful.com/)、[Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 通用覆盖较好。精确目的地先查地点元数据；美国国家公园可扩 NPS。 |
| 自然风景 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Dareful](https://dareful.com/)、[Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 通用覆盖较好。漂亮风景不能代替脚本里的具体地名。 |
| 山川湖泊 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Dareful](https://dareful.com/)、[Mixkit](https://mixkit.co/free-stock-video/) | 通用覆盖较好。美国具名山川可补 NPS；场景相似不等于同一山峰。 |
| 城市与街景 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Dareful](https://dareful.com/)、[Mixkit](https://mixkit.co/free-stock-video/)、[Videezy](https://www.videezy.com/) | 通用覆盖较好。需地理一致性，城市标志性建筑优先 Commons。 |
| 建筑与空间 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/)、[Europeana](https://www.europeana.eu/) | 外观较好、内景不稳定。具名建筑、室内、私人产权及全景自由因国家不同。 |
| 地产与家居 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 概念覆盖较好。指定房源应用户提供素材，不能用 stock 误示真实房屋。 |
| 海洋与水下 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/)、[Dareful](https://dareful.com/) | 浅海 stock 较好，深海有专业补充。精确物种/深度/地点查 NOAA 原始说明。 |
| 野生动物 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [U.S. National Park Service](https://www.nps.gov/)、[NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/)、[USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery) | 常见物种较好。珍稀行为/具体栖息地覆盖不足，不能用近缘种代替。 |
| 宠物 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 通用覆盖较好。具体品种和训练动作需目检。 |
| 农业与乡村 | [Pixabay](https://pixabay.com/videos/)、[Wikimedia Commons](https://commons.wikimedia.org/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies) | 通用农业可做。作物、机械工艺和国家季节不能乱配。 |
| 环保、生态与保育（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[NASA Image and Video Library](https://images.nasa.gov/)、[Pixabay](https://pixabay.com/videos/) | [USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)、[U.S. National Park Service](https://www.nps.gov/)、[NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/) | 专业/概念均有。区分实际生态项目和泛自然示意画面。 |
| 昆虫、植物与微距（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [U.S. National Park Service](https://www.nps.gov/)、[USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery) | 常见物种较好。物种识别优先，微距照片可补充视频不足。 |
| 户外、徒步与露营（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [U.S. National Park Service](https://www.nps.gov/)、[Mixkit](https://mixkit.co/free-stock-video/)、[Dareful](https://dareful.com/) | 通用覆盖较好。国家公园目的地用 NPS，不能展示不安全动作做教学。 |

### 科学与技术

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 航天与天文 | [NASA Image and Video Library](https://images.nasa.gov/)、[Wikimedia Commons](https://commons.wikimedia.org/) | [ESO Videos](https://www.eso.org/public/videos/) | 专业来源清晰。NASA 任务实录/CGI分开；ESA 未确认允许重编者不自动导出。 |
| 地球与气候 | [NASA Image and Video Library](https://images.nasa.gov/)、[Wikimedia Commons](https://commons.wikimedia.org/) | [NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/)、[USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)、[ESO Videos](https://www.eso.org/public/videos/) | 科学资料较好。卫星图、可视化和现场录像分开标记。 |
| 科技与数码 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 概念覆盖较好。具体产品功能、UI、性能演示用用户素材/录屏。 |
| AI 与机器人 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Blender Open Movies](https://studio.blender.org/films/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 概念画面多，真实设备较少。真实机器人型号、演示能力需精确匹配；抽象大脑是示意。 |
| 工业与制造 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Mixkit](https://mixkit.co/free-stock-video/) | 普通工厂较好。复杂生产工艺/指定工厂免费精确覆盖不保证；DVIDS 仅部分后勤制造。 |
| 能源与基础设施 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)、[Internet Archive Moving Image Archive](https://archive.org/details/movies) | 通用设施可做。指定电厂和油田按地点核对；能源数据最好自绘。 |
| 医疗与健康 | [Pixabay](https://pixabay.com/videos/)、[Wikimedia Commons](https://commons.wikimedia.org/)、[Coverr](https://coverr.co/stock-video-footage) | [Wellcome Collection](https://wellcomecollection.org/)、[DVIDS](https://www.dvidshub.net/) | 一般医护可做，专业操作不足。医学史用 Wellcome；真实手术不是普通 stock，避免误导。 |
| 教育与科学实验 | [Pixabay](https://pixabay.com/videos/)、[Wikimedia Commons](https://commons.wikimedia.org/)、[NASA Image and Video Library](https://images.nasa.gov/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Wellcome Collection](https://wellcomecollection.org/) | 通用课堂实验可做。实验条件和结论需核对；不要用不相关实验表现科学事实。 |
| 地质、火山与地震（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[NASA Image and Video Library](https://images.nasa.gov/) | [USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)、[U.S. National Park Service](https://www.nps.gov/) | 专业资料较好。地震新闻现场不等于可复用；USGS 科学影像优先。 |
| 天气、风暴与自然灾害（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[NASA Image and Video Library](https://images.nasa.gov/)、[Pixabay](https://pixabay.com/videos/) | [NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/)、[USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)、[DVIDS](https://www.dvidshub.net/) | 现象示意较好，实时事件不齐。雷雨 stock 不是某场灾害；追溯日期地点。 |
| 软件、SaaS 与产品教程（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Mixkit](https://mixkit.co/free-stock-video/) | 通用 B-roll 不解决真实演示。核心画面用用户录屏；没有能覆盖所有产品最新 UI 的免费库。 |

### 事件与社会

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 历史与战争 | [Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Wikimedia Commons](https://commons.wikimedia.org/)、[Library of Congress](https://www.loc.gov/film-and-videos/) | [Pond5 Public Domain Project](https://www.pond5.com/public-domain)、[Europeana](https://www.europeana.eu/) | 部分事件强，整体不均。优先机构、年代和拍摄地点可溯源条目；档案水印不等于授权。 |
| 新闻与国际事件 | [Wikimedia Commons](https://commons.wikimedia.org/)、[DVIDS](https://www.dvidshub.net/) | [Internet Archive Moving Image Archive](https://archive.org/details/movies) | 当前事件明显不足。DVIDS 仅对应军方/联邦题材；Reuters/AP 可观看不等于免费商用。 |
| 政治与公共人物 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[DVIDS](https://www.dvidshub.net/) | [Library of Congress](https://www.loc.gov/film-and-videos/) | 部分公共讲话可做。人物、日期、国家和出处必须一致；美国联邦作品不能外推他国政府。 |
| 案件与悬疑 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Pixabay](https://pixabay.com/videos/) | [Library of Congress](https://www.loc.gov/film-and-videos/) | 精确案件资料不足。通用警灯/夜街只能标示意，不能暗示画中人为涉案人。 |
| 军武、国防与军史（新增） | [DVIDS](https://www.dvidshub.net/)、[Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies) | [Library of Congress](https://www.loc.gov/film-and-videos/)、[Pond5 Public Domain Project](https://www.pond5.com/public-domain) | 部分专业资料丰富。DVIDS 偏美国当前训练，不能用当前演习假称历史实战。 |
| 消防、救援与人道援助（新增） | [DVIDS](https://www.dvidshub.net/)、[Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/) | [USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery) | 部分专业资料较好。具体灾难受害者画面和地点时间应核实。 |
| 人物传记与发明史（新增） | [Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Library of Congress](https://www.loc.gov/film-and-videos/) | [Europeana](https://www.europeana.eu/) | 年代依赖强。近现代私人生活影像和当代名人精确录像往往不免费。 |

### 商业与交通

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 商业与职场 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 通用覆盖较好。具体公司办公画面和创始人不一定有免费录像。 |
| 财经与经济 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Internet Archive Moving Image Archive](https://archive.org/details/movies) | 概念覆盖较好。数据/行情图建议自绘；交易所商标不等于广告背书许可。 |
| 美食与烹饪 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 通用覆盖较好。具体菜品、地区及烹饪步骤核对。 |
| 汽车与公路 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage) | [Dareful](https://dareful.com/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Videezy](https://www.videezy.com/) | 通用覆盖较好。指定车型、年份和广告中的商标条件需核对。 |
| 铁路与列车 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[Pixabay](https://pixabay.com/videos/) | [Library of Congress](https://www.loc.gov/film-and-videos/)、[Pond5 Public Domain Project](https://www.pond5.com/public-domain) | 具名交通有开放资料。站点、车型和线路年代按说明对应。 |
| 航空与航海 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Internet Archive Moving Image Archive](https://archive.org/details/movies)、[NASA Image and Video Library](https://images.nasa.gov/)、[DVIDS](https://www.dvidshub.net/) | [Library of Congress](https://www.loc.gov/film-and-videos/)、[Pond5 Public Domain Project](https://www.pond5.com/public-domain) | 航空舰船专业来源较多。机型、舰名、军种和拍摄日期必须确认。 |
| 物流、港口与供应链（新增） | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/)、[DVIDS](https://www.dvidshub.net/) | [Internet Archive Moving Image Archive](https://archive.org/details/movies) | 通用覆盖较好。DVIDS 后勤并非一般商业港口，精确企业须自有素材。 |

### 氛围与视觉

| 主题 | 优先 API | 人工/后续补充 | 覆盖判断与边界 |
|---|---|---|---|
| 睡眠与冥想 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Dareful](https://dareful.com/)、[Mixkit](https://mixkit.co/free-stock-video/)、[Vidsplay](https://www.vidsplay.com/) | 可做但长镜头稀缺。短片重复拼接不是无限自然长镜头；检查闪烁与循环接缝。 |
| 抽象与动态图形 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Blender Open Movies](https://studio.blender.org/films/)、[Videezy](https://www.videezy.com/)、[Magnific（原 Freepik；Videvo/Mazwai 当前跳转）](https://www.magnific.com/videos) | 通用覆盖较好。明确区分动画/AI/实拍，不能作事实证据。 |
| 节日与季节 | [Pixabay](https://pixabay.com/videos/)、[Coverr](https://coverr.co/stock-video-footage)、[Wikimedia Commons](https://commons.wikimedia.org/) | [Mixkit](https://mixkit.co/free-stock-video/)、[Dareful](https://dareful.com/) | 通用覆盖较好。文化节日、气候季节和地区要对应。 |
| 地图、数据与地理解释（新增） | [NASA Image and Video Library](https://images.nasa.gov/)、[Wikimedia Commons](https://commons.wikimedia.org/) | [USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery) | 数据图像强，建议自制动画。免费地图图像不等于地图瓦片无请求限制；数据来源、样式、底图许可分别核对。 |

## 4. 哪些方向不适合承诺“免费自动找齐”

| 方向 | 免费供给缺口 | MVP 应采取的处理 |
|---|---|---|
| 指定体育赛事/球星 | 转播与比赛画面通常不因可在线观看而开放再剪辑 | 用户上传已获授权片段；或切换泛体育说明视频 |
| 当代明星/红毯/指定演出 | 新闻/艺人画面和录音、词曲多层权利 | 免费照片或公开许可片段需明确说明；否则使用授权输入 |
| 最新新闻/真实案件 | 事件精确录像免费且可商业复用的供给不稳定 | 显示来源、日期和缺口，拒绝拿别的事件镜头顶替 |
| 具体产品/软件教程 | 免费 stock 无法还原最新 UI 与产品功能 | 用户录屏、官方允许复用的媒体包、自有产品素材 |
| 指定房源/公司/生产工艺 | 通用 stock 只是概念表达 | 用户自有素材，或有证据的精确对象素材 |
| 全程连续实拍/冥想长镜头 | 免费库多为短片，循环显著、风格不一致 | 限定时长与镜头数量，或选择长录像的明确许可条目 |

免费新闻/体育缺口不能用 Getty、Reuters、AP、British Pathé 的可看预览当补足。它们不是本 MVP 的免费默认源。Storyblocks 可自助取得测试 key，但生产 key 和内容许可需商务；Shutterstock/Pond5 也是授权方案，不是免费成片素材的通用入口。[Storyblocks 官方接入步骤](https://developer.storyblocks.com/about-us) · [Shutterstock 开发者方案](https://www.shutterstock.com/developers) · [Pond5 API](https://www.pond5.com/api)

## 5. 针对低存储 MVP 的接入顺序

1. **第一层通用与精确对象：** Pixabay；有合规既有 key 才开 Pexels；Commons 保留逐条许可。先确认前三候选可采用率。
2. **第二层明确专业领域：** 航天 NASA；军武/救灾/航空 DVIDS；历史 Archive + LoC。各自路由，不全源并发搜索所有脚本。
3. **第三层补通用：** Coverr Demo，纯实拍需求用 `filter=is_ai_generated:false`，排除无权限 Premium/赞助条目，选择后回报下载计数。
4. **第四层机构与人工补充：** Europeana/NPS；NOAA、USGS、ESO、Mixkit、Dareful 人工导入。机构视频先解决交付和许可，不只显示漂亮目录。
5. **图片作为明确降级：** Met、Artic、Wellcome、Smithsonian。可以做图片运镜，但 UI/导出应知道这是图片，不把它们计入视频召回。

### 最小候选数据结构

```json
{
  "provider": "source_id",
  "assetId": "id",
  "sourcePage": "https://official-source/item",
  "creator": "author",
  "licenseCode": "CC-BY-4.0 / PD / provider-license / unknown",
  "licenseUrl": "https://license",
  "credit": "required credit line",
  "rightsVerified": false,
  "mediaType": "video / image / animation / visualization",
  "isAiGenerated": null,
  "previewUrl": "preview",
  "downloadUrl": "selected variant only",
  "width": 1920,
  "height": 1080,
  "durationSeconds": 12,
  "capturedAt": null,
  "retrievedAt": "2026-11-10",
  "downloadTrackingRequired": false
}
```

对未知许可、明确 NC/ND 或仅观看内容，展示为“需核对”，不默认作为可商业导出的候选。政府来源按“具体制作机构与条目”核对，不能只检查域名 `.gov`。

### 存储与流量策略

- 搜索阶段只缓存元数据与允许的缩略图/预览，按照提供方缓存要求保存查询；Pixabay 明确要求 24 小时。
- 用户选中后再取对应文件，按需生成工作副本与最终成片，不预抓整库。
- 不承诺所有源都支持服务端只下载某几秒。HTTP Range、编码关键帧与容器索引会影响是否仍需下载大文件。
- 项目临时媒体限量、设置过期删除；保留小体积来源/许可记录与镜头时间码，用户可导出来源清单。
- 同一画面可能跨平台分发，内容去重应结合来源 ID、感知哈希和原作者，不以水印猜 API。

## 6. 研究限制与需复核项

- 未新注册任何供应商账户，未代提交生产申请；所有“可申请”仅指官方流程仍公开提供，非实际签发承诺。
- 本轮未执行素材下载或全面关键词基准；没有将目录数量当成可用、准确、合规片段数量。
- NPS 动态文档未读到视频 schema；Wellcome 仅完成无 key 馆藏接口确认；Magnific 的免费目录 API 权限未确认。
- LoC 官方 API 页面直接访问曾返回 429，公开检索可读到官方说明，接入时须处理限流。
- Coverr 文档存在旧新口径差异。2026-11-04 最新 License 对免费 Demo 商业使用和下载计数作了明确规定，本报告按较新且更具体的条件处理。
- Pexels 暂停新 key 属动态状态；恢复时间未见官方承诺。
- “官方说可免费使用”不构成对第三方肖像、商标、私产和音乐权利的统一清除；素材记录应带来源和使用条件。

## 7. 补充官方证据链接

- [DVIDS API 条款明确商业使用](https://api.dvidshub.net/docs/tos)、[MP4 资产字段](https://api.dvidshub.net/docs/asset_api)、[视频检索过滤](https://api.dvidshub.net/docs/search_api)。
- [Europeana 个人/项目 key 申请步骤与审核](https://europeana.atlassian.net/wiki/spaces/EF/pages/2462351393)。
- [NPS API 认证与配额](https://www.nps.gov/subjects/developer/guides.htm)。
- [Coverr 最新许可](https://coverr.co/license)、[额度与 key](https://api.coverr.co/docs/start/)、[搜索/下载接口](https://api.coverr.co/docs/videos/)。
- [Pixabay AI 内容政策](https://pixabay.com/service/faq/)、[Commons AI 视频分类确实存在](https://commons.wikimedia.org/wiki/Category:AI-generated_videos)。
- [Internet Archive 元数据读取](https://archive.org/developers/md-read.html)、[Internet Archive 官方工程仓库中的检索说明](https://github.com/internetarchive/dweb-archive/blob/master/docs/archive_architecture_ipfs.md)。
- [NOAA 视频可能含第三方版权的说明](https://oceanservice.noaa.gov/about/faq.html)、[USGS Multimedia Gallery](https://www.usgs.gov/products/multimedia-gallery)。
- [Mixkit 两种视频许可与商用说明](https://mixkit.co/free-stock-video/)、[Vidsplay 署名及禁止原样转售](https://www.vidsplay.com/terms/)。
