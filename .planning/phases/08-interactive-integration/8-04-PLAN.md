---
phase: 08-interactive-integration
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - get-shit-done/bin/lib/health.cjs
autonomous: true
requirements:
  - INTEG-01
  - INTEG-02

must_haves:
  truths:
    - "User receives hard block when syncing with active (in_progress) worktrees"
    - "Block shows worktree names and which might be affected by upstream changes"
    - "User can override block with --force flag"
    - "Health check detects stalled/incomplete sync operations"
    - "After merge, system reports which worktrees need attention"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Worktree sync guard and post-merge conflict detection"
      exports: ["checkWorktreesBeforeSync", "analyzeWorktreeDivergence", "detectWorktreeConflictsPostMerge"]
      min_lines: 2600
    - path: "get-shit-done/bin/lib/health.cjs"
      provides: "Sync health checks"
      exports: ["checkSyncHealth"]
      min_lines: 780
  key_links:
    - from: "get-shit-done/bin/lib/upstream.cjs"
      to: ".planning/worktrees/registry.json"
      via: "loadRegistry for worktree status"
      pattern: "registry"
    - from: "get-shit-done/bin/lib/health.cjs"
      to: ".planning/config.json"
      via: "loadUpstreamConfig for analysis state"
      pattern: "upstream.*analysis"
---

<objective>
Integrate upstream sync with worktree management and health checks.

Purpose: Prevent sync operations from disrupting active worktrees by blocking sync when in-progress plans exist. Extend health checks to detect sync-related issues (stale analysis, orphaned state, incomplete merges). After merge, detect which worktrees might have conflicts with the new main.

Output: checkWorktreesBeforeSync() guard in upstream.cjs, checkSyncHealth() in health.cjs, post-merge worktree conflict detection.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-interactive-integration/8-CONTEXT.md
@.planning/phases/08-interactive-integration/08-RESEARCH.md
@get-shit-done/bin/lib/upstream.cjs
@get-shit-done/bin/lib/health.cjs
@get-shit-done/bin/lib/worktree.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add worktree sync guards to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add worktree integration to upstream.cjs:

1. **Import worktree registry:**
   Add: `const { loadRegistry } = require('./worktree.cjs');`

2. **checkWorktreesBeforeSync(cwd, options):**
   - Load worktree registry
   - Find worktrees with status='active' and plans in 'in_progress' state
   - If none found, return: `{ blocked: false }`
   - If active worktrees exist:
     - Get impact analysis: which worktrees touch files changed by upstream
     - Return: `{ blocked: true, worktrees: [...], impact: {...}, force_available: true }`
   - If options.force=true, return: `{ blocked: false, forced: true, warning: '...' }`

3. **analyzeWorktreeDivergence(cwd, registry):**
   Per RESEARCH pattern:
   - For each active worktree:
     - Find merge-base: `git merge-base main {worktree.branch}`
     - Count commits behind main: `git rev-list --count {branch}..main`
     - Count commits ahead: `git rev-list --count main..{branch}`
     - Preview conflicts: `git merge-tree --write-tree {branch} upstream/main`
   - Return analysis array with: key, branch, path, merge_base, commits_behind, commits_ahead, divergence_severity, would_conflict_with_upstream, recommendation

4. **calculateDivergenceSeverity(behind, ahead):**
   - total = behind + ahead
   - none: total === 0
   - low: total <= 5
   - medium: total <= 20
   - high: total > 20

5. **detectWorktreeConflictsPostMerge(cwd):**
   - Load registry
   - For each active worktree, run merge-tree against new main
   - Return list of worktrees that would have conflicts
   - Include recommendation for each (rebase, merge, etc.)

6. **Integrate into sync commands:**
   - At start of cmdUpstreamMerge (placeholder for Phase 7), call checkWorktreesBeforeSync()
   - If blocked and not forced, return error with impact analysis
   - After merge completes, call detectWorktreeConflictsPostMerge() and show results

Per CONTEXT.md locked decisions:
- "Active" definition: in_progress plans (check registry.json)
- Warning severity: Hard block (refuse until --force)
- Warning content: Impact analysis (worktree names + affected explanation)
- Post-merge guidance: Auto-detect conflicts
  </action>
  <verify>
Run: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof u.checkWorktreesBeforeSync)"` should output 'function'.
Run: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof u.analyzeWorktreeDivergence)"` should output 'function'.
  </verify>
  <done>
checkWorktreesBeforeSync() blocks sync with active worktrees unless --force.
analyzeWorktreeDivergence() calculates worktree divergence with severity levels.
detectWorktreeConflictsPostMerge() identifies worktrees needing attention after merge.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add sync health checks to health.cjs</name>
  <files>get-shit-done/bin/lib/health.cjs</files>
  <action>
Extend health.cjs with sync-related checks:

1. **Import upstream config loader:**
   Add: `const { loadUpstreamConfig, CONFIG_PATH } = require('./upstream.cjs');`

2. **checkSyncHealth(cwd):**
   Returns array of sync-related issues:

   **Stale analysis state (>24 hours):**
   - Check config.upstream.analysis.analyzed_at
   - If older than 24 hours, create issue:
     ```javascript
     {
       type: 'stale_analysis',
       message: 'Sync analysis state is stale (>24 hours old)',
       suggested_action: 'Run sync status to refresh or clear with sync clear-state',
       repairable: true,
     }
     ```

   **Analysis outdated (SHA mismatch):**
   - Compare config.upstream.analysis.analyzed_sha vs current upstream/main
   - If different, analysis is for old upstream state

   **Incomplete merge:**
   - Check for .git/MERGE_HEAD existence
   - Already implemented in cmdHealthCheck, but add to sync-specific check

   **Orphaned suggestions:**
   - Check if suggestions exist but no conflicts (already resolved)

3. **Integrate into cmdHealthCheck:**
   - Call checkSyncHealth() alongside existing checks
   - Add sync issues to output

4. **Export checkSyncHealth:**
   Add to module.exports

Per CONTEXT.md: Health check reports incomplete/stalled sync operations.
Per RESEARCH: Clear analysis state in clearAnalysisState(); add health check for orphaned state.
  </action>
  <verify>
Run: `node -e "const h = require('./get-shit-done/bin/lib/health.cjs'); console.log(typeof h.checkSyncHealth)"` should output 'function'.
  </verify>
  <done>
checkSyncHealth() detects: stale analysis, outdated analysis, incomplete merge, orphaned suggestions.
Issues integrated into cmdHealthCheck output.
Each issue has type, message, suggested_action, repairable flag.
  </done>
</task>

</tasks>

<verification>
1. checkWorktreesBeforeSync() blocks sync with active worktrees
2. --force flag overrides the block with warning
3. analyzeWorktreeDivergence() calculates divergence severity
4. detectWorktreeConflictsPostMerge() identifies affected worktrees
5. checkSyncHealth() detects sync-related issues
6. Health check output includes sync health issues
</verification>

<success_criteria>
- checkWorktreesBeforeSync() returns blocked=true for in_progress worktrees
- Block message shows worktree names and impact analysis
- --force bypasses block with warning
- analyzeWorktreeDivergence() calculates: commits_behind, commits_ahead, severity, would_conflict
- detectWorktreeConflictsPostMerge() shows which worktrees need attention
- checkSyncHealth() detects: stale_analysis, analysis_outdated, merge_in_progress
- Health issues integrated into cmdHealthCheck
</success_criteria>

<output>
After completion, create `.planning/phases/08-interactive-integration/8-04-SUMMARY.md`
</output>
