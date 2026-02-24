---
phase: 07-merge-operations
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements:
  - MERGE-04

must_haves:
  truths:
    - "Sync events are logged to STATE.md with timestamps"
    - "Sync History section is created if it doesn't exist"
    - "Log entries include Date, Event type, and Details"
    - "Backup branches can be created with timestamped names"
    - "Backup branches can be listed in chronological order"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Sync history logging and backup branch helpers"
      exports: ["appendSyncHistoryEntry", "createBackupBranch", "listBackupBranches", "SYNC_EVENTS"]
      min_lines: 100
  key_links:
    - from: "appendSyncHistoryEntry"
      to: ".planning/STATE.md"
      via: "fs read/write with section detection"
      pattern: "Sync History|STATE\\.md"
    - from: "createBackupBranch"
      to: "git branch"
      via: "execGit helper"
      pattern: "git.*branch.*backup"
---

<objective>
Add STATE.md sync history logging and backup branch helper functions to upstream.cjs.

Purpose: Establish the foundational logging and backup infrastructure that merge operations will use. This creates the audit trail capability (MERGE-04) and prepares backup branch management for atomic merge operations.

Output: Helper functions for sync history logging and backup branch management in upstream.cjs.
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
@get-shit-done/bin/lib/upstream.cjs
@get-shit-done/bin/lib/health.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sync history logging functions to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add STATE.md sync history logging infrastructure to upstream.cjs:

1. **Add SYNC_EVENTS constant** (near top with other constants):
```javascript
const SYNC_EVENTS = {
  FETCH: 'fetch',
  MERGE_START: 'merge-start',
  MERGE_COMPLETE: 'merge-complete',
  MERGE_FAILED: 'merge-failed',
  ABORT: 'abort',
  UPSTREAM_CONFIGURED: 'upstream-configured',
  UPSTREAM_URL_CHANGED: 'upstream-url-changed',
  BACKUP_CREATED: 'backup-created',
  ROLLBACK_EXECUTED: 'rollback-executed',
  CONFLICT_DETECTED: 'conflict-detected',
};
```

2. **Add SYNC_HISTORY_HEADER constant:**
```javascript
const SYNC_HISTORY_HEADER = `### Sync History

| Date | Event | Details |
|------|-------|---------|`;
```

3. **Add appendSyncHistoryEntry(cwd, event, details) function:**
   - Read `.planning/STATE.md`
   - Format date as `YYYY-MM-DD HH:MM` (e.g., "2026-02-24 14:30")
   - Create entry: `| ${dateStr} | ${event} | ${details} |`
   - If "### Sync History" section exists:
     - Find the table header line ending with `|---------|`
     - Insert new entry immediately after the header (newest first)
   - If section doesn't exist:
     - Find last `---` separator in file
     - Insert new section before it with header + entry
     - If no separator, append to end
   - Write updated STATE.md

Per CONTEXT.md decisions:
- Location: New "Sync History" section in STATE.md (below Session Continuity)
- Detail level: Standard - commit hashes, branch names, brief error messages
- Retention: Keep all entries - never auto-delete

4. **Add getSyncHistory(cwd, options) function:**
   - Read `.planning/STATE.md`
   - Parse Sync History table if exists
   - Return array of entries: `[{ date, event, details }]`
   - Support `options.limit` to get last N entries
   - Return empty array if no history
  </action>
  <verify>
Test logging:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
u.appendSyncHistoryEntry(process.cwd(), 'fetch', '5 new commits from upstream');
// Check STATE.md has new Sync History section
```
  </verify>
  <done>
appendSyncHistoryEntry creates/updates Sync History section in STATE.md.
getSyncHistory parses existing history.
SYNC_EVENTS constant defines all event types.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add backup branch helper functions to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add backup branch management functions to upstream.cjs:

1. **Add BACKUP_BRANCH_PREFIX constant:**
```javascript
const BACKUP_BRANCH_PREFIX = 'backup/pre-sync-';
```

2. **Add createBackupBranch(cwd) function:**
   - Generate timestamp: `YYYY-MM-DD-HHMMSS` format (UTC)
   - Branch name: `backup/pre-sync-${timestamp}`
   - Run: `git branch "${branchName}"` (fail if exists - indicates incomplete previous sync)
   - Log to sync history: `appendSyncHistoryEntry(cwd, SYNC_EVENTS.BACKUP_CREATED, branchName)`
   - Return: `{ success: true, branch: branchName }` or `{ success: false, error: '...' }`

3. **Add listBackupBranches(cwd) function:**
   - Run: `git branch --list 'backup/pre-sync-*' --format='%(refname:short)'`
   - Parse branch names
   - Extract timestamp from each (for sorting)
   - Return sorted array (most recent first):
     ```javascript
     [
       { name: 'backup/pre-sync-2026-02-24-143200', date: '2026-02-24 14:32' },
       { name: 'backup/pre-sync-2026-02-24-100000', date: '2026-02-24 10:00' },
     ]
     ```

4. **Add getLatestBackupBranch(cwd) function:**
   - Call listBackupBranches(cwd)
   - Return first entry (most recent) or null

Per RESEARCH.md:
- Naming: `backup/pre-sync-YYYY-MM-DD-HHMMSS` (timestamp for uniqueness)
- No auto-cleanup - user prunes manually when confident
- Don't use --force on branch creation (fail if exists = incomplete sync)

5. **Export all new functions** in module.exports.
  </action>
  <verify>
Test backup creation:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
const result = u.createBackupBranch(process.cwd());
console.log(result); // { success: true, branch: 'backup/pre-sync-2026-...' }
const branches = u.listBackupBranches(process.cwd());
console.log(branches); // Array of backup branches
```
  </verify>
  <done>
createBackupBranch creates timestamped backup branch and logs to sync history.
listBackupBranches returns sorted list of backup branches.
getLatestBackupBranch returns most recent backup.
  </done>
</task>

</tasks>

<verification>
1. appendSyncHistoryEntry adds entry to STATE.md Sync History section
2. New section created automatically if doesn't exist
3. Entries appear newest-first in the table
4. createBackupBranch creates branch with timestamp name
5. listBackupBranches returns branches sorted by date descending
6. All functions exported from upstream.cjs
</verification>

<success_criteria>
- SYNC_EVENTS constant defines all 10 event types from CONTEXT.md
- appendSyncHistoryEntry writes to STATE.md in specified format
- Sync History section created below Session Continuity if missing
- createBackupBranch names branches as `backup/pre-sync-YYYY-MM-DD-HHMMSS`
- Backup creation logged to sync history automatically
- listBackupBranches returns chronologically sorted list
</success_criteria>

<output>
After completion, create `.planning/phases/07-merge-operations/7-01-SUMMARY.md`
</output>
