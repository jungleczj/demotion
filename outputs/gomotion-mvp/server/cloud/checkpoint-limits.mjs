// A 25k-character film may contain hundreds of short narration chunks, each
// with a WAV and receipt, alongside scene sources and playback artifacts.
// Keep upload authorization batches small while committing one bounded index.
export const MAX_UPLOAD_FILES = 200;
export const MAX_CHECKPOINT_FILES = 2048;
export const MAX_CHECKPOINT_BYTES = 3_000_000;
