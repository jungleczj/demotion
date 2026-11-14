export function quotaKind(data, raw = '') {
  // A generic RESOURCE_EXHAUSTED or "check your plan and billing details" can
  // describe minute limits too. Stop only for explicit daily/billing evidence.
  const evidence = (data ? JSON.stringify(data) : raw).replace(/https?:\/\/[^\s<>"']+/gi, '');
  if (/daily|per[\s_-]?day|每日|每天|当日.{0,12}(?:限额|配额|额度)/i.test(evidence)) return 'daily';
  if (/insufficient[\s_-]?(?:funds|balance|credits|quota)|(?:billing|payment)[\s_-]?(?:disabled|not[\s_-]?(?:enabled|active)|required|hard[\s_-]?limit|account[\s_-]?(?:disabled|suspended|closed))|(?:billing|balance|credits?).{0,45}(?:exhausted|depleted|insufficient|suspended|disabled|past[\s_-]?due)|payment[\s_-]?required|prepayment.{0,30}(?:depleted|exhausted)|(?:余额|额度|费用).{0,8}(?:不足|耗尽|用尽)|欠费|计费.{0,8}(?:未启用|停用|禁用)/i.test(evidence)) return 'billing';
  if (/per[\s_-]?minute|每分钟/i.test(evidence)) return 'minute';
  return 'unknown';
}
