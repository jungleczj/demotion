export function estimateNarrationSeconds(script, style = 'documentary') {
  const text = String(script || '').trim();
  if (!text) return 0;
  const compact = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const other = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ');
  const words = other.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
  const pauses = (text.match(/[,，、;；:：]/gu)?.length || 0) * .14 + (text.match(/[。！？.!?]+/gu)?.length || 0) * .3;
  const pace = style === 'gentle' ? 1.12 : style === 'story' ? 1.06 : style === 'conversation' ? .97 : 1;
  return Math.max(1, Math.ceil((compact / 4 + words / 2.6 + pauses) * pace));
}
