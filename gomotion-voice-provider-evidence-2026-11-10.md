# GoMotion 配音供应商：可核对的公开证据

官方开发者文档：https://gomotionai.com/developers

GET /v1/voices 的官方响应示例将 Aurora、Luna、Stella 标记为 model="vega"，sample_url 指向 https://static-files.genaipro.io/vega-samples/aurora.mp3 等 GenAIPro 域名。GET /v1/languages 的示例将英语标记为 Vega，荷兰语和法语标记为 Nova。

GenAIPro 官方 API：https://docs.genaipro.io/

该服务公开提供 Vega、Nova 等 TTS API；Vega 为英语预算配音产品，27 个美式/英式预设声音；Nova 是另一产品线。

结论：GoMotion 的公开声音目录示例明确指向 GenAIPro 的 Vega/Nova 体系，强于仅凭听感猜测 ElevenLabs。但示例不是实际教程视频的执行日志，不能据此确认某条教程用了哪个声音，也不能证明全部声音共享同一供应商，更不能确定 GenAIPro 的底层模型厂商。

当前 MVP 采用已有 Gemini key 可连接的神经 TTS；没有声称复刻了 GoMotion 的同款人声。Vega 文档为英语声音，不适合作为中文旁白的默认替代。公开试听文件只能朗读既有内容，无法替代新脚本的配音。
