export function userMessage(message: string) {
  if (/402|429|额度|配额|quota/i.test(message)) return '当前服务额度不足，请稍后重试或检查账户用量。';
  if (/401|403|鉴权|密钥|权限/.test(message)) return '服务暂时不可用，请检查连接设置后重试。';
  if (/不完整|缺镜头|未覆盖|未匹配|缺少.*画面|没有.*素材|自动补搜/.test(message)) return '视频尚未完成，请更换画面或重新制作。';
  if (/Gemini|OpenAI|DeepSeek|AI|模型|token|HTTP|UND_ERR|TTS|ffmpeg|ffprobe|视觉|审核|检查|目录|约束|语义|缓存|解码/i.test(message)) return '这次操作未能完成，请稍后重试。';
  return message;
}
