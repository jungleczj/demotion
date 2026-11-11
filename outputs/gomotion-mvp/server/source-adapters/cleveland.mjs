const safeURL = (value, hosts) => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname) ? u.href : ''; } catch { return ''; } };
const clean = (v, max = 650) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export async function searchCleveland(query, kind, { requestJSON, signal } = {}) {
  if (kind !== 'image') return [];
  const url = new URL('https://openaccess-api.clevelandart.org/api/artworks/');
  url.search = new URLSearchParams({ q: String(query).slice(0, 200), cc0: '1', has_image: '1', limit: '8' }).toString();
  const data = await requestJSON(url, { signal });
  return (Array.isArray(data.data) ? data.data : []).flatMap((item) => {
    if (item.share_license_status !== 'CC0' || !item.id) return [];
    // Only API-published JPEGs; full-sized TIFFs can exceed 100 MB.
    const image = [item.images?.print, item.images?.web].find((f) => safeURL(f?.url, ['openaccess-cdn.clevelandart.org']) && /\.jpe?g$/i.test(new URL(f.url).pathname) && Number(f.filesize) <= 24 * 1024 * 1024 && Number(f.width) > 0 && Number(f.height) > 0);
    const sourceUrl = safeURL(item.url, ['clevelandart.org', 'www.clevelandart.org']);
    if (!image || !sourceUrl) return [];
    const author = clean((item.creators || []).map((c) => c.description || c.name).filter(Boolean).join('; ') || 'Artist unrecorded — Cleveland Museum of Art collection', 240);
    return [{ provider: 'cleveland', sourceId: String(item.id), kind: 'image', title: clean(item.title, 240), description: clean(`${item.description || ''} ${item.technique || ''} ${item.creation_date || ''} ${(item.culture || []).join('; ')}`),
      url: image.url, thumbnail: safeURL(item.images?.web?.url, ['openaccess-cdn.clevelandart.org']) || image.url, sourceUrl, author,
      license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: `${clean(item.title, 240)} — ${author}; Cleveland Museum of Art; CC0 1.0; ${sourceUrl}`,
      rights: { attributionRequired: false, shareAlike: false, preserveSourceMarks: true, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      width: Number(image.width), height: Number(image.height), bytes: Number(image.filesize), duration: 0, licenseCheckedAt: new Date().toISOString(),
    }];
  });
}
