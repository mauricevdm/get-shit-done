---
phase: 06-analysis
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements: [ANAL-02, ANAL-04]

must_haves:
  truths:
    - "User can preview which files would conflict before merge"
    - "Conflicts show full conflict markers by default"
    - "Conflicts are risk-scored as easy/moderate/hard"
    - "Binary file changes are detected and categorized by risk"
    - "Binary acknowledgment state persists in config.json"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "cmdUpstreamPreview function with conflict and binary detection"
      exports: ["cmdUpstreamPreview", "getConflictPreview", "detectBinaryChanges", "scoreConflictRisk"]
  key_links:
    - from: "cmdUpstreamPreview"
      to: "git merge-tree --write-tree"
      via: "execGit"
      pattern: "execGit.*merge-tree.*--write-tree"
    - from: "detectBinaryChanges"
      to: "git diff --numstat"
      via: "execGit"
      pattern: "execGit.*diff.*--numstat"
    - from: "config.json"
      to: "upstream.analysis"
      via: "saveUpstreamConfig"
      pattern: "upstream\\.analysis"
---

<objective>
Add conflict preview and binary detection functions to upstream.cjs for /gsd:sync-preview

Purpose: Enable fork maintainers to see exactly what would conflict and assess merge difficulty before attempting the actual merge operation. This prevents surprises and allows preparation.

Output: cmdUpstreamPreview function that shows conflict regions with risk scoring and binary file detection with categorization.
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
  <name>Task 1: Add conflict preview functions with git merge-tree</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add conflict preview helper functions:

1. Add `checkGitVersion(cwd)` function:
   - Run `git --version` and parse major.minor
   - Return `{ major, minor, supportsWriteTree: major > 2 || (major === 2 && minor >= 38) }`
   - Per RESEARCH: merge-tree --write-tree requires Git 2.38+

2. Add `getConflictPreview(cwd)` function:
   - Check Git version first; if <2.38, return `{ conflicts: [], error: 'git_version', message: 'Git 2.38+ required for conflict preview' }`
   - Run: `git merge-tree --write-tree HEAD upstream/main`
   - Exit 0 = no conflicts, return `{ conflicts: [], clean: true, tree_oid: <first_line> }`
   - Parse conflict output when conflicts exist
   - For each conflicted file, extract conflict regions using `git merge-tree` detailed output

3. Add `getDetailedConflicts(cwd, files)` function:
   - For each conflicted file, get full conflict markers
   - Parse `<<<<<<<`, `=======`, `>>>>>>>` markers
   - Return array of `{ file, regions: [{ start_line, end_line, ours, theirs }] }`

4. Add `scoreConflictRisk(conflict)` helper per RESEARCH pattern:
   - File type weights: md=0.5, json=0.7, cjs/js=1.0, ts=1.2
   - Score factors: region count * 0.5, size (small <10 lines: 0, medium <50: +1, large: +2)
   - GSD-specific: STATE.md +2, lib/ +0.5
   - Map score: <2 = easy, <5 = moderate, else hard

5. Add `calculateOverallRisk(conflicts)`:
   - If any hard: HARD
   - If any moderate: MODERATE
   - Else: EASY
   - Return null if no conflicts
  </action>
  <verify>
Test git version check:
```bash
node -e "const m = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(JSON.stringify(m.checkGitVersion('.')))"
```
Should show version with supportsWriteTree boolean.
  </verify>
  <done>Conflict preview functions exist with Git version check and risk scoring</done>
</task>

<task type="auto">
  <name>Task 2: Add binary file detection and categorization</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add binary detection functions per RESEARCH patterns:

1. Add `BINARY_CATEGORIES` constant at top of file:
   ```javascript
   const BINARY_CATEGORIES = {
     safe: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
            '.woff', '.woff2', '.ttf', '.eot', '.pdf'],
     review: ['.json.gz', '.zip', '.tar', '.gz', '.bz2', '.7z'],
     dangerous: ['.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd'],
   };
   ```

2. Add `detectBinaryChanges(cwd)` function:
   - Run: `git diff --numstat HEAD..upstream/main`
   - Binary files show `-\t-\tpath` format
   - For each binary, categorize by extension:
     - Match against BINARY_CATEGORIES.safe/review/dangerous
     - Default to review if unknown
   - Return `{ safe: string[], review: string[], dangerous: string[], total: number }`

