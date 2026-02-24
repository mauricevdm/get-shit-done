---
phase: 06-analysis
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements: [ANAL-03]

must_haves:
  truths:
    - "User receives warning about rename conflicts with similarity percentage"
    - "User receives warning about delete conflicts when fork has modifications"
    - "Structural conflicts block merge until acknowledged"
    - "User can acknowledge conflicts individually or batch"
    - "Acknowledgment state persists in config.json"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "cmdUpstreamResolve function with rename/delete detection"
      exports: ["cmdUpstreamResolve", "detectStructuralConflicts", "acknowledgeConflict"]
  key_links:
    - from: "detectStructuralConflicts"
      to: "git diff -M90 --diff-filter=R"
      via: "execGit"
      pattern: "execGit.*diff.*-M90.*--diff-filter"
    - from: "acknowledgeConflict"
      to: "config.json upstream.analysis.structural_conflicts"
      via: "saveUpstreamConfig"
      pattern: "structural_conflicts.*acknowledged"
---

<objective>
Add rename/delete conflict detection and resolution workflow to upstream.cjs for /gsd:sync-resolve

Purpose: Detect when upstream renames or deletes files that the fork has modified, and provide a resolution workflow that requires explicit acknowledgment before merge can proceed. This prevents silent data loss.

Output: cmdUpstreamResolve function that detects structural conflicts, tracks acknowledgment state, and blocks merge until all conflicts are addressed.
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
  <name>Task 1: Add structural conflict detection functions</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add rename and delete detection helpers per RESEARCH patterns:

1. Add `detectRenames(cwd)` function:
   - Run: `git diff -M90 --diff-filter=R --name-status HEAD..upstream/main`
   - Parse output format: `R090\told-path\tnew-path` (tab-separated)
   - Extract similarity percentage from R prefix (e.g., R092 = 92%)
   - Return array: `[{ type: 'rename', similarity: 92, from: 'old.cjs', to: 'new.cjs' }]`

2. Add `detectDeleteConflicts(cwd)` function:
   - Run: `git diff --diff-filter=D --name-only HEAD..upstream/main`
   - For each deleted file, check if fork modified it:
     - Run: `git diff --name-only upstream/main..HEAD -- <file>`
     - If output non-empty, fork has modifications
   - Return array: `[{ type: 'delete', file: 'old.cjs', fork_modified: true }]`
   - Only include files where fork_modified=true (these are the conflicts)

3. Add `detectStructuralConflicts(cwd)` function:
   - Combine detectRenames and detectDeleteConflicts
   - For renames, check if fork modified the source file (same check as deletes)
   - Return `{ renames: [...], deletes: [...], total: number, has_conflicts: boolean }`

4. Add `getForkModifications(cwd, file)` helper:
   - Get diff summary of fork's changes to the file
   - Run: `git diff --stat upstream/main..HEAD -- <file>`
   - Parse for line counts: `+15 -3 lines`
   - Return `{ added_lines: number, removed_lines: number }`

5. Export detectStructuralConflicts
  </action>
  <verify>
Test structural conflict detection:
```bash
node -e "
const m = require('./get-shit-done/bin/lib/upstream.cjs');
console.log('detectStructuralConflicts:', typeof m.detectStructuralConflicts === 'function');
const result = m.detectStructuralConflicts('.');
console.log('Result structure:', Object.keys(result));
"
```
Should show function exists and return object with renames/deletes/total/has_conflicts.
  </verify>
  <done>Structural conflict detection returns renames with similarity% and delete conflicts where fork has modifications</done>
</task>

<task type="auto">
  <name>Task 2: Add acknowledgment tracking functions</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add acknowledgment state management:

1. Add `loadAnalysisState(cwd)` function:
   - Load config.json and return `upstream.analysis` section
   - Return default if not exists: `{ structural_conflicts: [], binary_acknowledged: false }`

2. Add `acknowledgeConflict(cwd, conflictId, ackAll)` function:
   - If ackAll=true: Mark all structural conflicts as acknowledged
   - Else: Find conflict by id and mark as acknowledged
   - Update `upstream.analysis.structural_conflicts[i].acknowledged = true`
   - Add `acknowledged_at: new Date().toISOString()`
   - Save to config.json

