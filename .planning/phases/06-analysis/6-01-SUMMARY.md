---
phase: 06-analysis
plan: 01
subsystem: upstream-sync
tags: [git, commits, grouping, analysis]
requirements-completed: [ANAL-01]
dependency-graph:
  requires: [getRemotes, loadUpstreamConfig, groupCommitsByType]
  provides: [getCommitsWithFiles, groupCommitsByDirectory, cmdUpstreamAnalyze]
  affects: [/gsd:sync-analyze command]
tech-stack:
  added: []
  patterns: [git-log-name-only, adaptive-depth-grouping, conventional-commit-fallback]
key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/upstream.cjs
key-decisions:
  - Directory grouping as default with --by-feature flag for semantic grouping
  - Adaptive depth triggers at >50% clustering AND >5 total commits
  - Multi-touch commits appear under each affected directory
metrics:
  duration: 9m 37s
  tasks-completed: 3
  files-modified: 1
  completed: 2026-02-24
---

# Phase 6 Plan 01: Commit Grouping Functions Summary

Implemented three commit grouping functions for directory-based analysis of upstream changes.

## One-liner

Added getCommitsWithFiles, groupCommitsByDirectory, and cmdUpstreamAnalyze to upstream.cjs for directory-based commit grouping with adaptive depth.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add getCommitsWithFiles helper function | a71c255 | upstream.cjs |
| 2 | Add groupCommitsByDirectory function | 4643c39 | upstream.cjs |
| 3 | Add cmdUpstreamAnalyze command function | 8c6e742 | upstream.cjs |

## Implementation Details

### Task 1: getCommitsWithFiles

Added helper function that retrieves upstream commits with their affected files using `git log --format=%h|%an|%as|%s --name-only HEAD..upstream/main`. Parses the output to build array of commit objects with hash, author, date, subject, and files array. Handles blank-line separation between commits in git log output. Returns empty array if no commits or upstream not configured.

### Task 2: groupCommitsByDirectory

Added function that groups commits by top-level directory they affect. Multi-touch commits appear under each affected directory (using Set to avoid duplicates). Implements adaptive depth algorithm: if >50% of commits cluster in one directory AND >5 commits total, goes one level deeper for that directory (capped at 2 levels to avoid over-splitting). Returns Map of directory string to Set of commit objects.

### Task 3: cmdUpstreamAnalyze

Added command function that supports two grouping modes:
- **Directory grouping (default)**: Uses getCommitsWithFiles and groupCommitsByDirectory
- **Feature grouping (--by-feature flag)**: Uses existing groupCommitsByType for conventional commit grouping, with automatic fallback to directory grouping if >50% of commits lack conventional commit format

Output format matches CONTEXT.md specification with folder emoji and commit list. JSON output includes grouped_by, total_commits, and groups object. Handles zero-state with "Up to date with upstream" message.

## Verification Results

All verification checks passed:

1. All three functions exported from upstream.cjs
2. getCommitsWithFiles returns array with correct structure (hash, author, date, subject, files)
3. groupCommitsByDirectory handles multi-touch commits correctly (a1 appears in both lib/ and commands/)
4. cmdUpstreamAnalyze function exists and is ready for CLI routing
5. No syntax errors (file loads successfully)

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies for Next Plans

- Plan 6-02 (conflict preview): Uses execGit pattern established here
- Plan 6-03 (rename/delete detection): May reference getCommitsWithFiles for cross-referencing
- Plan 6-04 (CLI routing): Will add `upstream analyze` command routing to gsd-tools.cjs

## Self-Check: PASSED

- [x] get-shit-done/bin/lib/upstream.cjs exists
- [x] Commit a71c255 exists (Task 1)
- [x] Commit 4643c39 exists (Task 2)
- [x] Commit 8c6e742 exists (Task 3)
