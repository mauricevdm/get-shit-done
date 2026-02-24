---
phase: 07-merge-operations
plan: 03
type: execute
wave: 2
depends_on:
  - 7-01
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - MERGE-03

must_haves:
  truths:
    - "User can abort an incomplete sync and restore to clean state"
    - "In-progress merge is detected and aborted cleanly"
    - "User is shown available backup branches for restoration"
    - "Abort event is logged to STATE.md"
    - "Clear guidance provided for manual restoration if needed"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Abort command with restore guidance"
      exports: ["cmdUpstreamAbort", "detectMergeInProgress"]
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "abort subcommand routing"
      contains: "upstream abort"
  key_links:
    - from: "cmdUpstreamAbort"
      to: "git merge --abort"
      via: "in-progress merge cleanup"
      pattern: "merge.*--abort"
    - from: "cmdUpstreamAbort"
      to: "listBackupBranches"
      via: "restore option discovery"
      pattern: "listBackupBranches"
    - from: "cmdUpstreamAbort"
      to: "appendSyncHistoryEntry"
      via: "abort event logging"
      pattern: "SYNC_EVENTS\\.ABORT"
---

<objective>
Add abort command for canceling incomplete sync operations and restoring previous state.

Purpose: Provide a safe way to cancel merges that are in progress (conflicts) or undo recent merges by restoring from backup branches. This completes the safety net for merge operations.

Output: cmdUpstreamAbort function that handles both in-progress merges and backup restoration, integrated into gsd-tools CLI.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-merge-operations/7-CONTEXT.md
@.planning/phases/07-merge-operations/7-RESEARCH.md
@.planning/phases/07-merge-operations/7-01-SUMMARY.md
@get-shit-done/bin/lib/upstream.cjs
@get-shit-done/bin/lib/health.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add abort command to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add abort functionality to upstream.cjs:

1. **Add detectMergeInProgress(cwd) function:**
```javascript
function detectMergeInProgress(cwd) {
  const gitDir = getGitDir(cwd);
  if (!gitDir) {
    return { inProgress: false, reason: 'not_a_repo' };
  }

  const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
  if (fs.existsSync(mergeHeadPath)) {
    // Get the commit being merged
    const mergeHead = fs.readFileSync(mergeHeadPath, 'utf-8').trim();
    return {
      inProgress: true,
      merge_head: mergeHead.slice(0, 7),
      type: 'merge',
    };
  }

  return { inProgress: false };
}
```

2. **Add cmdUpstreamAbort(cwd, options, output, error, raw) function:**

```javascript
function cmdUpstreamAbort(cwd, options, output, error, raw) {
  const restore = options.restore; // Optional: specific backup branch to restore

  // Step 1: Check if merge is in progress
  const mergeState = detectMergeInProgress(cwd);

  if (mergeState.inProgress) {
    // Abort the in-progress merge
    const abortResult = execGit(cwd, ['merge', '--abort']);

    if (abortResult.success) {
      appendSyncHistoryEntry(cwd, SYNC_EVENTS.ABORT, 'Aborted in-progress merge');

      output({
        aborted: true,
        reason: 'merge_in_progress',
        message: 'Aborted in-progress merge. Working tree restored to pre-merge state.',
      }, raw);
      return;
    } else {
      error(`Failed to abort merge: ${abortResult.stderr}`);
      return;
    }
  }

  // Step 2: No merge in progress - check for backup branches
  const backupBranches = listBackupBranches(cwd);

  if (backupBranches.length === 0) {
    output({
      aborted: false,
      reason: 'nothing_to_abort',
      message: 'No sync in progress and no backup branches found.',
    }, raw);
    return;
  }

  // Step 3: If --restore specified, restore from that branch
  if (restore) {
    const targetBranch = backupBranches.find(b => b.name === restore || b.name.endsWith(restore));

    if (!targetBranch) {
      error(`Backup branch not found: ${restore}\nAvailable branches: ${backupBranches.map(b => b.name).join(', ')}`);
      return;
    }

    // Check working tree is clean before restore
    const workingTree = checkWorkingTreeClean(cwd);
    if (!workingTree.clean) {
      error('Working tree has uncommitted changes.\nCommit or stash changes before restore.');
      return;
    }

    // Perform restore
    const resetResult = execGit(cwd, ['reset', '--hard', targetBranch.name]);

    if (resetResult.success) {
      const newHead = execGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();
      appendSyncHistoryEntry(cwd, SYNC_EVENTS.ABORT,
        `Restored to ${targetBranch.name} (${newHead.slice(0,7)})`);

      output({
        aborted: true,
        restored: true,
        restored_from: targetBranch.name,
        restored_to: newHead.slice(0, 7),
        message: `Restored to backup branch: ${targetBranch.name}`,
      }, raw);
      return;
    } else {
      error(`Failed to restore from backup: ${resetResult.stderr}`);
      return;
    }
  }

  // Step 4: No --restore flag - show available backup branches
  const latestBackup = backupBranches[0];

  output({
    aborted: false,
    restore_available: true,
    backup_branches: backupBranches.slice(0, 5), // Show last 5
    latest_backup: latestBackup.name,
    suggestion: `To restore: gsd-tools upstream abort --restore ${latestBackup.name}`,
    message: `No sync in progress. ${backupBranches.length} backup branch(es) available.\nLatest: ${latestBackup.name}\nTo restore, run: gsd-tools upstream abort --restore ${latestBackup.name}`,
  }, raw);
}
```

