export type Provider = 'commons' | 'archive' | 'nasa' | 'pexels' | 'pixabay' | 'coverr' | 'upload';
export type Asset = {
  id: string; provider: Provider; sourceId: string; title: string; description: string;
  url: string; thumbnail: string; sourceUrl: string; author: string; authorUrl?: string;
  license: string; licenseUrl: string; width: number; height: number; duration: number;
  kind: 'video' | 'image'; score?: number; reason?: string; matchMethod?: string;
  playbackChecked?: boolean; downloadChecked?: boolean; playbackUrl?: string; downloadUrl?: string; downloadBytes?: number; playbackWidth?: number; playbackHeight?: number;
  generated?: boolean; renderKind?: 'motion-graphic'; sourceAssets?: SourceImageReceipt[]; processingPlan?: SourceProcessingPlan; attribution?: string;
};
export type SourceAnnotation = { sourceAssetId: string; label: string; quote: string; region: [number, number, number, number]; observed: string };
export type SourceProcessingPlan = { kind: 'source-annotation'; operations: ('source-image' | 'evidence-highlight' | 'label-reveal')[]; preserveMarks: true; noInventedMotion: true; sourceAssetIds?: string[] };
export type SourceImageReceipt = {
  id: string; provider: Provider; sourceId: string; sourceUrl: string; author: string; license: string; licenseUrl: string;
  localPath: string; decodedPath: string; sha256: string; decodedSha256: string; width: number; height: number;
  attribution?: string; rights?: { attributionRequired: boolean; shareAlike: boolean; preserveSourceMarks: boolean; licenseUrl: string };
  contentReview: { actualRead: true; inputSha256: string; reviewedImageSha256: string; matched: true; exactSubject: true; clear: true; watermarkFree: true; licenseUsable: true; observed: string; annotations: SourceAnnotation[]; limitations?: string[] };
};
type LegacyMotionGraphic = { schemaVersion: 1; type: 'mechanism' | 'process' | 'comparison' | 'timeline' | 'stat'; title: string; explanation: string; mechanism?: 'penguin-egg'; nodes: { label: string; quote: string; icon: string; valueText?: string }[] };
export type MotionGraphic = LegacyMotionGraphic | { schemaVersion: 2; sceneId: string; narration: string; type: 'source-annotation'; title: string; explanation: string; sourceAssets: SourceImageReceipt[]; annotations: SourceAnnotation[]; processingPlan: SourceProcessingPlan };
export type Scene = {
  id: string; index: number; text: string; query: string; visual: string; exact: boolean;
  duration: number; start: number; selected: Asset | null; candidates: Asset[];
  confirmed: boolean; status: 'pending' | 'searching' | 'done' | 'error'; error?: string; continuityNote?: string; trimEnd?: number; searchMethod?: string; transitionType?: 'cut' | 'dissolve'; transitionDuration?: number;
  visualObservation?: { assetId: string; observed: string; medium: string; watermarkFree?: boolean; uncertainties: string[]; intervals: {start: number; end: number; reason: string}[] };
  motionGraphic?: MotionGraphic; renderKind?: 'footage' | 'motion-graphic';
};
export type NarrationTrack = { processingVersion?: number; key: string; url: string; voice: string; style: string; language?: string; duration: number; scenes: {id: string; text: string; start: number; end: number}[] };
export type Project = {
  id: string; title: string; script: string; createdAt: string; productionUpdatedAt?: number;
  voice: string; voiceStyle?: string; language?: string; originalScript?: string; narrationTrack?: NarrationTrack; format: 'landscape' | 'portrait'; fit: 'cover' | 'contain';
  subtitles: boolean; topic: string; scenes: Scene[]; exportUrl?: string; exportId?: string; sequenceReport?: SequenceReport; aiTrace?: AIEvent[]; videoReview?: VideoReview; visualError?: string;
  videoProfile?: { version: number; width: number; height: number; fps: number; label: string; captionStyleVersion?: number };
  motionStyle?: { background: string; accent: string; text: string; muted: string };
};
export type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type AIEvent = { stage: string; engine: string; model?: string; status: string; inputType?: string; mediaCount?: number; at?: string; durationMs?: number; detail?: string; usage?: TokenUsage };
export type SequenceReport = { stopReason?: 'quota' | 'connection'; retries?: number; retryLimit?: number; complete?: boolean; missingScenes?: string[]; analyzed: number; candidates: number; warnings: string[]; method: string; provider?: string; model?: string; summary?: string; bytes?: number; events?: AIEvent[]; usage?: TokenUsage; analyzedUntil?: number };
export type SequenceResult = { scenePlan?: Scene[]; narrationTrack?: NarrationTrack; scenes: (Pick<Scene, 'id' | 'selected' | 'start' | 'continuityNote'> & Partial<Pick<Scene, 'duration' | 'trimEnd' | 'visualObservation' | 'query' | 'visual' | 'candidates' | 'searchMethod' | 'transitionType' | 'transitionDuration'>>)[]; report: SequenceReport };
export type VideoReview = { passed?: boolean; audioReviewed?: boolean; watermarkFree?: boolean; exportId: string; provider: string; model: string; summary: string; analyzedUntil: number; totalDuration: number; limitations: string[]; events: AIEvent[]; issues: {time: number; sceneIndex: number; type: string; severity: string; description: string; suggestion: string}[] };
export type AnalysisJob = { id: string; status: 'running' | 'done' | 'incomplete' | 'error' | 'cancelled'; progress: number; message: string; events: AIEvent[]; bytes: number; result?: SequenceResult; review?: VideoReview; error?: string };
export type Config = {
  aiConnected: boolean; llmBase: string; llmModel: string;
  pexelsConnected: boolean; pixabayConnected: boolean; coverrConnected: boolean; localVoice: boolean; render: boolean;
  sources: Provider[];
  visionConfigured: boolean; visionEnabled: boolean; visionProvider: 'gemini' | 'openai'; visionBase: string; visionModel: string;
  textProvider?: 'vision' | 'openai'; network?: {configured: boolean; source: string; address?: string};
};
export type SearchResult = { assets: Asset[]; warnings: string[]; queriedSources: Provider[]; cached: boolean; rankMethod?: string };
export type ExportJob = { createdAt?: number; id: string; status: 'rendering' | 'done' | 'error' | 'cancelled'; progress: number; message: string; error?: string; url?: string; duration?: number; size?: number; review?: VideoReview; reviewError?: string };
export const sourceLabels: Record<Provider, string> = { commons: 'Wikimedia', archive: 'Internet Archive', nasa: 'NASA', pexels: 'Pexels', pixabay: 'Pixabay', coverr: 'Coverr', upload: '本地素材' };
export const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const media = (asset: Asset, thumb = false) => `/api/media?id=${encodeURIComponent(asset.id)}${thumb ? '&thumbnail=1' : ''}`;
export const contentApproved = (scene: Scene) => Boolean(scene.selected?.kind === 'video' && (scene.confirmed || (scene.visualObservation?.assetId === scene.selected.id && Number.isFinite(scene.trimEnd))));

export type ProductionTask = {
  id: string; project: Project; status: 'queued' | 'running' | 'done' | 'incomplete' | 'error' | 'cancelled';
  phase: 'queued' | 'planning' | 'matching' | 'rendering' | 'reviewing'; progress: number; message: string;
  createdAt: number; updatedAt: number; startedAt?: number; finishedAt?: number;
  estimate: {videoSeconds: number; minSeconds: number; maxSeconds: number}; retry: number; retryLimit: number;
};
export const productionActive = (task?: ProductionTask) => Boolean(task && (task.status === 'queued' || task.status === 'running'));
