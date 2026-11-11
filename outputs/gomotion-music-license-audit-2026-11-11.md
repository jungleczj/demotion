# M1 背景音乐逐曲许可核实

核实日期：2026-11-11（Asia/Shanghai）。本轮只查公开官方资料、复查已有本地文件和读取当前混音代码；未调用生成模型、YouTube Data API 或应用服务，未重启服务，未修改 TASKS / 产品代码，未提交或推送。

## 可执行结论

**American Frontiers 的现有本地音频可用性已再次确认；其逐曲许可类型仍未在官方音频库界面核实。** 暂不能将它放入“免署名、可直接商用”的已核验曲库。

已找到两个有作者官网逐曲许可和原始下载链接的候选：**Undertow — Scott Buckley**、**The Great Sea — Scott Buckley**。两首都明确列为 CC BY 4.0，按官方要求署名后可用于商业视频；本轮受音频读取工具限制未下载，不能记为原文件已获取或解码通过。候选元数据见 [音乐许可元数据](gomotion-music-license-metadata-2026-11-11.json)。

这条路线无需音乐生成、无需视频搜索 API，后续首次普通 HTTP 下载与本地缓存仍有流量 / 存储成本。它证明可取得明确许可的候选，**不代表自动混音或整片验收已经完成**。

## American Frontiers：确认与未确认

已有文件：`outputs/gomotion-music-American-Frontiers-Aaron-Kenny.mp3`。它由此前已确认的 GoMotion 页面试听路径取得，并非本轮从 YouTube Studio 下载。

