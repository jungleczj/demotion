# 声音与语言后台验收记录

检查时间：2026-11-11T04:00:05.281Z（UTC）；本地日期 2026-11-11。

本轮只读检查指定的声音表、语言表、静态样例表、旁白生产代码和声音选择组件，并读取现有缓存。**未调用新的 TTS / AI，未修改应用代码，未启动或重启服务，未使用浏览器控制。**

## 验收结论

- 声音目录 30 条、声音 key 30 个，全部唯一；按后端约定构成的 `gemini:<key>` 请求 ID 也全部唯一。后端用同一目录建立白名单，并将冒号后的原始 key 作为 `voiceName`。
- 语言目录 15 条、代码 15 个，全部唯一，包含 `zh-CN`。每条均有非空的 code、speech 和 sample。
- 静态样例表 30 个键和 30 个不同 URL，与声音目录一一对应，无遗漏或多余键；缓存中的 30 个对应 WAV 都存在且完整解码通过，字节内容散列也各不相同。
- 当前 `VoiceLibrary` 试听从所选语言对象同时读取 `code` 与 `sample`，请求字段对应；声音、语言、风格共同组成前端音频缓存 key。后台使用同一语言表的 `speech` 名称指示 TTS 语言。
- 停止试听、换声音 / 语言 / 风格以及组件卸载均有停止旧声音或取消请求的代码；异步解码完成后再次检查取消信号，避免旧请求恢复播放。以上为静态流程检查，尚无真实浏览器交互证据。
- 现有旁白目录中的 27 个 WAV 也完整解码通过。精确匹配当前试听样本文本及 5 种风格后，只发现 **3 个新版组合**，另有 **1 个旧版可复用录音**。不能把静态 30 声音样例当成当前 30 × 15 种语言的运行时覆盖。

## 证据范围与两种样例的区别

检查文件：`shared/voices.json`、`shared/languages.json`、`shared/voice-samples.json`、`server/narration.mjs`、`src/components/VoiceLibrary.tsx`。本轮未检查 `src/data.ts` 适配层，也未请求 `/api/voices`，所以目录完整不等于已确认浏览器页面展示了全部 30 项。

`shared/voice-samples.json` 是 `chirp3-hd-*.wav` 路径映射；当前声音选择组件调用的是 `/api/narration`，请求所选语言的文本，后台声明的生产模型为 `gemini-2.5-flash-preview-tts`。指定文件中，当前试听请求没有读取这张静态样例 URL 表。

其中 `Aoede` 的静态 URL 文件名是 `chirp3-hd-aoeda.wav`，拼写与 key 不完全一致。此为显式映射，缓存确实存在且可解码；仅凭名称差异不能判定音色映射错误。仍需实际试听或可靠音色身份资料确认。

## 静态声音样例逐项解码

方法：逐个运行 `ffprobe` 读取真实音轨参数，再运行 `ffmpeg -v error -threads 1 -i <file> -f null -` 解码完整文件。以下 30 项均返回 0，无解码错误输出。

| 声音 key | 时长（秒） | 实际格式 | 完整解码 |
|---|---:|---|---|
| Kore | 11.760 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Charon | 11.000 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Puck | 11.320 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Zephyr | 11.000 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Fenrir | 11.120 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Leda | 12.200 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Orus | 10.800 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Aoede | 12.200 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Callirrhoe | 11.600 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Autonoe | 12.040 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Enceladus | 11.400 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Iapetus | 11.040 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Umbriel | 11.280 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Algieba | 11.360 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Despina | 11.480 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Erinome | 11.360 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Algenib | 11.480 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Rasalgethi | 11.600 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Laomedeia | 11.240 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Achernar | 10.400 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Alnilam | 10.880 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Schedar | 10.720 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Gacrux | 11.640 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Pulcherrima | 10.680 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Achird | 10.120 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Zubenelgenubi | 12.640 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Vindemiatrix | 11.160 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Sadachbia | 10.760 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Sadaltager | 11.800 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |
| Sulafat | 13.240 | pcm_s16le · 24000 Hz · 1 声道 | 通过 |

缓存目录：`/var/folders/l5/164spx8n27nbbtz29bp4kf1m0000gn/T/gomotion-local-mvp/voice-samples`。30 个文件均存在，无缺失、零字节或解码失败。完整文件散列的唯一数量为 30；这只说明字节不同，不能单独证明是 30 个正确音色。

## 当前试听样本的语言覆盖矩阵

将 `server/narration.mjs` 中生成缓存 key 前的实际代码截取为纯计算，输入目录中的原始声音 key、语言 sample / code，以及全部 5 种讲述方式；不执行缓存写入、规范化或网络调用。匹配顺序包括：

1. `legacyKey = sha256(JSON.stringify({ text, voice, style, model }))`。
2. 新版 `key = sha256(legacyKey + ":natural-pauses-v2")`。
3. 只将真实存在、超过 WAV 头长度且完整解码通过的文件记为命中。

