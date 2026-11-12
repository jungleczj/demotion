import { createHash } from 'node:crypto';
export const SCOTT_BUCKLEY_TRACKS = Object.freeze([
  { slug: 'undertow', title: 'Undertow', mood: 'reflective', description: 'Sombre ebbing piano strings synth; reflective melancholy documentary underwater journey. 沉静 钢琴 弦乐 海洋 水下 纪录片 思考', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3' },
  { slug: 'the-great-sea', title: 'The Great Sea', mood: 'exploration', description: 'Grand sweeping orchestral solo cello growing momentum emotion; ocean sea wildlife exploration journey. 宏大 管弦 大提琴 海洋 大海 野生动物 探索 旅程', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2024/01/TheGreatSea.mp3' },
  { slug: 'machina', title: 'Machina', mood: 'tension', description: 'Glitchy electronic ambient science fiction atmosphere; restrained tension mystery uncertainty. 电子 氛围 科幻 紧张 悬念 未知', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_machina.mp3' },
]);
export function scottBuckleyAsset(track) {
  const sourceUrl = `https://www.scottbuckley.com.au/library/${track.slug}/`;
  return { id: `scottbuckley:${track.slug}`, provider: 'scottbuckley', sourceId: track.slug, title: track.title, description: track.description, mood: track.mood, kind: 'audio',
    url: track.url, thumbnail: '', sourceUrl, author: 'Scott Buckley', authorUrl: 'https://www.scottbuckley.com.au/',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: `'${track.title}' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au; ${sourceUrl}; https://creativecommons.org/licenses/by/4.0/`,
    rights: { attributionRequired: true, shareAlike: false, synchronisationOnly: true, noFingerprinting: true, youtubeDescriptionCredit: true, licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    width: 0, height: 0, duration: 0, bytes: 0 };
}
export async function verifyScottBuckleyTrack(track, { requestText, signal } = {}) {
  const asset = scottBuckleyAsset(track), html = await requestText(asset.sourceUrl, { signal });
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replaceAll('&amp;', '&'));
  // The declaration must bind this exact track and original, rather than the
  // generic site footer. Retain the page hash and extracted evidence in receipt.
  const declaration = html.match(/This work is licensed under[\s\S]{0,800}?(?:<\/p>|Attribution format)/i)?.[0];
  const credit = `'${track.title}' by Scott Buckley`;
  const declarationLink = declaration?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  const declaredLicense = declaration?.includes(asset.licenseUrl) || (/Creative Commons Attribution 4\.0 International License/i.test(declaration || '') && /^https?:\/\/www\.scottbuckley\.com\.au\/library\/using-this-music\/$/.test(declarationLink || ''));
  if (!links.includes(track.url) || !declaredLicense || !links.some((url) => /^https?:\/\/creativecommons\.org\/licenses\/by\/4\.0\/?$/.test(url)) || !html.includes(credit)) throw new Error(`${track.title} 官方逐曲下载、作者或 CC BY 4.0 声明已变化，已暂停使用`);
  return { ...asset, licenseEvidence: { method: 'official-track-page', sourceUrl: asset.sourceUrl, sha256: createHash('sha256').update(html).digest('hex'),
    requiresSourceVerification: false, trackTitle: track.title, author: asset.author, audioUrl: track.url, declarationLink, licenseUrl: asset.licenseUrl }, licenseCheckedAt: new Date().toISOString() };
}
export async function searchScottBuckley(query, { requestText, signal } = {}) {
  const tokens = String(query || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const selected = SCOTT_BUCKLEY_TRACKS.filter((t) => !tokens.length || tokens.some((word) => `${t.title} ${t.description}`.toLowerCase().includes(word)));
  return Promise.all(selected.map((track) => verifyScottBuckleyTrack(track, { requestText, signal })));
}
