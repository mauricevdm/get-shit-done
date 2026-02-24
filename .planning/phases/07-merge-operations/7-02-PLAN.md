---
phase: 07-merge-operations
plan: 02
type: execute
wave: 2
depends_on:
  - 7-01
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - MERGE-01
  - MERGE-02

must_haves:
  truths:
    - "User can merge upstream with automatic backup branch created before merge"
    - "Failed merge automatically rolls back to pre-merge state with clear message"
    - "Merge is blocked if working tree has uncommitted changes"
    - "Merge events (start, complete, failed, rollback) are logged to STATE.md"
    - "User sees clear success or failure message with next steps"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Merge command with safety and rollback"
      exports: ["cmdUpstreamMerge", "rollbackMerge", "checkWorkingTreeClean"]
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "merge subcommand routing"
      contains: "upstream merge"
  key_links:
    - from: "cmdUpstreamMerge"
      to: "createBackupBranch"
      via: "pre-merge safety"
      pattern: "createBackupBranch"
    - from: "cmdUpstreamMerge"
      to: "rollbackMerge"
      via: "error handling"
      pattern: "rollbackMerge|git reset --hard"
    - from: "cmdUpstreamMerge"
      to: "appendSyncHistoryEntry"
      via: "event logging"
      pattern: "SYNC_EVENTS\\.(MERGE|BACKUP|ROLLBACK)"
---

<objective>
Add merge command with pre-merge safety checkpoint and atomic rollback on failure.

Purpose: Enable users to safely merge upstream changes with automatic backup creation before merge. Any failure triggers immediate rollback to pre-merge state, ensuring the repository is never left in a broken state.

Output: cmdUpstreamMerge function with full safety net, integrated into gsd-tools CLI.
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
  <name>Task 1: Add pre-merge validation and merge command to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add the merge command with pre-merge safety to upstream.cjs:

1. **Add checkWorkingTreeClean(cwd) function:**
   - Run: `git status --porcelain`
   - Return `{ clean: true }` if empty output
   - Return `{ clean: false, changes: [...] }` if has changes
   - Also check staged: `git diff --cached --quiet` (exit 0 = no staged)

2. **Add rollbackMerge(cwd, preMergeHead, backupBranch) function:**
   - Abort any in-progress merge: `git merge --abort` (ignore errors)
   - Reset to pre-merge state: `git reset --hard ${preMergeHead}`
   - Log rollback: `appendSyncHistoryEntry(cwd, SYNC_EVENTS.ROLLBACK_EXECUTED, \`Restored to ${preMergeHead.slice(0,7)} after merge failure\`)`
   - Return: `{ success: true, restored_to: preMergeHead }`

3. **Add cmdUpstreamMerge(cwd, options, output, error, raw) function:**

Pre-merge validation sequence:
```javascript
// Step 1: Check upstream is configured
const config = loadUpstreamConfig(cwd);
if (!config.upstream?.url) {
  error('Upstream not configured. Run: gsd-tools upstream configure');
  return;
}

// Step 2: Check working tree is clean
const workingTree = checkWorkingTreeClean(cwd);
if (!workingTree.clean) {
  error('Working tree has uncommitted changes.\nCommit or stash your changes before merging:\n  git stash         # to stash temporarily\n  git commit -am "WIP"  # to commit');
  return;
}

// Step 3: Check merge not already in progress
const gitDir = getGitDir(cwd); // Helper to find .git dir (handle worktrees)
const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
if (fs.existsSync(mergeHeadPath)) {
  error('A merge is already in progress.\nTo abort: gsd-tools upstream abort\nTo continue: resolve conflicts and run git merge --continue');
  return;
}

// Step 4: Verify we have commits to merge
const countResult = execGit(cwd, ['rev-list', '--count', 'HEAD..upstream/main']);
const commitCount = parseInt(countResult.stdout.trim(), 10);
if (commitCount === 0) {
  output({ merged: false, reason: 'up_to_date', message: 'Already up to date with upstream' }, raw);
  return;
}
```

