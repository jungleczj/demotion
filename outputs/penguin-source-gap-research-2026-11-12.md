# 帝企鹅“蛋在双脚上”来源缺口研究

2026-11-12。原镜头 `baac21f7-5c79-44ca-9093-598ed9697eeb`，旁白原文：“它们将蛋放在双脚上，”。全稿身份依据：“它们，就是帝企鹅。”

本轮找到**可供后续应用审查的一项真实已发表科学插图**，实际画出了脚部孵蛋位置；尚未证明该镜头、原失败项目或第11项整片通过。没有找到同时满足“蛋与帝企鹅双脚可见、原图可下载、可复用权利核实完整”的实拍照片。

## 来源与实际文件

作品为 Zina Deretsky / National Science Foundation 的2006年帝企鹅生命周期插图。[Commons 文件页](https://commons.wikimedia.org/wiki/File:PENGUIN_LIFECYCLE_H.JPG)记录作者、年份和具体公有领域标记，链接[USAP原机构条目](https://photolibrary.usap.gov/PhotoDetails.aspx?filename=PENGUIN_LIFECYCLE_H.JPG)。同图作为 Figure 1 刊于 Jenouvrier、La Rue、Trathan、Barbraud 的[2023年科学科普文章](https://kids.frontiersin.org/articles/10.3389/frym.2023.1052262)，图注明确署名原作者及NSF，并指向同一USAP条目。

只下载了2个候选图片文件，均小于10MB，实际为同一作品的两个版本；没有把它们当成两个独立证据。均以 `view_image` 读取了实际像素。原件位于应用已忽略的 `outputs/gomotion-mvp/work/source-gap-research/`。

| 文件 | 尺寸 / 大小 | SHA-256 |
|---|---|---|
| [Commons原尺寸版](gomotion-mvp/work/source-gap-research/candidate-1-nsf-penguin-lifecycle-original.jpg) | 1800×1216；1,304,056字节 | `4950715fe9969e6e1067398610828d2beecfb96e600369eae9293484e28eb00f` |
| [期刊已发表图1](gomotion-mvp/work/source-gap-research/candidate-2-frontiers-figure-1-published.jpg) | 765×518；383,953字节 | `d0994adf394e296965d5805678fe3a21d40020208b42cd9438a72c171aecd45c` |

期刊源页面也已原样保存在工作目录：[HTML](gomotion-mvp/work/source-gap-research/frontiers-article-source-page.html)，96,439字节，SHA-256：`b6aab556f31219c2dcd6109cea801e4fdf7259d4b4d0067cae5bef9a7f4e2c25`。原始下载URL、来源和权利证据见[元数据JSON](penguin-source-gap-research-2026-11-12.json)。

## 我实际看见的内容

整图是冰面上的年度生命周期，多组帝企鹅、雏鸟、蓝色路线、英文月份与阶段说明。左下的孵化部分画有3只成鸟；腹部和脚的交界处有浅色小蛋，原图用红色虚线圈标出，并有红箭头连接到放大的蛋示意。该局部确实是“脚部的蛋”，而不是通用站立成鸟或脚上雏鸟。

这支持一个已发表的帝企鹅孵化位置示意。它是科学解释图，不能当成现场照片。左下蛋的放大图属于原图的说明框，不能脱离圈线关系当成掉在冰面的蛋；右邻孵出雏鸟部分也不能充当未孵化蛋的证据。它支持位置状态，没有记录实际放蛋、产蛋或交接蛋的时间动作。

清晰度仍有实质限制：有用的脚和小蛋只占整图少量像素。期刊版明显较小，应优先保留原尺寸版；但横竖成片适配后的可读性、与原电影画面风格的一致性尚未验证。

## 权利证据及边界

- Commons 对这一具体文件给出NSF公务作品的公有领域标记。这是文件目录的明确声明，不能扩大成“所有.gov图片均可用”。
- 期刊文章明确采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，图1署名原作者，所见图注没有单独的限制性许可或排除条款。这是可核对的出版许可证据；并非本研究获得了NSF新出具的授权。
- [NSF现行通用视觉媒体政策](https://www.nsf.gov/policies/digital)区分公有领域、承包商及第三方作品，要求逐项确定使用许可，不能只根据机构名称推定。原USAP条目本轮网页抓取失败，直接公开请求也出现TLS传输错误，因此未重新核实原条目的具体权利字段。没有绕过访问控制，也没有给任何人发送授权请求。

建议保留作者、机构、作品、期刊图号与DOI，并保留具体许可链接；若加工，记录加工事实。是否足以满足当前应用的许可门槛，应由其现有来源审查处理。本报告没有写入应用的已通过凭证。

## 后续可采取的集成步骤

可用精确作品名或作者加主体词，使此图进入有界目录候选；随后仍走原文件获取、完整解码、双哈希、许可和实际像素审查。当前 `source-images.mjs` 要求整图固定保留，并提供2–4个有用且不同的证据区，标签需引用当前短旁白；这幅密集图与该极短句可能仍被正确拒绝。不能为了通过而伪造 `contentReview`、缩小主体门槛或填入编造的注释。

若后续实际审查通过，动态处理只能强调来源图内已经存在的蛋与双脚信息，保留原图关系和来源标记。不得自行画蛋、造脚部结构、增加交接动画，或把静态位置示意包装成真实动作。若许可、像素清晰度或注释门槛未通过，继续保留缺口。单镜头候选发现不能关闭第11项。

## 其他线索为何没有采用

Stefan Christmann的商业图集确有描述脚上孵化的帝企鹅照片，但[出版页](https://www.discoverwildlife.com/photo-galleries/penguin-a-story-of-survival)没有取得可供当前加工的开放许可；未下载。FWS的[公有领域条目](https://www.fws.gov/media/emperor-penguin)描述成鸟与幼鸟；[维多利亚博物馆CC BY照片](https://collections.museumsvictoria.com.au/specimens/420152)是单独蛋标本；两者都不能补这句的具体脚部事实。另有博客把Chris Pearson的蛋图称作帝企鹅，[其他出版记录](https://www.treehugger.com/masterfully-painted-eggs-straight-from-the-bird-4862517)明确称王企鹅，因此没有采用。

本轮模型/付费提供方调用0，应用内AI审查0，提交任务0，重启服务0，云资源操作0，Git操作0；未改代码、旁白、镜头、任务状态或其他代理文件。这里只新增研究报告及元数据，工作目录保存来源文件。原项目仍需完整恢复、补齐缺口、真实视听和连续播放验收。