| 检查 | 本轮结果 |
|---|---|
| SHA-256 | `48e85775532f652d619d6b7ace309c1f24aaaead5c3d12a5fdc0fa9d8f3b9ff8` |
| 实际文件 | 3,622,482 字节；159.019909 秒；MP3；44,100 Hz；双声道 |
| 本地验证 | ffprobe 退出 0；完整 ffmpeg 解码退出 0，无错误输出 |
| 官方曲目身份 | [Aaron Kenny - Topic 的 American Frontiers](https://www.youtube.com/watch?v=Rfo11Ks1JoY) 的公开搜索索引标注由 YouTube Audio Library 提供，作者 Aaron Kenny，发行日期 2018-12-18；该索引为官方曲目来源线索 |
| 与本地音频身份对应 | 尚无官方原 MP3 的散列 / 声纹比较；同名、作者与时长本身不能证明文件完全相同 |
| 实际许可类型 | 未能读到官方 Studio 此曲的 License type 与归属说明；仍为未核实 |
| GoMotion 目录 | 其总声明仅作为二手线索，不替代逐曲许可，也不证明可将音频再分发为产品内置文件 |

[YouTube 官方音频库帮助](https://support.google.com/youtube/answer/3376882?hl=en)说明：在 Studio 搜索具体曲目，读取许可类型；CC 曲目要复制归属文本，也可以过滤无需署名的曲目，并从库内下载 MP3。这个通用说明没有给 American Frontiers 的逐曲许可结论。

普通 YouTube 视频页面的 Standard YouTube license 也不能当作音频库音乐许可。后续核实时应保存曲目行、License type、完整许可弹窗 / 归属要求、官方 MP3、获取日期和散列；不能只保存“来自 Audio Library”一句话。[YouTube 官方许可类型说明](https://support.google.com/youtube/answer/2797468)

## 作者官网明确许可的候选

| 候选 | 官方逐曲页面 | 已确认的许可 / 获取链路 |
|---|---|---|
| Undertow — Scott Buckley | [作者曲目页](https://www.scottbuckley.com.au/library/undertow/) | 页面将该作品明确列为 CC BY 4.0；提供 MP3 下载。作者描述为较低沉的钢琴、弦乐与合成器作品；是否适合当前叙事仍需试听 |
| The Great Sea — Scott Buckley | [作者曲目页](https://www.scottbuckley.com.au/library/the-great-sea/) | 页面将该作品明确列为 CC BY 4.0；提供 Full Mix MP3。作者描述为由大提琴逐渐发展到管弦乐的作品，较适合宏大或情绪发展的候选段落；本轮未听验 |

两个链接均为作者自己的创作音乐库，许可在各自曲目页直接出现，不依赖 GoMotion、转载频道或第三方目录。

实际从官方页面链接读取到的原始音频地址：

- [Undertow 官方 MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3)
- [The Great Sea 官方 Full Mix MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2024/01/TheGreatSea.mp3)

这些是页面已提供的链接，并非按文件名猜测的 URL。Web 工具对音频格式不支持，故本轮不报告下载状态码 200、字节数、时长或解码结论。

作者给出的归属格式为：

```text
'Undertow' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au
'The Great Sea' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au
```

实际使用哪首就保留对应归属，并补上该曲来源链接与 [CC BY 4.0 许可链接](https://creativecommons.org/licenses/by/4.0/)。若进行了循环、节选、音量调整或与旁白同步，记录相应处理。CC BY 4.0 允许商业使用和改编，要求保留归属、许可链接并说明修改。[Creative Commons 官方许可文本，第 2 / 3 节](https://creativecommons.org/licenses/by/4.0/legalcode.en)

作者的[使用说明](https://www.scottbuckley.com.au/library/using-this-music/)要求 YouTube 归属放在视频描述，说明未署名可能收到 Content ID claim；另提醒不要把音乐单独转售 / 作为自己的流媒体曲目发行或送入音频指纹系统。应用的目标应保持为音乐同步在视频中，并随成片提供可复制的归属，不能承诺“任何平台永不出现版权识别”。如果无法署名，作者另设付费许可；免费路线不满足“省略署名”的使用条件。

## 网络工具限制：实际错误

| 操作 | 工具实际结果 | 能得出的结论 |
|---|---|---|
| 打开官方 YouTube 音频库入口 | `Failed to fetch ... (500) Redirected to https://accounts.google.com/ServiceLogin ... which is not accessible via this tool. (non-retryable error)` | 工具无法读登录后的 Studio；不能据此说该曲许可不存在，也不能登录绕过 |
| 打开 Aaron Kenny 官方 Topic 视频 | `Failed to fetch https://www.youtube.com/watch?v=Rfo11Ks1JoY: Error fetching ...` | 直接页面读取失败；仅保留搜索索引的来源线索，不声称已读许可弹窗 |
| 点击 Undertow 官方 MP3 | `(400) Unsupported content-type: audio/mpeg` | URL 由官方页面提供，但 Web 工具不能处理音频；不是源站返回“曲目不存在”的证明 |
| 点击 The Great Sea 官方 MP3 | `(400) Unsupported content-type: audio/mpeg` | 同上，本轮没有取得该候选的本地文件 |
| 普通 Python urllib 读取 Incompetech 官方页面 | `URLError: <urlopen error [Errno 8] nodename nor servname provided, or not known>` | 当前 shell 网络解析不可用；未通过其他入口或权限升级反复下载 |

Incompetech 的 Long Road Ahead 与 Dreams Become Real 搜索结果也提供了官方 CC BY 4.0 线索，但本轮直接打开只返回动态的“Loading track / No Track selected”，尚未取得动态下载链路。为避免降低证据标准，本次元数据优先保留已直接读到逐曲许可与官方原音频链接的 Scott Buckley 候选。

## 自动混音尚缺要求

只读当前 `server/render.mjs`，合成音轨仍为统一旁白的 `apad + atrim`，没有音乐输入和混音分支；本轮没有修改它。要使 M1 通过，至少还需：

1. 取得至少一首许可已核实候选的真实原 MP3，探测并完整解码，保存散列、获取日期、来源 / 许可快照与归属条件；原始音频不随本轮源码发布。
2. 用本地曲库与确定性规则选择整片音乐，重复制作复用缓存；配乐步骤不得新增模型调用或 YouTube Data API 搜索，不要求用户逐镜配置。
3. 音乐按全片时间连续铺设，开头 / 结尾自然淡化；长片重复时选择合理循环点并处理接缝。不能在每次切镜重新开始曲目。
4. 按旁白活动自动压低音乐，避免强音 / 歌声遮盖讲述，必要时做峰值限制与响度处理；不能只把“音乐固定调小”当作已验证全片不盖人声。
5. 对比旁白原轨与混音，确认无削字、重复、截断、异常静音或相位问题；试听切镜、循环点和片尾，检查不同长度与画幅输出的实际可播放 / 下载文件。
6. 成片来源清单中记录音乐信息和处理；导出可复制署名。若发布到 YouTube，按作者要求把归属放入视频描述。来源 JSON 本身不能自动替代外部发布时的署名。

下一步最小范围是：下载一首官方 CC BY 候选并固定为可追溯测试音乐，再完成一条真实旁白成片的本地混音与听审。现有 American Frontiers 保留为“音频已取得、逐曲许可待确认”；两个替代曲保留为“逐曲许可与官方下载链接已确认、音频获取及解码待完成”。
