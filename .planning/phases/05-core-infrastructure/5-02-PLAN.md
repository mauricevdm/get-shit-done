---
phase: 05-core-infrastructure
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements:
  - SYNC-03
  - SYNC-04

must_haves:
  truths:
    - "User can see how many commits behind upstream they are with summary info"
    - "User can view upstream commit log with author, date, and message summaries"
    - "Commits are grouped by conventional commit type with emoji headers"
    - "Local uncommitted changes trigger a warning"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Status and log commands"
      exports: ["cmdUpstreamStatus", "cmdUpstreamLog", "parseConventionalCommit", "groupCommitsByType"]
  key_links:
    - from: "cmdUpstreamStatus"
      to: "git rev-list"
      via: "commit count comparison"
      pattern: "rev-list.*--count.*HEAD\\.\\.upstream"
    - from: "cmdUpstreamLog"
      to: "COMMIT_TYPES"
      via: "conventional commit parsing"
      pattern: "COMMIT_TYPES\\["
---

<objective>
Add status and log commands to the upstream.cjs module.

Purpose: Enable users to understand what changes are available upstream before deciding to sync. Status shows commit count and file summary; log shows grouped commits by type.

Output: cmdUpstreamStatus and cmdUpstreamLog functions in upstream.cjs.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-core-infrastructure/5-CONTEXT.md
@.planning/phases/05-core-infrastructure/5-RESEARCH.md
@get-shit-done/bin/lib/worktree.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add status command to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add `cmdUpstreamStatus` function to upstream.cjs:

**cmdUpstreamStatus(cwd, options, output, error, raw):**

1. Load upstream config - error if not configured
2. Check if cache is stale (>24 hours since last_fetch)
3. Get commit count: `git rev-list --count HEAD..upstream/main`
4. Get latest upstream commit date: `git log -1 --format="%as" upstream/main`
5. Get file change summary:
   - `git diff --stat HEAD..upstream/main | tail -1` for total
   - `git diff --dirstat=files HEAD..upstream/main` for directory breakdown
6. If <=10 files changed, list them; else show "N files across M directories"
7. Check for local uncommitted changes: `git status --porcelain`
8. Check for unpushed commits: `git rev-list origin/main..HEAD --count`

**Output format (per CONTEXT.md):**
```
5 commits behind upstream (latest: Feb 21)
12 files changed in lib/, commands/, templates/

[warning if uncommitted changes]
[warning if unpushed commits]
```

**JSON output structure:**
```json
{
  "commits_behind": 5,
  "latest_upstream_date": "2026-02-21",
  "files_changed": 12,
  "directories": ["lib/", "commands/", "templates/"],
  "file_list": ["lib/foo.cjs", ...],  // if <=10 files
  "warnings": {
    "uncommitted_changes": true,
    "unpushed_commits": 4
  },
  "cache_stale": false
}
```

**Zero state:** "Up to date with upstream (last synced: Feb 20)"
  </action>
  <verify>
Manual test: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); u.cmdUpstreamStatus(process.cwd(), {}, console.log, console.error, false)"`
Should show commits behind count and file summary.
  </verify>
  <done>
Status command shows commit count, latest date, file/directory summary, and warnings for uncommitted/unpushed changes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add log command with conventional commit grouping</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add conventional commit parsing and `cmdUpstreamLog` function:

**Constants (add near top):**
```javascript
const COMMIT_TYPES = {
  feat:     { emoji: '✨', label: 'Features' },
  fix:      { emoji: '🐛', label: 'Fixes' },
  refactor: { emoji: '♻️', label: 'Refactors' },
  docs:     { emoji: '📚', label: 'Documentation' },
  test:     { emoji: '✅', label: 'Tests' },
  chore:    { emoji: '🔧', label: 'Chores' },
  style:    { emoji: '💄', label: 'Styles' },
  perf:     { emoji: '⚡', label: 'Performance' },
  ci:       { emoji: '👷', label: 'CI' },
  build:    { emoji: '🏗️', label: 'Build' },
};

const CONVENTIONAL_PATTERN = /^(\w+)(?:\([^)]+\))?!?:\s*(.+)/;
```

**Helper functions:**
- `parseConventionalCommit(subject)` - Returns `{ type, description }` or null
- `groupCommitsByType(commits)` - Returns `{ groups: { feat: [...], fix: [...] }, other: [...] }`
- `truncateSubject(subject, maxLen = 60)` - Truncate with ellipsis

**cmdUpstreamLog(cwd, options, output, error, raw):**

1. Load upstream config - error if not configured
2. Get commits: `git log --format="%h|%an|%as|%s" HEAD..upstream/main`
3. Parse each line into `{ hash, author, date, subject }`
4. Group by conventional commit type using `groupCommitsByType`
5. If all commits are conventional: output grouped format
6. If no conventional commits: output flat chronological list (fallback per CONTEXT.md)

**Human-readable output (per CONTEXT.md):**
```
✨ Features (3 commits)
  a1b2c3d feat: add sync status command
  d4e5f6g feat: implement upstream fetch
  h7i8j9k feat: add notification system

🐛 Fixes (2 commits)
  l0m1n2o fix: handle network timeout gracefully
  p3q4r5s fix: correct path resolution in worktrees
```

**JSON output:**
```json
{
  "total_commits": 5,
  "grouped": true,
  "groups": {
    "feat": [{ "hash": "a1b2c3d", "subject": "add sync status command" }],
    "fix": [...]
  },
  "other": []
}
```

Per CONTEXT.md:
- Hash + title only, truncated at ~60 chars
- Group headers: Emoji + label: "Features (3 commits)"
- Fallback to flat chronological if no conventional commits
  </action>
  <verify>
Test parsing: `parseConventionalCommit("feat(sync): add status command")` returns `{ type: "feat", description: "add status command" }`.
Test grouping with sample commits.
  </verify>
  <done>
Log command parses commits, groups by conventional type with emoji headers, falls back to flat list.
parseConventionalCommit and groupCommitsByType helper functions exported.
  </done>
</task>

</tasks>

<verification>
1. cmdUpstreamStatus shows: commits behind, latest date, file summary, warnings
2. cmdUpstreamLog shows: grouped commits with emoji headers
3. Zero state handled: "Up to date with upstream"
4. Fallback grouping works when no conventional commits present
</verification>

<success_criteria>
- Status shows "N commits behind upstream (latest: DATE)" with file summary
- Status warns about uncommitted changes and unpushed commits
- Log groups commits by type with emoji headers (feat, fix, refactor, etc.)
- Log falls back to flat chronological list when no conventional commits
- Both commands handle "up to date" state gracefully
</success_criteria>

<output>
After completion, create `.planning/phases/05-core-infrastructure/5-02-SUMMARY.md`
</output>