Per CONTEXT.md:
- Clear prompts with state description
- Preserve user's uncommitted work (block restore if dirty)
- Show what will be restored on abort

3. **Export detectMergeInProgress and cmdUpstreamAbort** in module.exports.
  </action>
  <verify>
Test abort:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
// Test detect
console.log(u.detectMergeInProgress(process.cwd()));
// Test abort command
u.cmdUpstreamAbort(process.cwd(), {}, console.log, console.error, false);
```
  </verify>
  <done>
cmdUpstreamAbort handles both in-progress merges and backup restoration.
detectMergeInProgress checks for MERGE_HEAD file.
Events logged to STATE.md.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add abort subcommand to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add abort subcommand to gsd-tools.cjs upstream routing:

1. **Update help text** (in Upstream Sync Operations section):
```
 *   upstream abort [--restore branch]   Abort sync or restore from backup branch
```

2. **Add routing** (in the upstream command block, after merge):
```javascript
else if (subcommand === 'abort') {
  // Parse --restore option
  const restoreIdx = args.indexOf('--restore');
  const restore = restoreIdx !== -1 ? args[restoreIdx + 1] : null;

  upstreamModule.cmdUpstreamAbort(cwd, { restore }, output, errorExit, raw);
}
```

3. **Update unknown subcommand error:**
```javascript
else {
  errorExit(`Unknown upstream subcommand: ${subcommand}. Use: configure, fetch, status, log, notification, merge, abort`);
}
```

Usage examples:
- `gsd-tools upstream abort` - Abort in-progress merge or show backup options
- `gsd-tools upstream abort --restore backup/pre-sync-2026-02-24-143000` - Restore from specific backup
- `gsd-tools upstream abort --raw` - JSON output for scripting
  </action>
  <verify>
Test commands:
```bash
# Show abort options
node get-shit-done/bin/gsd-tools.cjs upstream abort --raw

# (Don't actually restore in test - would reset HEAD)
node get-shit-done/bin/gsd-tools.cjs upstream abort --help
```
  </verify>
  <done>
`gsd-tools upstream abort` routes to cmdUpstreamAbort.
`--restore` option supported for explicit backup restoration.
Help text updated with all subcommands.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add human-readable output formatting for abort</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Ensure abort command has clear human-readable output (when raw=false):

Update cmdUpstreamAbort to format output nicely when not in raw mode:

1. **For in-progress merge abort:**
```
Aborted in-progress merge.
Working tree restored to pre-merge state.
```

2. **For backup restoration:**
```
Restored to backup branch: backup/pre-sync-2026-02-24-143000
Current HEAD: abc123d
```

3. **For no action needed:**
```
No sync in progress.

Available backup branches (most recent first):
  1. backup/pre-sync-2026-02-24-143000 (Feb 24, 14:30)
  2. backup/pre-sync-2026-02-24-100000 (Feb 24, 10:00)

To restore from a backup:
  gsd-tools upstream abort --restore backup/pre-sync-2026-02-24-143000
```

4. **For nothing to abort:**
```
No sync in progress and no backup branches found.
Nothing to abort.
```

Follow the output pattern used in other upstream commands where raw mode returns JSON and non-raw mode returns formatted text.
  </action>
  <verify>
Test human output:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream abort
```
Should show nicely formatted text with instructions.
  </verify>
  <done>
Human-readable output clearly shows state and available actions.
Backup branches listed with dates.
Clear instructions for restoration.
  </done>
</task>

</tasks>

<verification>
1. `gsd-tools upstream abort` detects and aborts in-progress merge
2. `gsd-tools upstream abort --restore <branch>` restores from backup
3. Restore blocked if working tree has uncommitted changes
4. Abort event logged to STATE.md
5. Available backup branches shown when no merge in progress
6. Human-readable output provides clear guidance
</verification>

<success_criteria>
- cmdUpstreamAbort aborts in-progress merge via `git merge --abort`
- When no merge in progress, shows available backup branches
- `--restore` option restores from specified backup branch
- Restore blocked if working tree dirty (preserves user's work)
- abort event logged to STATE.md Sync History
- Clear messages: "Aborted in-progress merge" or "Restored to backup branch: ..."
- Human output lists backup branches with dates and restore command
</success_criteria>

<output>
After completion, create `.planning/phases/07-merge-operations/7-03-SUMMARY.md`
</output>