3. Add `saveAnalysisState(cwd, analysisState)` function:
   - Update `upstream.analysis` section in config.json
   - Preserve other config sections

4. Add `checkAllAcknowledged(cwd)` function:
   - Load analysis state
   - Check all structural_conflicts have acknowledged=true
   - Check binary_acknowledged=true if binary_files.length > 0
   - Return `{ ready_to_merge: boolean, pending: string[] }`

5. Add `clearAnalysisState(cwd)` function:
   - Remove `upstream.analysis` section (for after merge completes)
   - Called by Phase 7 merge command

6. Export acknowledgeConflict and checkAllAcknowledged
  </action>
  <verify>
Test acknowledgment state functions:
```bash
node -e "
const m = require('./get-shit-done/bin/lib/upstream.cjs');
console.log('acknowledgeConflict:', typeof m.acknowledgeConflict === 'function');
console.log('checkAllAcknowledged:', typeof m.checkAllAcknowledged === 'function');
"
```
Both should exist.
  </verify>
  <done>Acknowledgment tracking functions manage structural conflict state in config.json</done>
</task>

<task type="auto">
  <name>Task 3: Add cmdUpstreamResolve command</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add `cmdUpstreamResolve(cwd, options, output, error, raw)` command:

1. Check upstream configuration
2. Detect structural conflicts using detectStructuralConflicts
3. Load existing analysis state to check prior acknowledgments

4. Handle action modes via options:
   - `options.list`: Show all conflicts with status (default if no option)
   - `options.acknowledge`: Mark specific conflict acknowledged (by index)
   - `options.acknowledge_all`: Mark all conflicts acknowledged
   - `options.status`: Show readiness for merge

5. Format human-readable output per CONTEXT.md:
   ```
   [warning emoji] STRUCTURAL CONFLICTS - Must resolve before merge

   1. POSSIBLE RENAME (92% similar)
      lib/helpers.cjs -> lib/utils/helpers.cjs
      Your changes: +15 lines (validation logic)
      Status: [pending|acknowledged]

   2. DELETE CONFLICT
      Upstream deleted: lib/legacy-sync.cjs
      Your version has modifications:

      + // Custom timeout handling
      + function handleTimeout() { ... }

      Action required: Acknowledge loss or extract changes first

   Run /gsd:sync-resolve --ack 1 to acknowledge conflict 1
   Run /gsd:sync-resolve --ack-all to acknowledge all
   ```

6. When acknowledging:
   - Call acknowledgeConflict with conflict index or ackAll
   - Output confirmation: "Conflict 1 acknowledged"
   - Show remaining count if any

7. JSON output (raw mode):
   ```json
   {
     "conflicts": [
       { "id": 1, "type": "rename", "from": "...", "to": "...", "similarity": 92, "acknowledged": false },
       { "id": 2, "type": "delete", "file": "...", "acknowledged": true }
     ],
     "ready_to_merge": false,
     "pending_count": 1
   }
   ```

8. Handle zero-state: "No structural conflicts detected"

9. Export cmdUpstreamResolve in module.exports
  </action>
  <verify>
Verify function exists:
```bash
node -e "
const m = require('./get-shit-done/bin/lib/upstream.cjs');
console.log('cmdUpstreamResolve exists:', typeof m.cmdUpstreamResolve === 'function');
"
```
Should output true.
  </verify>
  <done>cmdUpstreamResolve detects structural conflicts, tracks acknowledgments, and blocks merge until all resolved</done>
</task>

</tasks>

<verification>
1. All new functions exported from upstream.cjs
2. Rename detection uses -M90 threshold per RESEARCH
3. Delete conflict detection checks fork modifications
4. Acknowledgment state persists in config.json
5. checkAllAcknowledged correctly reports merge readiness
6. No syntax errors: `node -c get-shit-done/bin/lib/upstream.cjs`
</verification>

<success_criteria>
- detectStructuralConflicts identifies renames with similarity% and delete conflicts
- Only files modified by fork trigger conflict warnings
- acknowledgeConflict persists state to config.json
- cmdUpstreamResolve supports list/acknowledge/status modes
- Output matches CONTEXT.md format with actionable instructions
- Merge blocked until all conflicts acknowledged (enforced via checkAllAcknowledged)
</success_criteria>

<output>
After completion, create `.planning/phases/06-analysis/6-03-SUMMARY.md`
</output>