Merge execution with safety:
```javascript
// Step 5: Capture pre-merge HEAD
const headResult = execGit(cwd, ['rev-parse', 'HEAD']);
const preMergeHead = headResult.stdout.trim();

// Step 6: Create backup branch
const backup = createBackupBranch(cwd);
if (!backup.success) {
  error(`Failed to create backup branch: ${backup.error}`);
  return;
}

// Step 7: Log merge start
appendSyncHistoryEntry(cwd, SYNC_EVENTS.MERGE_START, `Merging ${commitCount} commits from upstream/main`);

// Step 8: Attempt merge
try {
  const mergeResult = execGit(cwd, [
    'merge', 'upstream/main', '--no-ff',
    '-m', `sync: merge ${commitCount} upstream commits`
  ]);

  if (!mergeResult.success) {
    // Check if it's a conflict
    if (mergeResult.stderr.includes('Automatic merge failed') ||
        mergeResult.stderr.includes('CONFLICT')) {
      appendSyncHistoryEntry(cwd, SYNC_EVENTS.CONFLICT_DETECTED,
        `Conflicts in merge from upstream/main`);
    }

    // Rollback
    rollbackMerge(cwd, preMergeHead, backup.branch);
    appendSyncHistoryEntry(cwd, SYNC_EVENTS.MERGE_FAILED,
      `Merge failed: ${mergeResult.stderr.split('\n')[0]}`);

    error(`Merge failed due to conflicts.\nRolled back to pre-merge state (${preMergeHead.slice(0,7)}).\nBackup branch preserved: ${backup.branch}\nTo view conflicts that would occur: gsd-tools upstream conflicts`);
    return;
  }

  // Step 9: Log success
  const newHead = execGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();
  appendSyncHistoryEntry(cwd, SYNC_EVENTS.MERGE_COMPLETE,
    `${preMergeHead.slice(0,7)}..${newHead.slice(0,7)} (${commitCount} commits)`);

  output({
    merged: true,
    commits: commitCount,
    from: preMergeHead.slice(0,7),
    to: newHead.slice(0,7),
    backup_branch: backup.branch,
    message: `Merged ${commitCount} commits from upstream/main.\nBackup branch: ${backup.branch}`
  }, raw);

} catch (err) {
  // Unexpected error - rollback
  rollbackMerge(cwd, preMergeHead, backup.branch);
  appendSyncHistoryEntry(cwd, SYNC_EVENTS.MERGE_FAILED, `Error: ${err.message}`);
  error(`Merge failed unexpectedly: ${err.message}\nRolled back to ${preMergeHead.slice(0,7)}`);
}
```

Per CONTEXT.md and RESEARCH.md:
- Block merge if working tree dirty
- Create backup branch before merge
- Log merge-start, then merge-complete or merge-failed
- Rollback on any error (conservative)
- Clear error messages with recovery hints
  </action>
  <verify>
Test validation:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
// Should work if clean, should error if dirty
u.cmdUpstreamMerge(process.cwd(), {}, console.log, console.error, false);
```
  </verify>
  <done>
cmdUpstreamMerge validates working tree, creates backup, attempts merge, logs all events.
On failure: automatic rollback with preserved backup branch.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add merge subcommand to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add merge subcommand to gsd-tools.cjs upstream routing:

1. **Update help text** (in Upstream Sync Operations section):
```
 *   upstream merge                       Merge upstream changes (creates backup branch)
```

2. **Add routing** (in the upstream command block, after existing subcommands):
```javascript
else if (subcommand === 'merge') {
  upstreamModule.cmdUpstreamMerge(cwd, {}, output, errorExit, raw);
}
```

3. **Update unknown subcommand error:**
```javascript
else {
  errorExit(`Unknown upstream subcommand: ${subcommand}. Use: configure, fetch, status, log, notification, merge`);
}
```

Usage:
- `gsd-tools upstream merge` - Merge upstream with backup
- `gsd-tools upstream merge --raw` - JSON output for scripting
  </action>
  <verify>
Test command:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream merge --raw
```
Should return JSON with merged/backup_branch or error message.
  </verify>
  <done>
`gsd-tools upstream merge` routes to cmdUpstreamMerge.
Help text updated.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add getGitDir helper for worktree support</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add helper to find actual .git directory (handles worktrees where .git is a file):

**Add getGitDir(cwd) function:**
```javascript
function getGitDir(cwd) {
  const gitPath = path.join(cwd, '.git');

  if (!fs.existsSync(gitPath)) {
    return null;
  }

  const stat = fs.statSync(gitPath);

  if (stat.isDirectory()) {
    // Regular repo - .git is a directory
    return gitPath;
  }

  if (stat.isFile()) {
    // Worktree - .git is a file pointing to main repo
    const content = fs.readFileSync(gitPath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      return path.resolve(cwd, match[1]);
    }
  }

  return null;
}
```

This mirrors the pattern in health.cjs (lines 298-310) for detecting MERGE_HEAD in worktrees.

Export the function for potential reuse.
  </action>
  <verify>
Test in both main repo and worktree:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
console.log(u.getGitDir(process.cwd()));
```
Should return path to .git directory or worktree git dir.
  </verify>
  <done>
getGitDir helper finds actual git directory, handling both regular repos and worktrees.
  </done>
</task>

</tasks>

<verification>
1. `gsd-tools upstream merge` blocks if working tree dirty
2. Backup branch created before merge attempt
3. Merge failure triggers automatic rollback
4. All merge events logged to STATE.md Sync History
5. Success shows commit count, SHA range, backup branch name
6. Error messages include recovery hints
</verification>

<success_criteria>
- cmdUpstreamMerge validates: upstream configured, working tree clean, no merge in progress
- Backup branch `backup/pre-sync-YYYY-MM-DD-HHMMSS` created before merge
- merge-start event logged when merge begins
- merge-complete event logged on success with commit range
- merge-failed event logged on failure with brief reason
- rollback-executed event logged when rollback occurs
- User sees clear message: "Merged N commits" or "Rolled back to..."
- Backup branch preserved after both success and failure
</success_criteria>

<output>
After completion, create `.planning/phases/07-merge-operations/7-02-SUMMARY.md`
</output>
