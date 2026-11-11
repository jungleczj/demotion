# Playback and complete coverage repair

Confirmed: registered Commons original for scene 2 returns HTTP 429; published 480p derivative returns 206. Coverr MP4 and Pixabay MP4 return 206. Old media proxy hides upstream status. Picker retry incorrectly runs search. Browser compatibility was never normalized.

Implementation:
- Obtain Commons official derivatives for new and existing assets; analysis uses <=12MB rendition, export <=1080p rendition.
- On-demand bounded preview cache: download one requested preview, normalize H.264/yuv420p/faststart, serve local byte ranges. Deduplicate work, bound concurrency/download/cache, preserve source timestamps and full preview duration.
- Shared player displays preparation and actionable error; retry repeats preview, selection requires successful media load. Pause timeline during buffering.
- AI retries rejected footage with other candidates and new source-specific queries; incomplete work is not reported as complete. No still-image fill, loops or blank frames.
- Voice quality work uses generated neural audio consistently in measurement, preview and export; include actual audio in review. Provider availability and listening approval must remain explicit.

Validation requested by user: none. Use syntax/type/build checks and diagnostic HTTP inspection; do not run automated tests or paid generation without a specific need.
