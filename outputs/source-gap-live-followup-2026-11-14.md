# 第 11 项：真实原件恢复与两次审核

- 从[Westarctica 公开镜像](https://www.westarctica.wiki/index.php?title=File%3APENGUIN_LIFECYCLE_H.jpg)分 20 段取回完整 1,304,056 字节；整件 SHA-256 `4950715fe9969e6e1067398610828d2beecfb96e600369eae9293484e28eb00f` 与 [Commons 原件历史记录](penguin-source-gap-research-2026-11-12.md)一致。[原件副本](evidence/nsf-penguin-lifecycle-source.jpg)已保留在应用临时目录之外。插图作者为 Zina Deretsky / NSF，来源和权利仍以历史研究及具体目录声明为准。
- [第一次实际像素审核](source-gap-application-review-deepseek-restored-2026-11-14.md) HTTP 200。模型列出生命周期多个阶段，引用了当前镜头之外的句子。验证器拒绝，未发布补片。与旧 402 不同，这次问题发生在输出。
- 修改[来源图审核输入](gomotion-mvp/server/source-images.mjs)，只给当前镜头台词、画面要求和仍可核对的主体提示；不再把整篇旁白一并发送。复现断言在变更前失败，变更后来源图片与查询规划合计 18 项通过；原图散列、许可、画面和逐条标注校验未降低。
- [第二次实际像素审核](source-gap-application-review-scene-only-2026-11-14.md) HTTP 200，已引用当前句子，但标签仍取自原图英文，且两个区域分别落在交配和孵化阶段。验证器再次拒绝，没有可渲染计划。保留原镜头台词及 2.08 秒设计；下步要找画面主体集中在脚上抱蛋、许可明确的来源，不能靠翻译标签掩盖区域不相符。

两次均以独立报告记录，各限 1 次 HTTP、0 次自动重试。没有调用配音、启动整片生成、取消任务或降低校验门槛。修改在本地代码，常驻服务未因本轮审核被重载。第 11 项仍待真实补片与完整成片审查。