`V2 · story` 表示当前新版缓存；`旧版 · story` 表示旧录音存在，生产代码可先本地规范化复用，**本轮没有执行规范化，也不算现成新版缓存**。`—` 表示未匹配到对应的标准试听 sample，不能据此说该语言或声音不可用。

| 语言代码 | 语言 | Kore | Charon | 其余 28 个声音 |
|---|---|---|---|---|
| zh-CN | 中文 | V2 · story | — | — |
| en | 英语 | 旧版 · story | — | — |
| nl | 荷兰语 | — | — | — |
| fr | 法语 | V2 · story | V2 · story | — |
| de | 德语 | — | — | — |
| hi | 印地语 | — | — | — |
| id | 印度尼西亚语 | — | — | — |
| it | 意大利语 | — | — | — |
| pl | 波兰语 | — | — | — |
| pt | 葡萄牙语 | — | — | — |
| ru | 俄语 | — | — | — |
| es | 西班牙语 | — | — | — |
| sv | 瑞典语 | — | — | — |
| tr | 土耳其语 | — | — | — |
| uk | 乌克兰语 | — | — | — |

覆盖计算包含全部 30 声音 × 15 语言 × 5 风格，共 2,250 个组合。新版精确命中 3 个组合、3 个不同声音 × 语言单元；计入旧版录音后为 4 个组合 / 4 个单元。其余 28 个声音均没有匹配当前标准试听 sample 的缓存。

| 声音 | 语言 / 风格 | 缓存版本 | 可追踪文件名 |
|---|---|---|---|
| Kore | zh-CN / story | natural-pauses-v2 | `14e924c4f7ddfcef870f4a74de9baebb8be3911480031faf86ce7f23c0c11629.wav` |
| Kore | en / story | legacy | `e3aa8af1acae1d472dad7c9fab26fe2cc441dedfee947b93c2e970471d04dfcb.wav` |
| Kore | fr / story | natural-pauses-v2 | `0175a28118b5e481e75d003a9c84f171de3712bd6bfdc9560640ca0604004c3f.wav` |
| Charon | fr / story | natural-pauses-v2 | `aadc16b620330e2d2dbdecc94e94d03150e6f0e30288e2ec43764458702b7fde.wav` |

旁白缓存快照共 27 个 WAV，均完整解码；其中 23 个未匹配到本轮标准试听 sample / 5 风格组合，可能属于其他脚本或历史输入。本轮未读取并猜测录音内容，也没有将它们归入语言覆盖。JSON 旁白时间段文件不等于音频本身，未计入可解码录音数量。

## 请求一致性与停止 / 取消流程

| 检查点 | 指定代码中的行为 | 结论边界 |
|---|---|---|
| 声音 ID | `listen(id)` 将 `voice: id` 交给后台；后台接受 `gemini:<目录 key>`，并把 key 交给 `prebuiltVoiceConfig.voiceName` | 后端白名单和 key 唯一性通过；未运行前端适配层 |
| sample 与 code | 从同一个 `selectedLanguage` 对象发送 `language: selectedLanguage.code`、`text: selectedLanguage.sample` | 字段一致；实际朗读语言还需听验 |
| 风格分离 | 前端 cache key 为 `id:style:languageCode`，后台样式与语言指令也进入内容 hash | 不应把其他语言/风格缓存误用于当前选择 |
| 点击同一试听 | 当前 loading / audition 的同一 id 再次点击执行 `stop()` | 有代码路径，待真实点击验证 |
| 换另一个声音试听 | 先 `stop()`，再创建新 `AbortController` | 旧请求取消、旧 source 停止和断开 |
| 换声音/讲述方式 | `[voice, style, language]` effect 调用 `stop()` 并清错误 | 在新 props 提交后的 effect 生效；未测真实调度时序 |
| 改语言 | 下拉框 onChange 先停止，然后更新所选 code；上述 effect 再兜底 | 有即时 handler 与 effect 两层停止 |
| 取消网络 | `/api/narration` 调用和后续音频 fetch 都传同一个 signal | 只确认浏览器请求有信号，不据此宣称服务端工作必定立刻取消 |
| 不可取消的解码 | `decodeAudioData` 后再次检查 aborted，再缓存和建立 source | 不会按这条路径重新启动已取消的试听 |
| 旧 source 结束 | 停止前清 onended；正常 onended 比较 source 身份 | 防止旧结束事件清掉新试听状态 |
| 卸载 | abort、停止 source、关闭 AudioContext | 实际设备释放与无串音仍待浏览器验收 |
| 播放手势 | 试听 click 内创建 / resume AudioContext，网络请求在其后 | 保留手势路径；实际浏览器策略未测 |

## 尚未通过的验收

**文件可解码 ≠ 浏览器可播 ≠ 音色身份正确 ≠ 自然度通过。** 本轮没有真实播放录屏，也没有对各音色、各语言进行人工听验，不能评价自然、口音、错读、漏读或是否像指定音色。

仍需在可用的浏览器会话逐项验证播放/停止/换声音/换语言/离开页面不串音，并对缺少现成缓存的组合在另行安排的实际试听中记录成功或失败。本轮遵守不新增 TTS/AI 调用的限制。
