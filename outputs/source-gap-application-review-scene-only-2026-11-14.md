# 第11项：科学插图的真实应用审核

2026-11-14T03:55:59.890Z。实际视觉审核返回内容，但应用拒绝了候选。**第11项与原失败项目整片仍未验收。**

原镜头：`baac21f7-5c79-44ca-9093-598ed9697eeb`，原文“它们将蛋放在双脚上，”。历史原稿与镜头来自已保存报告，仅取原文、主体与格式；旧自行绘图和旧审批未复用。原镜头时长 2.080 秒，未修改。

调用现有 `findSourceImagePlan → acquireSourceImage → inspectSourceImage → validateMotionPlan`。仅用1个已研究候选的显式目录夹具，零实时检索、零查询规划；保留来源/许可初筛、完整解码、原件与审查图哈希、目标布局清晰度、实际像素内容及注释全部门槛。

本次视觉 HTTP 请求 1 次，实际状态 **200**；模型审查调用 1 次，`callLimit=1` 且禁用瞬时重试。TTS、音频生成、任务提交、用户任务取消、服务重启、Git/部署均0。凭证仅从既有本地配置读入内存，报告不含凭证。

来源：Zina Deretsky / NSF，2006年帝企鹅生命周期科学插图；实际原件 1800×1216，1304056 字节；SHA-256 `4950715fe9969e6e1067398610828d2beecfb96e600369eae9293484e28eb00f`。这是来源插图，不能视为现场照片或放蛋动作的时间证据。应用审查完整解码图 1600×1081，SHA-256 `929c25f408f2c325324c4790a75ce4dd08cfdb0340f7a1b8ebbf64d2d5273a3d`；仅缩小，未裁切或放大。

## 实际结果

状态：`application_rejected_candidate`。

实际返回 JSON：

```json
{
  "matched": true,
  "exactSubject": true,
  "clear": true,
  "watermarkFree": true,
  "licenseUsable": true,
  "observed": "Emperor penguin lifecycle diagram on ice; lower-left group shows adult penguins standing with an egg visible near their feet, with red arrows and dashed outlines on their feet.",
  "limitations": [
    "Small illustrated figures; fine foot detail is stylized",
    "Narration describes behavior not directly proven by a still",
    "Diagram includes text labels that are part of the illustration, not watermarks"
  ],
  "title": "它们将蛋放在双脚上",
  "annotations": [
    {
      "label": "Males incubate eggs",
      "quote": "它们将蛋放在双脚上",
      "region": [
        0.15,
        0.64,
        0.16,
        0.12
      ],
      "observed": "Adult penguins standing upright with a round egg visible at their feet and red arrows pointing to the feet"
    },
    {
      "label": "Mating",
      "quote": "它们将蛋放在双脚上",
      "region": [
        0.055,
        0.37,
        0.1,
        0.14
      ],
      "observed": "Two emperor penguins close together on ice"
    },
    {
      "label": "Hatching",
      "quote": "它们将蛋放在双脚上",
      "region": [
        0.33,
        0.62,
        0.1,
        0.2
      ],
      "observed": "Adult emperor penguin bent forward with a chick at its feet"
    }
  ]
}
```

应用记录：

- Diagnostic candidate fixture: known researched source, no live source search and no query model.
- commons:PENGUIN_LIFECYCLE_H.JPG 图片已排除：图片标注必须引用当前旁白原文并有实际画面依据

## 权利证据边界

[Commons具体文件页](https://commons.wikimedia.org/wiki/File:PENGUIN_LIFECYCLE_H.JPG)声明PD-US-NSF；同图为[Frontiers文章图1](https://kids.frontiersin.org/articles/10.3389/frym.2023.1052262)，文章声明CC BY 4.0，所见图注没有单独排除。原USAP具体权利条目未取得；NSF现行通用政策仍需逐项核实。此记录保留出版与目录证据，不声称取得新的NSF授权或已经消除权利不确定性。元数据描述原样提供这一边界，目录名称不充当像素证据。

## 下一步

保留当前缺口及实际拒绝原因。寻找更清晰、更集中且有明确复用许可的帝企鹅蛋在脚上的实图/已发表示意；继续沿现有门槛处理，不改原旁白、不伪造contentReview或注释。

本轮没有渲染补片。

[完整结构化记录](source-gap-application-review-scene-only-2026-11-14.json)；[前置来源与权利研究](penguin-source-gap-research-2026-11-12.md)。
