# 同稿制作：原稿保留与验收进展

2026-11-14（Asia/Shanghai）。本轮完成对标所需的原稿保留能力，尚未取得可验收的 Sea Wolf 原稿或对应的 GoMotion 成片。

- [创建页语言区](gomotion-mvp/src/components/ProductionOptions.tsx)加入可选“按原稿朗读，不自动翻译”。本地浏览器勾选后，旁白区说明随之更新，英语选择不变；刷新仍勾选，测试结束后恢复原状态。[浏览器截图](script-fidelity-browser-2026-11-14.png)
- [本地制作](gomotion-mvp/server/productions.mjs)和[分镜接口](gomotion-mvp/server/index.mjs)共用[旁白输入处理](gomotion-mvp/server/planner.mjs)。开启选项后直接使用输入原稿，常规多语言继续走翻译。[云任务](gomotion-mvp/server/cloud/productions.mjs)在此模式把相同原文传给工作进程，保留空白和 CRLF；[旁白时间轴](gomotion-mvp/server/narration-timeline.mjs)在镜头文本缺字、增字或乱序时拒绝生成配音。导出复用按原稿区分，避免仅空白不同的原稿被旧任务覆盖。没有修改第 10 项的拆分策略。
- 红灯复现后，制作、云交接及文本定向共 44 项通过；[本轮完整回归](script-fidelity-regression-2026-11-14.txt) 387/387，0 失败、0 跳过；类型及 Vite 构建通过。没有实际提交视频或调用付费模型。[重载后本地服务核对](script-fidelity-local-2026-11-14.json)：健康、配置、任务皆 200，原五条档案散列一致，活动 0。正式站未发布或验证本轮代码。

## 仍缺实际素材

- Sea Wolf 的确切标题仍命中[原视频索引](https://www.youtube.com/watch?v=CSXelOdU8Yc)，但实际读取未取得字幕或视频正文。标题/简介不是原稿，也没有找到对应的 GoMotion 输出。需要可使用的原始 TXT/SRT 或视频文件，以及同一稿的 GoMotion 成片，才能做逐段配对和实际生成验收。[同稿基线](sea-wolf-same-script-benchmark-2026-11-12.md)
- 第 11 项继续筛选真实来源：[皇家学会的孵卵标本图](https://pictures.royalsociety.org/image-rs-4452)与题意接近，馆藏页注明 © The Royal Society，未见允许本项目复用的许可；[香港科大馆藏讲义](https://library.hkust.edu.hk/wp-content/uploads/2021/02/wildlife-refuges-final.pdf)第 45 页有相关照片，但未标明原图可复用；[维多利亚博物馆 CC BY 标本](https://collections.museumsvictoria.com.au/specimens/420152)只呈现独立蛋，[史密森学会抱蛋图片](https://ocean.si.edu/ocean-life/seabirds/king-penguins-eggs)为不同物种。未采用任一候选，保留缺口；[上一轮真实插图图审](source-gap-live-followup-2026-11-14.md)结论不变。
