import { createHash } from 'node:crypto';
export const SCOTT_BUCKLEY_TRACKS = Object.freeze([
  { slug: 'undertow', title: 'Undertow', description: 'Sombre ebbing piano strings synth; reflective melancholy documentary underwater journey. 沉静 钢琴 弦乐 海洋 水下 纪录片 思考', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3' },
  { slug: 'the-great-sea', title: 'The Great Sea', description: 'Grand sweeping orchestral solo cello growing momentum emotion; ocean sea wildlife exploration journey. 宏大 管弦 大提琴 海洋 大海 野生动物 探索 旅程', url: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2024/01/TheGreatSea.mp3' },
]);
export async function searchScottBuckley(query, { requestText, signal } = {}) {
  const tokens = String(query || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const selected = SCOTT_BUCKLEY_TRACKS.filter((t) => !tokens.length || tokens.some((word) => `${t.title} ${t.description}`.toLowerCase().includes(word)));
  const results = await Promise.all(selected.map(async (track) => {
    const sourceUrl = `https://www.scottbuckley.com.au/library/${track.slug}/`;
    const html = await requestText(sourceUrl, { signal });
    // Curated two-track catalog, revalidated against its official per-track page.
    // No third-party playlists, remixes, guessed paths or downloaded previews.
    const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replaceAll('&amp;', '&'));
    if (!links.includes(track.url) || !links.some((url) => /^https?:\/\/creativecommons\.org\/licenses\/by\/4\.0\/?$/.test(url)) || !/This work is licensed under/i.test(html)) throw new Error(`${track.title} 官方逐曲下载或 CC BY 4.0 声明已变化，已暂停使用`);
    return { provider: 'scottbuckley', sourceId: track.slug, title: track.title, description: track.description, kind: 'audio',
      url: track.url, thumbnail: '', sourceUrl, author: 'Scott Buckley', authorUrl: 'https://www.scottbuckley.com.au/',
      license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: `'${track.title}' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au; ${sourceUrl}; https://creativecommons.org/licenses/by/4.0/`,
      rights: { attributionRequired: true, shareAlike: false, synchronisationOnly: true, noFingerprinting: true, youtubeDescriptionCredit: true, licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
      licenseEvidence: { method: 'official-track-page', sourceUrl, sha256: createHash('sha256').update(html).digest('hex'), requiresSourceVerification: false },
      licenseCheckedAt: new Date().toISOString(), width: 0, height: 0, duration: 0, bytes: 0 };
  }));
  return results;
}
