---
phase: 06-analysis
plan: 02
subsystem: sync
tags: [git-merge-tree, conflict-preview, binary-detection, risk-scoring]

# Dependency graph
requires:
  - phase: 05-core-infrastructure
    provides: upstream.cjs module with execGit, config functions
provides:
  - Conflict preview with getConflictPreview using git merge-tree --write-tree
  - Risk scoring with scoreConflictRisk and calculateOverallRisk
  - Binary file detection with detectBinaryChanges
  - cmdUpstreamPreview command for /gsd:sync-preview
  - Analysis state persistence in config.json
affects: [06-analysis (remaining plans), 07-merge-operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - git merge-tree --write-tree for conflict preview (Git 2.38+)
    - git diff --numstat for binary file detection
    - Risk scoring heuristics (file type weights, region counts, GSD-specific)

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/upstream.cjs

key-decisions:
  - "Git version check gates merge-tree --write-tree usage"
  - "Risk levels: easy (<2 score), moderate (<5), hard (>=5)"
  - "Binary categories: safe (images/fonts), review (archives), dangerous (executables)"
  - "Unknown binary extensions default to review category"
  - "Analysis state persists to config.json under upstream.analysis"

patterns-established:
  - "Risk scoring: base weight by file type * factor adjustments"
  - "GSD-specific file weighting: STATE.md +2, lib/ +0.5"
  - "Conflict suggestion generation based on file path patterns"

requirements-completed: [ANAL-02, ANAL-04]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 6 Plan 2: Conflict Preview with Risk Scoring Summary

**Conflict preview via git merge-tree with risk scoring (easy/moderate/hard) and binary file categorization (safe/review/dangerous)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T11:21:07Z
- **Completed:** 2026-02-24T11:27:13Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Git version detection with supportsWriteTree flag for Git 2.38+
- Conflict preview using git merge-tree --write-tree without modifying index
- Risk scoring with file type weights and GSD-specific adjustments
- Binary file detection categorized by risk level (safe/review/dangerous)
- cmdUpstreamPreview command with human-readable and JSON output modes
- Analysis state persistence to config.json for downstream workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Add conflict preview functions with git merge-tree** - `bd2a677` (feat)
2. **Task 2: Add binary file detection and categorization** - `b7c02bc` (feat)
3. **Task 3: Add cmdUpstreamPreview command with analysis state** - `db33235` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/upstream.cjs` - Added conflict preview, binary detection, and preview command

## Decisions Made
- Git version check returns structured object with supportsWriteTree boolean
- Risk scoring uses multiplicative file type weights (md=0.5, json=0.7, js/cjs=1.0, ts=1.2)
- Score thresholds: <2=easy, <5=moderate, >=5=hard
- Binary categories match CONTEXT.md: safe (images, fonts), review (archives), dangerous (executables)
- Analysis state includes analyzed_sha for staleness detection
- Context-aware suggestions based on GSD-specific file patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Conflict preview ready for /gsd:sync-preview command routing
- Binary detection available for merge workflow integration
- Analysis state ready for acknowledgment workflow in plan 6-03
- Risk scoring available for merge decision support

## Self-Check: PASSED

All verification checks passed:
- File exists: get-shit-done/bin/lib/upstream.cjs
- Commits exist: bd2a677, b7c02bc, db33235
- Exports verified: checkGitVersion, getConflictPreview, scoreConflictRisk, calculateOverallRisk, detectBinaryChanges, cmdUpstreamPreview

---
*Phase: 06-analysis*
*Completed: 2026-02-24*
