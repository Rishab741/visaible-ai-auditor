/**
 * Bump whenever scoring-relevant logic changes: lib/signals.ts (category/
 * overall score computation), lib/analyzer.ts (how findings are derived), or
 * lib/crawler.ts's structural-signal extraction. The cache only serves back a
 * scan stamped with the CURRENT version — a scan computed under older logic
 * ages out automatically instead of being served indefinitely (or requiring a
 * manual DB cleanup, which is how two stale pre-versioning scans ended up
 * stuck serving categoryScores: null earlier in this project's history).
 */
export const PIPELINE_VERSION = 1;
