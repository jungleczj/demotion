// Offline test signals only. These tones are not generated speech and cannot
// establish language, voice identity, naturalness, or provider availability.
export function fixturePCM(parts = [{ tone: 1 }]) {
  return Buffer.concat(parts.map((part) => {
    const buffer = Buffer.alloc(Math.round((part.tone ?? part.silence) * 24000) * 2);
    if (part.tone) for (let i = 0; i < buffer.length / 2; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 220 * Math.PI * 2 / 24000) * 5000), i * 2);
    return buffer;
  }));
}
export function fixtureWAV(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export function fixtureAudioResponse(parts) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: fixturePCM(parts).toString('base64') } }] } }] }), { headers: { 'Content-Type': 'application/json' } });
}
