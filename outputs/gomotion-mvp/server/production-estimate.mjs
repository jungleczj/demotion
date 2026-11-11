import { estimateNarrationSeconds } from '../shared/narration-duration.mjs';

export function productionEstimate(project, retry = 0) {
  const videoSeconds = Math.max(1, project.narrationTrack?.duration || project.scenes?.reduce((sum, s) => sum + (Number(s.duration) || 0), 0) || estimateNarrationSeconds(project.script, project.voiceStyle));
  const count = project.scenes?.length || Math.max(3, Math.min(12, Math.ceil(videoSeconds / 7)));
  // Initial heuristic, not a latency guarantee. Include retrieval, narration, rendering and review.
  const batches = Math.ceil(count / 4);
  const minSeconds = Math.max(60, Math.ceil((20 + batches * 15 + videoSeconds * .5) / 30) * 30);
  const maxSeconds = Math.ceil((60 + batches * 40 + videoSeconds * 1.5 + retry * (20 + count * 6)) / 60) * 60;
  return { videoSeconds, minSeconds, maxSeconds: Math.max(minSeconds + 60, maxSeconds) };
}
