# Background production and waiting expectations

Authorized behavior: navigation must not cancel production. Only an explicit stop cancels. Reopening a project restores live status. Keep existing UI; show film duration, an approximate production-time range, and elapsed time in its existing strip.

Implementation:
1. Backend owns a bounded serial queue for planning, visual retrieval/recovery, rendering and review. Persist project checkpoints and job state without service credentials. HTTP disconnects have no cancellation semantics.
2. Submission returns a stable task ID immediately; listing/polling and explicit cancellation are separate APIs. Resume persisted unfinished tasks from checkpoints when service connections are available.
3. Frontend polls tasks globally, merges only changed project snapshots, and never redirects on background completion. New production and remake use the same pipeline. Queue membership and stage are visible through existing project cards/strip.
4. Estimates use script/scene length, actual narration duration when known, and retry rounds. They are heuristic ranges, not guaranteed completion times. Display elapsed time and an honest overrun state; do not invent countdown progress.
5. Run syntax, type and production-build checks. No test suites or paid generation without a further request. Browser interaction is unavailable in this workspace.
