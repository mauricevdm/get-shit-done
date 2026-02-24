---
phase: 06-analysis
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements: [ANAL-01]

must_haves:
  truths:
    - "User can see upstream commits grouped by directory (default)"
    - "User can see upstream commits grouped by feature type (--by-feature flag)"
    - "Multi-touch commits appear under each affected directory"
    - "Directory depth adapts when >50% of commits cluster in one directory"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "cmdUpstreamAnalyze function"
      exports: ["cmdUpstreamAnalyze", "groupCommitsByDirectory", "getCommitsWithFiles"]
  key_links:
    - from: "cmdUpstreamAnalyze"
      to: "git log --format --name-only"
      via: "execGit"
      pattern: "execGit.*log.*--name-only"
    - from: "cmdUpstreamAnalyze"
      to: "groupCommitsByType"
      via: "--by-feature flag"
      pattern: "options.by_feature.*groupCommitsByType"
---

<objective>
Add commit grouping functions to upstream.cjs for the /gsd:sync-analyze command

Purpose: Enable fork maintainers to see upstream commits organized by directory or feature type, making it easier to understand what areas of the codebase have changed before deciding to merge.

Output: Three new functions in upstream.cjs (cmdUpstreamAnalyze, groupCommitsByDirectory, getCommitsWithFiles) with support for directory grouping (default) and feature grouping (--by-feature flag).
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-analysis/6-CONTEXT.md
@.planning/phases/06-analysis/6-RESEARCH.md
@get-shit-done/bin/lib/upstream.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getCommitsWithFiles helper function</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add a helper function `getCommitsWithFiles(cwd)` that retrieves upstream commits with their affected files:

1. Use git log with parseable format: `git log --format=%h|%an|%as|%s --name-only HEAD..upstream/main`
2. Parse the output to build array of commit objects: `{ hash, author, date, subject, files: string[] }`
3. Handle the blank-line separation between commits in git log output
4. Return empty array if no commits or upstream not configured

Example output format from git:
```
a1b2c3d|Author Name|2026-02-24|feat: add feature
lib/upstream.cjs
commands/gsd/sync.md

d4e5f6g|Author Name|2026-02-23|fix: bug fix
lib/health.cjs
```

Place this helper near the existing helper functions section (after `getRemotes`).
  </action>
  <verify>
Add console.log test in a temporary script:
```bash
node -e "const m = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(JSON.stringify(m.getCommitsWithFiles('.'), null, 2))"
```
Should return array of commit objects with files.
  </verify>
  <done>Function returns array of commit objects with hash, author, date, subject, and files array</done>
</task>

<task type="auto">
  <name>Task 2: Add groupCommitsByDirectory function</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add `groupCommitsByDirectory(commits)` function that groups commits by top-level directory:

1. Iterate commits, for each file extract top-level directory:
   - `lib/foo.cjs` -> `lib/`
   - `commands/gsd/sync.md` -> `commands/`
   - `README.md` -> `/` (root)

2. Build Map: directory -> Set of commits (use Set to handle multi-touch commits appearing once per directory)

3. Implement adaptive depth: if >50% of commits cluster in one directory AND >5 commits total:
   - Go one level deeper for that directory
   - e.g., `commands/` with 80% -> split into `commands/gsd/`, `commands/other/`
   - Cap at 2 levels deep to avoid over-splitting

4. Return Map of directory -> commit Set

Per CONTEXT.md: "Multi-touch commits appear under each affected directory (complete view, some repetition)"
  </action>
  <verify>
Test with mock data:
```bash
node -e "
const m = require('./get-shit-done/bin/lib/upstream.cjs');
const commits = [
  { hash: 'a1', files: ['lib/a.cjs', 'commands/x.md'] },
  { hash: 'b2', files: ['lib/b.cjs'] },
];
const groups = m.groupCommitsByDirectory(commits);
for (const [dir, set] of groups) console.log(dir, [...set].map(c => c.hash));
"
```
Should show `lib/` with [a1, b2] and `commands/` with [a1].
  </verify>
  <done>Function returns Map of directory to commit Set with adaptive depth for clustered directories</done>
</task>

<task type="auto">
  <name>Task 3: Add cmdUpstreamAnalyze command function</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add `cmdUpstreamAnalyze(cwd, options, output, error, raw)` command function:

1. Check upstream configuration (same pattern as cmdUpstreamStatus)
2. Get commits with files using getCommitsWithFiles
3. Handle zero-state: if no commits, output "Up to date with upstream"

4. Check options.by_feature flag:
   - If true: Use existing groupCommitsByType for conventional commit grouping
   - If no conventional commits found, fall back to directory grouping with warning
   - If false (default): Use groupCommitsByDirectory

5. Format output per CONTEXT.md example:
   Human-readable:
   ```
   [folder emoji] lib/ (4 commits)
     a1b2c3d refactor: extract sync utilities
     d4e5f6g feat: add conflict detection

   [folder emoji] commands/ (2 commits)
     l0m1n2o feat: add conflict detection
     p3q4r5s feat: new sync command
   ```

   JSON (raw mode):
   ```json
   {
     "grouped_by": "directory",
     "groups": {
       "lib/": [{ "hash": "a1b2c3d", "subject": "..." }],
       "commands/": [...]
     },
     "total_commits": 6
   }
   ```

6. Use Unicode escapes for emojis: `\uD83D\uDCC1` for folder emoji (matching existing pattern)

7. Export in module.exports
  </action>
  <verify>
Run with actual upstream (if configured):
```bash
node get-shit-done/bin/gsd-tools.cjs upstream log
# Then test analyze (will fail until CLI routing added, but function should exist)
node -e "const m = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof m.cmdUpstreamAnalyze)"
# Should output: function
```
  </verify>
  <done>cmdUpstreamAnalyze function exported, supports directory grouping (default) and feature grouping (--by-feature), outputs per CONTEXT.md format</done>
</task>

</tasks>

<verification>
1. All three functions exist in upstream.cjs exports
2. getCommitsWithFiles returns array with hash, files structure
3. groupCommitsByDirectory handles multi-touch commits correctly
4. cmdUpstreamAnalyze produces output matching CONTEXT.md format
5. No syntax errors: `node -c get-shit-done/bin/lib/upstream.cjs`
</verification>

<success_criteria>
- getCommitsWithFiles retrieves commits with affected files from git log
- groupCommitsByDirectory groups by top-level directory with adaptive depth
- cmdUpstreamAnalyze supports both directory and feature grouping modes
- Output format matches CONTEXT.md examples exactly
- All functions exported from module
</success_criteria>

<output>
After completion, create `.planning/phases/06-analysis/6-01-SUMMARY.md`
</output>
