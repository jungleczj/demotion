const safeURL = (value) => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const clean = (value, limit = 650) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const LICENSES = { by: 'CC BY', cc0: 'CC0', pdm: 'Public domain mark' };

// Deliberately omit NC, ND and SA from the automatic composition/music path.
// Indexed licenses are discovery evidence, never a substitute for source review.
export async function searchOpenverse(query, kind, { requestJSON, signal } = {}) {
  if (!['image', 'audio'].includes(kind)) return [];
  const url = new URL(`https://api.openverse.org/v1/${kind === 'image' ? 'images' : 'audio'}/`);
  url.search = new URLSearchParams({ q: String(query).slice(0, 200), page_size: '12', license: 'by,cc0,pdm', filter_dead: 'true', mature: 'false', ...(kind === 'audio' ? { category: 'music', extension: 'mp3,wav,ogg,flac' } : { extension: 'jpg,jpeg,png,webp' }) }).toString();
  const data = await requestJSON(url, { signal });
  return (Array.isArray(data.results) ? data.results : []).flatMap((item) => {
    const media = safeURL(item.url), source = safeURL(item.foreign_landing_url), license = safeURL(item.license_url);
    if (!item.id || !LICENSES[item.license] || !media || !source || !license || new URL(license).hostname !== 'creativecommons.org' || item.mature === true || !clean(item.creator)) return [];
    const correctLicense = item.license === 'by' ? /^\/licenses\/by\/\d\.\d\/?$/.test(new URL(license).pathname) : item.license === 'cc0' ? new URL(license).pathname === '/publicdomain/zero/1.0/' : new URL(license).pathname === '/publicdomain/mark/1.0/';
    if (!correctLicense) return [];
    return [{ provider: 'openverse', sourceId: String(item.id), kind,
      title: clean(item.title, 240), description: clean((item.tags || []).map((t) => t.name || '').join(' ')),
      url: media, thumbnail: safeURL(item.thumbnail), sourceUrl: source, author: clean(item.creator, 240), authorUrl: safeURL(item.creator_url),
      license: `${LICENSES[item.license]} ${item.license_version || ''}`.trim(), licenseUrl: license,
      attribution: clean(item.attribution, 1800) || `${clean(item.title, 240)} — ${clean(item.creator, 240)}; ${LICENSES[item.license]} ${item.license_version || ''}; ${source}; ${license}`,
      rights: { attributionRequired: item.license === 'by', shareAlike: false, preserveSourceMarks: true, licenseUrl: license },
      licenseEvidence: { method: 'index-metadata', requiresSourceVerification: true },
      width: Number(item.width) || 0, height: Number(item.height) || 0, bytes: Number(item.filesize) || 0,
      duration: kind === 'audio' ? (Number(item.duration) || 0) / 1000 : 0,
      indexedProvider: clean(item.provider, 80), indexedSource: clean(item.source, 80), licenseCheckedAt: new Date().toISOString(),
    }];
  });
}
