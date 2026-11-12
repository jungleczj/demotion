export const AUDIO_MIX_VERSION = 2;

// Cache eligibility only: the mixer validates the actual source bytes and
// output audio. Keep already completed short films reusable when their old
// mix never crossed a music-loop boundary.
export function audioMixCompatible(project) {
  const music = project?.music, mix = music?.mix, source = music?.source;
  const version = project?.videoProfile?.audioMixVersion;
  if (![1, AUDIO_MIX_VERSION].includes(version) || mix?.version !== version
    || music.status !== 'mixed' || music.mixed !== true || music.narrationPreserved !== true
    || mix.continuous !== true || mix.start !== 0 || !Number.isFinite(mix.end) || mix.end <= 0
    || !Number.isFinite(source?.duration) || source.duration <= 0
    || source.fullDecode !== true || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) return false;
  if (mix.looped === false) return mix.end <= source.duration;
  if (mix.looped !== true || version !== AUDIO_MIX_VERSION) return false;
  return Number.isFinite(mix.loopCrossfadeSeconds) && mix.loopCrossfadeSeconds > 0
    && mix.loopCrossfadeSeconds < source.duration / 2
    && Number.isFinite(mix.loopPeriodSeconds) && mix.loopPeriodSeconds > 0
    && Math.abs(mix.loopPeriodSeconds - (source.duration - mix.loopCrossfadeSeconds)) < .001;
}
