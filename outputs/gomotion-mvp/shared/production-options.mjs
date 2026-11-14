export const BACKGROUNDS = ['blue', 'cinematic', 'vintage', 'light', 'grid'];
export const MUSIC_GENRES = ['auto', 'epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];

// The project carries choices, never an executable path, download URL or licence
// assertion from the browser. Upload IDs are resolved by the server/owner store.
export function productionOptions(project = {}) {
  const music = project.musicOptions || {};
  const volume = typeof music.volume === 'number' && Number.isFinite(music.volume) ? Math.round(Math.max(0, Math.min(100, music.volume))) : 3;
  const upload = music.upload;
  return {
    ...(project.preserveScript === true ? { preserveScript: true } : {}),
    background: BACKGROUNDS.includes(project.background) ? project.background : 'blue',
    motionGraphics: project.motionGraphics !== false,
    musicOptions: {
      enabled: music.enabled !== false,
      genre: MUSIC_GENRES.includes(music.genre) ? music.genre : 'auto',
      ...(typeof music.trackId === 'string' && /^scottbuckley:[a-z0-9-]{1,80}$/.test(music.trackId) ? { trackId: music.trackId } : {}),
      volume,
      ...(upload && typeof upload.id === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(upload.id) ? { upload: { id: upload.id, name: String(upload.name || 'Uploaded music').replace(/[\x00-\x1f]/g, '').slice(0, 120), ...(/^[a-f0-9]{64}$/.test(upload.sha256 || '') ? { sha256: upload.sha256 } : {}) } } : {}),
    },
  };
}