3. Add `formatBinaryChanges(binaries)` function:
   - Format per CONTEXT.md example:
   ```
   [package emoji] Binary Changes (3 files)

   Safe (2):
     assets/logo.png
     fonts/Inter.woff2

   [warning emoji] Review recommended (1):
     data/fixtures.json.gz
   ```
   - Use Unicode escapes: `\uD83D\uDCE6` for package, `\u26A0\uFE0F` for warning

4. Export detectBinaryChanges function
  </action>
  <verify>
Test binary detection (may return empty if no binaries):
```bash
node -e "const m = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(JSON.stringify(m.detectBinaryChanges('.'), null, 2))"
```
Should return object with safe/review/dangerous arrays.
  </verify>
  <done>Binary detection returns categorized file lists with safe/review/dangerous classification</done>
</task>

<task type="auto">
  <name>Task 3: Add cmdUpstreamPreview command with analysis state</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add `cmdUpstreamPreview(cwd, options, output, error, raw)` command:

1. Check upstream configuration (same pattern as other commands)
2. Call getConflictPreview to get conflict data
3. Call detectBinaryChanges for binary file info
4. Get current upstream SHA for state tracking

5. Save analysis state to config.json under `upstream.analysis`:
   ```javascript
   upstreamConfig.analysis = {
     analyzed_at: new Date().toISOString(),
     analyzed_sha: currentUpstreamSha,
     conflict_count: conflicts.length,
     binary_acknowledged: false,
     binary_files: [...binaries.safe, ...binaries.review, ...binaries.dangerous],
   };
   saveUpstreamConfig(cwd, upstreamConfig);
   ```

6. Format human-readable output per CONTEXT.md:
   ```
   [magnifier emoji] Conflict Preview (Merge Risk: MODERATE)

   lib/upstream.cjs - 2 conflict regions
   <<<<<<< HEAD (fork)
     const TIMEOUT = 5000;
   =======
     const TIMEOUT = 10000;
   >>>>>>> upstream

   [lightbulb emoji] Suggestion: [context-aware suggestion based on conflict]

   [Binary section if any binary changes]
   ```

7. Handle special cases:
   - No conflicts + no binaries: "Merge is clean - no conflicts expected"
   - Only binaries: Show binary section with acknowledgment prompt
   - Git version too old: Warn and suggest upgrade

8. JSON output (raw mode) includes all structured data:
   ```json
   {
     "risk": "MODERATE",
     "conflicts": [...],
     "binaries": { "safe": [], "review": [], "dangerous": [] },
     "analyzed_sha": "abc123",
     "requires_acknowledgment": true
   }
   ```

9. Export cmdUpstreamPreview in module.exports
  </action>
  <verify>
Verify function exists and analysis state schema:
```bash
node -e "
const m = require('./get-shit-done/bin/lib/upstream.cjs');
console.log('cmdUpstreamPreview exists:', typeof m.cmdUpstreamPreview === 'function');
console.log('checkGitVersion exists:', typeof m.checkGitVersion === 'function');
console.log('detectBinaryChanges exists:', typeof m.detectBinaryChanges === 'function');
"
```
All should output true.
  </verify>
  <done>cmdUpstreamPreview shows conflicts with risk scoring, binary changes, and persists analysis state to config.json</done>
</task>

</tasks>

<verification>
1. All new functions exported from upstream.cjs
2. Git version check works: `checkGitVersion` returns correct version info
3. Conflict preview handles both Git 2.38+ and fallback cases
4. Binary detection categorizes files correctly
5. Analysis state saved to config.json under upstream.analysis
6. No syntax errors: `node -c get-shit-done/bin/lib/upstream.cjs`
</verification>

<success_criteria>
- getConflictPreview returns conflict regions with file paths
- scoreConflictRisk assigns easy/moderate/hard ratings
- detectBinaryChanges categorizes binaries as safe/review/dangerous
- cmdUpstreamPreview outputs per CONTEXT.md format
- Analysis state persisted to config.json for downstream commands
- Git version requirement (2.38+) documented with graceful fallback
</success_criteria>

<output>
After completion, create `.planning/phases/06-analysis/6-02-SUMMARY.md`
</output>
