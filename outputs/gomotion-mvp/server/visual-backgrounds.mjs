const palettes = {
  blue: { background: '#0e182d', accent: '#80abff', text: '#f4f7ff', muted: '#acbad3' },
  cinematic: { background: '#393126', accent: '#eacb89', text: '#fff7e6', muted: '#c7bda7' },
  vintage: { background: '#e3d7bd', accent: '#8a5329', text: '#332c25', muted: '#766650' },
  light: { background: '#f4f3f0', accent: '#315efb', text: '#172235', muted: '#69778a' },
  grid: { background: '#080c12', accent: '#80cbb5', text: '#f0f7f5', muted: '#a2b8b3' },
};
export function backgroundStyle(id) { return { ...(palettes[id] || palettes.blue), theme: palettes[id] ? id : 'blue' }; }

// Original decorative textures only. They cannot add geographical outlines,
// subject illustrations or factual chart content to a source-based composite.
export function backgroundSVG(theme, width, height, fallback = '#163341') {
  const { background } = palettes[theme] || { background: fallback };
  const base = `<rect width="${width}" height="${height}" fill="${background}"/>`;
  if (!palettes[theme] || theme === 'blue') return base;
  if (theme === 'grid') return `${base}<defs><pattern id="background-grid" width="${width / 24}" height="${width / 24}" patternUnits="userSpaceOnUse"><path d="M ${width / 24} 0 H 0 V ${width / 24}" fill="none" stroke="#90a6bc" stroke-opacity=".18" stroke-width="1"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#background-grid)"/>`;
  const pale = theme === 'light';
  const grain = Array.from({ length: 32 }, (_, i) => `<circle cx="${(i * 29 + 7) % 64}" cy="${(i * 17 + 11) % 64}" r="${i % 3 === 0 ? '.7' : '.35'}" fill="#30291f"/>`).join('');
  return `${base}<defs><radialGradient id="background-glow"><stop stop-color="${pale ? '#ffffff' : '#fff1c4'}" stop-opacity="${pale ? '.7' : '.25'}"/><stop offset="1" stop-color="#0b1019" stop-opacity="${pale ? '.06' : theme === 'vintage' ? '.13' : '.55'}"/></radialGradient><pattern id="background-paper" width="64" height="64" patternUnits="userSpaceOnUse">${grain}</pattern></defs><rect width="${width}" height="${height}" fill="url(#background-glow)"/><rect width="${width}" height="${height}" fill="url(#background-paper)" opacity="${pale ? '.08' : '.2'}"/>`;
}
