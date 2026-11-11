**GoMotion 的素材来源判断与可用视频素材 API 清单**

核查截至 2026 年 11 月 10 日。目标仅为 gomotionai.com。以下是公开资料调查，没有访问其后台、没有生成付费样片，也没有取得其供应商合同。

**11 月 10 日新增演示画面证据**

- 实际查看[官方教程](https://gomotionai.com/tutorial)。约 4:16 的录屏帧中，成片预览内直接可读 `ROMANO-ARCHIVES` 水印；内层历史画面周围保留深色背景。截图：`evidence/gomotion-tutorial-4m16-romano-archives.png`。右侧还有独立编号的 MP4 素材及 Replace 按钮。
- [Romano Archives 自述](https://digilander.libero.it/romanoarchives/)说明其提供历史影像，并关联 UnknownWW2InColor 等 YouTube 频道。这使“已有历史档案内容被纳入演示”的判断有了画面线索，不再只有 GoMotion 的宣传文字。
- 尚未找到该镜头对应的原始视频与精确时间码；水印不能单独证明 GoMotion 的直接取片网站、API、授权状态，也不能证明所有帧均未经过生成或修复。
- 本轮对 Pexels、Pixabay、Coverr、Storyblocks、Shutterstock、Adobe Stock、Getty、Pond5 的域名做了水印关键词的公开网页检索，未得到可确认的同款命中。不是逐库完整搜索，也没有持 API key 请求各家的接口；无搜索结果不能作为排除这些库的证据。
- 两张 Wikimedia M40 炮兵照片经目视对照均未匹配，不计为来源命中。
- 更新工作假设：对教程里的历史题材，应优先调查历史档案及其传播渠道；通用免费 stock API 仍可用于开发自己的 MVP，但不能据此称其为 GoMotion 的已确认后端。

**算法与存储边界（实现建议，未经确认是 GoMotion 的内部方案）**

1. 用语言模型将脚本拆为镜头需求，抽取事件、时间、地点、人物与允许的替代画面，生成关键词及多语言改写。
2. 先通过外部搜索或素材目录取得候选元数据，再筛选少量有权限使用的候选。检索元数据与取得媒体文件是两个步骤；YouTube Data API 本身不提供素材下载授权。
3. 对获准处理的候选做镜头切分和抽帧，用视觉模型/图文相似度做初筛，再结合来源说明核实年代、人物、地点；视觉相似度不能证明史实准确。
4. 输出源 ID、来源链接、镜头起止时间和置信度，由用户确认低置信度匹配后渲染。可从少量候选按需处理起步，无需自建全网视频仓库，但仍有下载、解码、临时存储和网络成本。
5. 统一输出画布可通过缩放裁切或补边完成。1080p 成片的每帧尺寸一致，不说明所有原素材分辨率一致，也不能据此区分生成与拼接。

技术参考：[YouTube Search API](https://developers.google.com/youtube/v3/docs/search/list) · [CLIP 图文匹配原理](https://openai.com/index/clip/) · [TwelveLabs 已建索引内的片段检索](https://docs.twelvelabs.io/docs/resources/playground/search) · [FFmpeg 缩放与裁切](https://ffmpeg.org/ffmpeg-filters.html)

**目前不能确认 GoMotion 使用哪个具体素材库。较合理的工作假设是：它自行编排多来源素材检索和取回，混合通用 stock 与公开互联网来源，再进行短期处理与渲染。** Pexels/Pixabay 可以列为待查候选，但没有直接证据证明它们已经被 GoMotion 接入。也没有足够依据认定 Storyblocks、Shutterstock 或 Adobe Stock 是其主库。

官网一手信息可压缩为三点：

- Legal：按脚本取回 stock 与公开互联网素材，授权由用户负责；R2 存项目，RunPod 渲染；编辑项目约 12 小时后清理。
- Developers：导出文件保留 48 小时；有 YouTube 参考内容与发布相关流程。
- 两份公开文件都没有披露可确认的具体素材供应商。

处理商名单不等于完整供应商清单，用户项目的清理也不能证明没有共享素材缓存。YouTube 的参考或发布接口不能证明它负责取得最终成片的镜头。

来源：[GoMotion Legal，页面标注更新于 2026-10-11](https://gomotionai.com/legal) · [GoMotion Developers](https://gomotionai.com/developers)

如果必须在传统素材 API 中优先排查，我会先看 Pexels/Pixabay，因为它们具有低门槛的公开视频检索接口；这是接入成本和产品形态上的推测，证据强度低。对 GoMotion 更有把握的判断是“来源未完整披露、自己做内容编排”，而非某个供应商品牌。

同样，不能给出它采用 SerpAPI、Brave Search、某个下载器或某套视觉检索模型的结论。公开条款没有披露这些名称。网页能搜索到视频、API 返回视频元数据和取得可重新使用的视频文件，是不同步骤。

以下八家均能找到官方视频素材 API 资料。表中的适配建议是本次产品判断，实际素材覆盖要用真实脚本测量，价格与最终用户用途以各平台方案及合同为准。

| 素材平台 | 已确认的视频 API 能力 | 接入与收费形态 | 对快速 MVP 的适配 |
|---|---|---|---|
| **Pexels** | 关键词视频搜索、预览图片、作者/时长等元数据、不同尺寸视频文件地址 | API key；免费额度，默认 200 请求/小时、20,000 请求/月，须遵守署名/展示和使用条款 | **首批优先测试**。适合城市、自然、办公等通用画面，不保证特定事件或人物 |
| **Pixabay** | `/api/videos/` 检索及视频文件信息，含视频与动画类别 | API key；默认 100 请求/60 秒，要求缓存 API 请求 24 小时，禁止系统性大规模下载，自动请求使用范围要核对 | **作为第二来源测试**。不要预设与 Pexels 的覆盖一定互补 |
| **Coverr** | 视频搜索、预览、下载地址等，提供开发者文档 | 当前入门页列 Demo 50 请求/小时；生产状态需 Pro 或 Ultimate，额度 2,000/小时；商业 API 用途仍需核对相关条款 | 可列候选，不应把“免费网页视频”直接等同于“免费商业 API” |
| **Storyblocks** | 为产品内用户提供视频、图片、音乐检索、预览和授权接入 | 测试 key 后与销售沟通生产 key 与许可 | **付费 API 优先询价对象**。产品内集成用途清楚，但不能用个人订阅价推算 SaaS 总成本 |
| **Shutterstock** | 视频搜索、详情、预览、授权、下载；有正式 REST API 与 SDK | 创建应用；正式素材授权需要适用的付费/API 权益，API 与网站订阅形态需区分 | 完整商业候选，先测素材覆盖，再算每条成片的授权成本 |
| **Adobe Stock** | 搜索视频等资产、预览、许可状态、请求许可、下载及许可历史 | 搜索可申请 API key；授权下载需要用户/组织鉴权和相应购买权益，Licensing API 测试需联系账户或企业团队 | 适合已有 Adobe 权益的用户或组织，不能把免费搜索当作免费视频授权 |
| **Getty Images / iStock，依协议** | 可集成搜索、元数据与不同尺寸下载；支持客户已有订阅的 OAuth 流程 | 现有协议客户找客户经理，新接入方联系取得测试账户及商业方案 | 正式内容/出版业务候选，非最省事的免费 MVP 入口 |
| **Pond5** | 视频、音乐等多媒体的搜索与平台分发合作；可定制内容选择和授权 | 合作 API，按业务商谈授权、价格及内容范围 | 对需要较特别视频、新闻或档案题材的产品值得询问，不能预设低价无限调用 |

官方资料：

- [Pexels API](https://www.pexels.com/api/documentation/)；[Pexels API 使用条件](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions)
- [Pixabay API](https://pixabay.com/api/docs/)
- [Coverr API 入门与额度](https://coverr.co/api/docs/start)；[视频接口说明](https://api.coverr.co/docs/videos)
- [Storyblocks API](https://developer.storyblocks.com/about-us)
- [Shutterstock 开发者资料](https://www.shutterstock.com/developers/documentation)；[完整 API Reference](https://api-reference.shutterstock.com/?language=en)
- [Adobe Stock API 概览](https://developer.adobe.com/stock/docs/getting-started/)；[接入与费用 FAQ](https://developer.adobe.com/stock/docs/faq/stock-api-business-faq)；[视频授权类型与流程](https://developer.adobe.com/stock/docs/getting-started/apps/06-licensing-assets)
- [Getty Images API](https://www.gettyimages.co.uk/api)
- [Pond5 API](https://www.pond5.com/api)

**Envato Elements 是一个容易误判的例子。** 它的官方支持页当前明确表示没有公开的 Stock Catalog 搜索、下载和批量授权 API，包括 Enterprise 方案；Envato Market API 属于另一平台。其官方 MCP 可以辅助搜索并返回页面链接，但不能直接下载和创建素材许可证。因此它不应被列成可直接接入的自动视频取片后端。[Envato 官方 FAQ](https://help.elements.envato.com/hc/en-us/articles/360000621663-What-Is-Envato-Subscription-Complete-Guide-to-Plans-Pricing-Features) · [Envato 下载与 MCP 说明](https://help.elements.envato.com/hc/en-us/articles/360000621623-Download-Items)

**YouTube Data API 不是视频素材授权库。** 元数据搜索和用户授权发布，不等于获取别人的视频下载及再利用许可。官方开发者政策限制未经批准下载、缓存和存储影音内容。不能把 GoMotion 披露 YouTube API 视为其素材取得链路已经被查明。[YouTube 开发者政策](https://developers.google.com/youtube/terms/developer-policies)

NASA、Wikimedia Commons 等可以补充特定题材，但不是统一授权的商业 stock 库，需要逐条检查来源和使用条件。[NASA 媒体说明](https://www.nasa.gov/nasa-brand-center/images-and-media/) · [Wikimedia 再利用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en)

**针对当前 MVP 约束，建议先做 Pexels 与 Pixabay 的素材覆盖验证。** 用 5 份真实脚本，各抽约 20 个画面需求，检索后只保存必要的 ID、来源和预览信息，遵循缓存和展示条件。检查相关性、准确性、是否重复、许可依据以及客户接受程度。无需先下载全部候选素材或训练自有检索模型。

免费来源覆盖不足时，再向 Storyblocks 询问产品内为最终用户制作视频的商业 API 方案。特殊题材再对照 Pond5、Getty 或其他专业来源。签约前应明确：是用户带自己的授权，还是产品统一取得并覆盖最终用户；成片允许如何交付；是否有最低承诺和下载/存储期限；自动拼装、修改与 AI 辅助用途是否包含在内。这些直接影响单位成本和能服务的题材。

应比较的结果是每条被采用视频的素材成本和返工时间，而不是哪家目录标称素材最多。GoMotion 公开价格也不能作为“我们取得同样授权范围就能做到同样成本”的证明。
