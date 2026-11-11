# GoMotion 教程画面素材溯源记录

日期：2026-11-11（Asia/Shanghai）。目标：`gomotionai.com`；覆盖 `TASKS.md` 早期 6 / 7 的片段级来源反查。只检查既有截图与公开页面；未登录、付费、下载原片或绕过已禁用的浏览器控制；未修改应用代码。

## 当前结果

**找到发布者线索，尚未找到可确认的同一原片或相同帧时间码。** 教程截图确实可读 `ROMANO-ARCHIVES`；该档案发布者的历史官网与 UnknownWW2InColor YouTube 频道存在自述联系。但本轮没有证明教程中的镜头对应频道的哪一个视频、GoMotion 从哪个站/API 取回，或它是否取得授权。Pexels、Pixabay、Commons、YouTube、Internet Archive 均没有得到可验收的同片命中。

本轮确认的**同帧匹配数为 0**。这是检索结果，不是“没有原片”或“这些平台没有该素材”的证明；也不能据此判断 GoMotion 的主要素材供应来源。

## 先核对截图与时间

官方教程页面是 [GoMotion full walkthrough](https://gomotionai.com/tutorial)，公开页面列总长 **5:49**。以下优先记录截图中外层教程播放器实际显示的时间，文件名只作定位；外层教程时间与内层成片时间不能混用。

| 既有证据 | 教程播放器显示时间 | 直接可见内容 | 对溯源的限制 |
|---|---|---|---|
| [gomotion-tutorial-4m14-artillery.png](evidence/gomotion-tutorial-4m14-artillery.png) | **4:14 / 5:49** | 主画面是 `LARGEST ARMIES IN EUROPE 1939` 横条图；右栏 #95 附近有黑白长炮管/炮兵缩略图 | “artillery”在文件名里，炮兵并非此帧主预览。仅凭小缩略图不足以确认武器型号、拍摄地或原视频 |
| [gomotion-tutorial-4m16-romano-archives.png](evidence/gomotion-tutorial-4m16-romano-archives.png) | **4:16 / 5:49** | 彩色街道影像，可见履带车辆/人员和建筑；下方可读 `ROMANO-ARCHIVES`，字幕 `This was not a collapse.` | 播放按钮遮住画面中心；截图本身不能确认车辆型号、事件、年份。旁白讲某事件不等于档案画面拍摄于同一事件 |
| [gomotion-tutorial-4m16.png](evidence/gomotion-tutorial-4m16.png) | 实际为 **4:18 / 5:49** | 主画面是 `EASTERN BORDER FORCES` 柱图，599 对 20 | 文件名不能当精确时间码；此帧没有新增可识别的历史镜头 |

截图右栏有编号、`c*.mp4` 等文件名与 Replace 按钮；这些更像项目内部切片命名，**不是供应商 asset ID 或原始视频地址**。选中的右栏素材也不能在没有时间轴映射时直接视为当前主预览的来源。

## 发布者身份线索

| 核对对象 | 实际找到的信息 | 证据等级 |
|---|---|---|
| [Romano Archives 历史自述页](https://digilander.libero.it/romanoarchives/) | 自述维护历史影像档案、向影视制作等用途提供许可，并将 UnknownWW2InColor / UnknownWW2InColor2 称为其 YouTube 频道 | **发布者自述**；可以确认名称与频道线索。页面标注历史更新至 2013 年，不能当作 2026 年库存/价格证明 |
| 上述页面可达性 | 本轮直接 open 报 **410 Gone**；搜索索引仍返回该官方页面的正文摘录。两个历史镜像 `romanoarchives.altervista.org`、`ww2incolor.altervista.org` 本轮未能读取 | 必须保留“历史索引内容”的限定，不称其当前服务正常 |
| [UnknownWW2InColor 频道](https://www.youtube.com/user/UnknownWW2InColor) | 公开频道 URL 可定位，但本轮 Web 抓取只给通用 YouTube 页脚，未提供可逐帧核对的播放器画面 | 不能声称已观看频道全部视频 |
| 频道视频的自述 | 下表两条 YouTube 索引元数据均署名 UnknownWW2InColor，说明 Romano Archives 对素材进行了编码/编辑并提供更高清版本 | 与官网自述相互对应；仍没有连接到教程的**同一镜头** |

`ROMANO-ARCHIVES` 水印可能随发布者版本、下游转载或剪辑被保留。即使最后找到完全相同的发布者视频，也仍需区分：原始拍摄者、数字化/编辑发布者、转载站、GoMotion 实际下载渠道，以及最终许可主体。

## 候选记录：命中与未命中分开

| 候选 | 可点击原始/发布页面 | 本轮实际核对 | 与教程同帧的判定 / 对应时间码 |
|---|---|---|---|
| `1939 Last Days of Peace in Warsaw (HD)`，UnknownWW2InColor，2013-01-26 | [YouTube 发布页](https://www.youtube.com/watch?v=mdw1kmj1kW0) | 搜索索引返回发布者和说明，题材为战前华沙的彩色城市生活；未取得可逐帧查看的原片画面，直接 open Cache miss | **未确认**。仅“华沙/彩色/街道”不够；原片时间码**未知** |
| `1939 Poland - Market Day and Jews In Occupied Krakow - German Amateur Film`，UnknownWW2InColor，2009-09-03 | [YouTube 发布页](https://www.youtube.com/watch?v=0e6kb1WoH1o) | 发布元数据说明 Krakow、October 1939、16mm color film；记录为城市历史影像候选，未观看并定位同一画面 | **未确认**。不是标题匹配即可认定；原片时间码**未知** |
| `1942 The Taking of Singapore - Japanese Footage Only` | [介绍与嵌入页](https://otterman.wordpress.com/2017/02/08/romano-archives-japanese-footage-from-the-battle-of-singapore-feb-1942/) | 第三方说明提 Romano Archives、日本坦克进入城市等，提供另一个“同水印+城市履带车辆”的候选方向；没有获得可核对的发布者原片 ID/同帧 | **只作搜索线索**，不是匹配或历史事件认定；时间码**未知** |
| `155mm-GMC-M40-Korea-19511126.jpg` | [Commons 文件页](https://commons.wikimedia.org/wiki/File:155mm-GMC-M40-Korea-19511126.jpg) | 现有[候选截图](evidence/commons-m40-candidate.png)可直接目视：两门炮在积雪/夜色中开火，巨大炮口焰；页面说明韩国 1951-11-26 | **完整照片构图未匹配**教程右栏 #95：缩略图未见两团巨大炮口焰，构图不同。小缩略图不足以严格排除裁剪/再加工变体；不排除同系列影像。照片没有原片时间码 |
| `155mm-GMC-M40.jpg` | [Commons 文件页](https://commons.wikimedia.org/wiki/File:155mm-GMC-M40.jpg) | 找到文件及来源/许可说明，504×353，日期未注明 | 本轮只核对页面元数据，**没有新增同帧确认**；不能将武器题材相似当来源命中 |
| `155mm-SPGs-north-of-seoul-195105.jpg` | [Commons 文件页](https://commons.wikimedia.org/wiki/File:155mm-SPGs-north-of-seoul-195105.jpg) | 找到文件页，说明 1951 年 5 月首尔以北的美军自行火炮；600×459 | 本轮只核对页面元数据，**没有新增同帧确认**；没有视频时间码 |

两条 YouTube 的信息来自公开搜索返回的发布页标题、作者及 description，并非本轮完整观看。Singapore 文章为第三方线索，不能替代发布者原页或帧比对。Commons 元数据是该文件页面的公开声明，未证明教程使用了它。

## 按平台记录搜索覆盖

以下采用公开网页/图像搜索，未调用需要 key 的图库 API，没有进行全库搜索。搜索引擎会放宽稀疏查询，结果中的同姓 Romano、古罗马建筑和无关历史材料均已视为噪声。

| 平台/范围 | 实际关键词示例 | 实际结果 |
|---|---|---|
| Pexels | `site:pexels.com "Romano" archives` | 出现 Gabriele Romano 等同姓作者页，未出现可确认的 Romano Archives 镜头；**未匹配**，不是证明 Pexels 没有此画面 |
| Pixabay | `site:pixabay.com "Romano" archives` | 出现古罗马建筑/音乐等泛化内容，无目标同帧；**未匹配** |
| Commons | `site:commons.wikimedia.org "Romano-Archives"`；`"M40" "gun motor carriage"` | 水印词未找到可确认目标文件；炮兵方向得到上表候选，其中一张完整构图与既有缩略图不同，但未排除裁剪变体；其余无同帧确认 |
| YouTube | `"UnknownWW2InColor" "Poland" / "Warsaw" / "Prague" / "Singapore"`，并放宽 `Romano Archives` + tank/color/parade/street | 找到两条发布者视频元数据及频道线索；没有取得相同帧与原片时间码 |
| Internet Archive | `site:archive.org/details "Romano" "Poland"`；`site:archive.org/details "1940 Advance Into Poland"`；`"RomanoArchives" archive.org` | 没有得到可确认的目标条目；直接读取猜测的 `/details/@romanoarchives` 也未成功，**不能当已确认账户或缺失证明** |
| 图像搜索 | `"ROMANO-ARCHIVES" tank`；`Romano Archives` + Singapore/Prague/Poland；`155mm GMC M40 black white firing` | 得到大量非目标图片和 M40 候选，没有可验收的同帧结果。未上传用户截图至第三方反向图搜服务 |

没有给这些检索填写“图库命中率”，因为没有合适的全量候选分母，且多数条目未完成逐帧观看。历史档案常有重新剪辑、裁切、调色、水印及不同转码版本，关键词未命中也不能排除传播链上的某个平台。

## 证据可支持的结论

- **直接可见：**GoMotion 官方教程的一帧出现 `ROMANO-ARCHIVES` 标记，另一帧右栏存在炮兵缩略图，预览与项目切片可分开替换。
- **发布者线索：**Romano Archives 历史官网自述与 UnknownWW2InColor 频道存在关系；该频道有可定位的历史影像发布页。
- **仍未证明：**截图属于哪条原片、精确源时间码、原始拍摄事件、GoMotion 的下载渠道/API、许可与付款关系，以及该来源在所有项目中的占比。
- **不能由本轮推出：**“GoMotion 直接抓 YouTube”“Commons 是主库”“Romano Archives 是主要供应商”“有水印即未授权”。这些都超出证据。

## 继续唯一定位所需的最小信息

1. 教程 **4:16** 内历史镜头的无播放按钮遮挡清晰帧，最好有相邻数秒；炮兵则需要将右栏 #95 素材实际放入主预览后的清晰画面。无需账号信息或 key。
2. 对公开可播放的候选，记录两组以上共同细节：建筑窗格/门框、车辆轮组及标识、人物相对位置、镜头运动；再给出 `教程时间 → 原视频ID → 原片起止时间`。同题材、同水印或一个类似物件均不足。
3. 即使完成同帧匹配，来源供应关系还需要 GoMotion 项目中的去敏感 `asset/source_page/provider/license` 记录或官方说明。单个片段不能回答“主要来源”。

当前已完成本轮公开检索与边界记录；**片段级原片及主素材库仍未确认**，不将早期 6 / 7 的“找到同一原片”验收写成已通过。
