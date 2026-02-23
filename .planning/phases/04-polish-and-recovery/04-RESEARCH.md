# Phase 4: Polish and Recovery - Research

**Researched:** 2026-02-23
**Domain:** Git worktree health, orphan detection, incomplete operation recovery
**Confidence:** HIGH

## Summary

Phase 4 implements health checking and recovery for the GSD worktree system. The primary focus is a `/gsd:health` command that detects orphaned worktrees (registry/git/filesystem mismatches), stale locks, and incomplete finalization operations. The command follows a "doctor" pattern: diagnose first, then offer to fix each issue interactively.

The existing codebase already has partial infrastructure for this: `worktree status` detects discrepancies between the registry and git worktree list, `lock stale` checks for dead processes, and `validate health` checks `.planning/` integrity. Phase 4 unifies these into a single user-facing health command with interactive repair and detailed exit codes for CI.

**Primary recommendation:** Extend the existing `validate health` command with worktree-specific health checks and add a new `/gsd:health` workflow that combines all health validation with interactive repair options.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Auto-check for orphans during every worktree operation (create/remove/list)
- Report orphans in detailed table format showing path, branch, age, and suggested action
- Definition of "orphaned" includes: path missing, stale locks from dead processes, AND worktrees inactive beyond age threshold
- Age threshold for "potentially orphaned" is configurable via config/flag
- Default mode is interactive - prompt for confirmation on each orphan
- Process one orphan at a time (no batch selection)
- Refuse cleanup if uncommitted changes detected - show warning, block cleanup
- Full cleanup removes worktree + registry entry + releases lock atomically
- Detect incomplete finalization using both marker file AND git state verification
- Auto-resume incomplete finalization - automatically complete failed cleanup steps
- On recovery failure, rollback to safe state - undo partial recovery, leave system in known state
- Both auto-detect (finalize-phase offers to fix) AND explicit command available
- Single command: `/gsd:health` - detects and offers to fix all issues
- Default behavior is interactive fix - show issues, offer to fix each one
- Support `--quiet` or `--ci` flag for non-interactive mode (exit codes only)
- Detailed exit codes: 0 healthy, 1 orphans, 2 incomplete, 3 both, 4+ errors

### Claude's Discretion
- Exact format of detailed table output
- Marker file location and format for incomplete finalization detection
- Specific wording of interactive prompts
- Default age threshold value for "potentially orphaned"

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RECV-01 | Detect and report orphaned worktrees (path deleted but .git reference remains) | Git worktree list --porcelain provides prunable status; registry comparison detects mismatches; fs.existsSync() verifies paths |
| RECV-02 | Provide cleanup command for stale worktrees | git worktree prune removes orphaned references; git worktree remove handles active worktrees; existing lock stale detection available |
| RECV-03 | Recover from incomplete finalization (merge succeeded, cleanup failed) | .git/MERGE_HEAD indicates in-progress merge; marker file pattern (.planning/worktrees/finalization-in-progress.json) tracks cleanup state |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js readline | built-in | Interactive prompts | Zero-dependency, async/await support via `node:readline/promises` |
| child_process.execSync | built-in | Git command execution | Already used extensively in gsd-tools.cjs |
| fs (sync methods) | built-in | File existence checks, marker files | Already used throughout codebase |

### Supporting (Optional)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| prompts | latest | Rich interactive prompts | Only if readline insufficient for complex UX |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| readline | inquirer.js | More features but adds dependency; readline sufficient for yes/no prompts |
| Custom marker files | git state files only | Git state only shows merge-in-progress, not cleanup-in-progress |

**Installation:**
```bash
# No additional dependencies needed - all built-in Node.js
```

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/
├── gsd-tools.cjs           # Add health subcommand here
├── phase-worktree.sh       # Already has stale lock detection
└── state-merge.cjs         # Unchanged

.planning/worktrees/
├── registry.json           # Existing - add finalization tracking
├── locks/                  # Existing lock directory
│   └── phase-{N}/info.json
└── finalization/           # NEW - marker files for incomplete ops
    └── phase-{N}.json      # Tracks finalization state
```

### Pattern 1: Health Check Pipeline
**What:** Chain of validators, each producing typed issues
**When to use:** Multi-source health checking
**Example:**
```javascript
// Source: Existing cmdWorktreeStatus pattern in gsd-tools.cjs
function runHealthChecks(cwd, options) {
  const issues = [];

  // Check 1: Orphaned worktrees (registry vs git vs filesystem)
  issues.push(...checkOrphanedWorktrees(cwd));

  // Check 2: Stale locks (dead PIDs)
  issues.push(...checkStaleLocks(cwd));

  // Check 3: Incomplete finalization (marker files + git state)
  issues.push(...checkIncompleteFinalization(cwd));

  // Check 4: Age threshold (configurable)
  if (options.ageThreshold) {
    issues.push(...checkAgedWorktrees(cwd, options.ageThreshold));
  }

  return issues;
}
```

### Pattern 2: Interactive One-at-a-Time Repair
**What:** Process each issue sequentially with confirmation
**When to use:** User-facing health repair (per CONTEXT.md decision)
**Example:**
```javascript
// Source: Node.js readline/promises documentation
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function interactiveRepair(issues) {
  const rl = createInterface({ input, output });

  for (const issue of issues) {
    console.log(`\n${formatIssue(issue)}`);
    const answer = await rl.question('Fix this issue? (y/n): ');

    if (answer.toLowerCase() === 'y') {
      const result = await repairIssue(issue);
      console.log(result.success ? 'Fixed.' : `Failed: ${result.error}`);
    }
  }

  rl.close();
}
```

### Pattern 3: Marker File Transaction
**What:** Write state before operation, delete after success
**When to use:** Tracking multi-step operations for recovery
**Example:**
```javascript
// Marker file pattern for incomplete finalization detection
const FINALIZATION_DIR = '.planning/worktrees/finalization';

function startFinalization(phase, worktreePath, branch) {
  const marker = {
    phase,
    worktreePath,
    branch,
    started: new Date().toISOString(),
    steps: {
      merge: 'pending',
      cleanup: 'pending',
      registry: 'pending',
      lock: 'pending'
    }
  };
  fs.mkdirSync(FINALIZATION_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FINALIZATION_DIR, `phase-${phase}.json`),
    JSON.stringify(marker, null, 2)
  );
  return marker;
}

function updateFinalizationStep(phase, step, status) {
  const markerPath = path.join(FINALIZATION_DIR, `phase-${phase}.json`);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
  marker.steps[step] = status;
  marker.lastUpdated = new Date().toISOString();
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
}

function completeFinalization(phase) {
  const markerPath = path.join(FINALIZATION_DIR, `phase-${phase}.json`);
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
}
```

### Pattern 4: Exit Code Semantics
**What:** Distinct codes for different issue types
**When to use:** CI integration (per CONTEXT.md decision)
**Example:**
```javascript
// Exit codes per CONTEXT.md decision
const EXIT_CODES = {
  HEALTHY: 0,
  ORPHANS_ONLY: 1,
  INCOMPLETE_ONLY: 2,
  ORPHANS_AND_INCOMPLETE: 3,
  RUNTIME_ERROR: 4,
  // 5+ reserved for future issue types
};

function computeExitCode(issues) {
  const hasOrphans = issues.some(i =>
    ['path_missing', 'not_in_git', 'not_in_registry', 'stale_lock', 'age_exceeded'].includes(i.type)
  );
  const hasIncomplete = issues.some(i =>
    ['incomplete_finalization', 'merge_in_progress'].includes(i.type)
  );

  if (!hasOrphans && !hasIncomplete) return EXIT_CODES.HEALTHY;
  if (hasOrphans && !hasIncomplete) return EXIT_CODES.ORPHANS_ONLY;
  if (!hasOrphans && hasIncomplete) return EXIT_CODES.INCOMPLETE_ONLY;
  return EXIT_CODES.ORPHANS_AND_INCOMPLETE;
}
```

### Anti-Patterns to Avoid
- **Batch deletion without confirmation:** Never delete multiple worktrees in one operation (per CONTEXT.md)
- **Cleanup with uncommitted changes:** Always check `git status --porcelain` before removing worktrees
- **Silent failure during recovery:** If recovery fails, rollback and report clearly
- **Manual MERGE_HEAD deletion:** Always use `git merge --abort` to cleanly exit merges

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Orphan detection | Custom filesystem scanning | `git worktree list --porcelain` + registry comparison | Git tracks worktrees internally in .git/worktrees/ |
| Stale worktree cleanup | `rm -rf` on paths | `git worktree prune` + `git worktree remove` | Git manages worktree metadata; manual deletion leaves orphaned refs |
| Merge-in-progress detection | Parse git internals | Check `.git/MERGE_HEAD` existence | Standard git state file, documented behavior |
| Process liveness check | Custom process table parsing | `kill -0 $PID` | POSIX-standard, already used in phase-worktree.sh |
| Interactive prompts | Raw stdin handling | `node:readline/promises` | Handles edge cases (Ctrl+C, pipe input, etc.) |

**Key insight:** Git provides excellent introspection via `git worktree list --porcelain` which shows "prunable" status for orphaned worktrees. Combine with the existing registry to detect all discrepancy types.

## Common Pitfalls

### Pitfall 1: Deleting Worktree with Uncommitted Changes
**What goes wrong:** User loses work if cleanup runs on dirty worktree
**Why it happens:** Automated cleanup doesn't check worktree state first
**How to avoid:** Always run `git -C <worktree> status --porcelain` before removal; refuse if output non-empty
**Warning signs:** User reports "my changes disappeared"

### Pitfall 2: Incomplete Finalization State Loss
**What goes wrong:** Merge succeeds but cleanup fails; marker file not written; system can't recover
**Why it happens:** Marker file written after merge (too late) or not written at all
**How to avoid:** Write marker BEFORE starting finalization, update after each step, delete only on full success
**Warning signs:** Finalization reports success but worktree/branch/lock still exist

### Pitfall 3: Stale Lock False Positives
**What goes wrong:** Lock marked stale when process is actually running (different machine, container)
**Why it happens:** PID check with `kill -0` only works for same-machine processes
**How to avoid:** Check hostname in lock info.json; if different host, require manual confirmation
**Warning signs:** Multiple sessions trying to work on same phase simultaneously

### Pitfall 4: Race Between Health Check and Operation
**What goes wrong:** Health check finds orphan, user starts new phase, cleanup removes the wrong worktree
**Why it happens:** No locking during health check operations
**How to avoid:** Re-verify state immediately before each repair action; use advisory locks during repair
**Warning signs:** "Worktree not found" errors during repair

### Pitfall 5: Git Worktree Locked Status
**What goes wrong:** Can't remove worktree because git has it locked
**Why it happens:** Worktrees created with `--lock` flag (as GSD does) require unlock first
**How to avoid:** Always call `git worktree unlock` before `git worktree remove`
**Warning signs:** "worktree is locked" errors from git

## Code Examples

Verified patterns from official sources:

### Git Worktree List (Porcelain Format)
```bash
# Source: git-worktree man page
git worktree list --porcelain

# Output format (one worktree per block, separated by blank lines):
# worktree /path/to/worktree
# HEAD abc123...
# branch refs/heads/branch-name
# [prunable]  <- present if worktree can be pruned
# [locked]    <- present if worktree is locked
```

### Check for Uncommitted Changes in Worktree
```javascript
// Source: Existing GSD pattern in finalize-phase.md
function hasUncommittedChanges(worktreePath) {
  try {
    const output = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim().length > 0;
  } catch (err) {
    // If git command fails, assume dirty to be safe
    return true;
  }
}
```

### Detect Merge In Progress
```javascript
// Source: Git documentation on MERGE_HEAD
function hasMergeInProgress(repoPath) {
  const mergeHeadPath = path.join(repoPath, '.git', 'MERGE_HEAD');
  return fs.existsSync(mergeHeadPath);
}

function abortMerge(repoPath) {
  // Never manually delete MERGE_HEAD - use git merge --abort
  execSync('git merge --abort', { cwd: repoPath });
}
```

### Interactive Yes/No Prompt (Node.js)
```javascript
// Source: Node.js readline/promises documentation
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

async function confirm(message) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${message} (y/n): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}
```

### Atomic Worktree Cleanup Sequence
```javascript
// Source: Existing phase-worktree.sh remove_worktree function
async function cleanupWorktree(phase, worktreePath, branch) {
  // Step 1: Check for uncommitted changes (MUST fail if dirty)
  if (hasUncommittedChanges(worktreePath)) {
    throw new Error(`Worktree has uncommitted changes: ${worktreePath}`);
  }

  // Step 2: Unlock worktree (required for --lock worktrees)
  execSync(`git worktree unlock "${worktreePath}"`, { stdio: 'ignore' });

  // Step 3: Remove worktree via git (NOT rm -rf)
  execSync(`git worktree remove "${worktreePath}"`, { stdio: 'inherit' });

  // Step 4: Delete branch if fully merged
  try {
    execSync(`git branch -d "${branch}"`, { stdio: 'ignore' });
  } catch (err) {
    // Branch not merged or checked out elsewhere - warn but continue
    console.warn(`Branch ${branch} not deleted: ${err.message}`);
  }

  // Step 5: Release lock
  releaseLock(phase);

  // Step 6: Update registry
  markWorktreeRemoved(phase);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `rm -rf` worktrees | `git worktree remove` | Git 2.17+ | Proper cleanup of .git/worktrees/ metadata |
| Callback-based readline | `node:readline/promises` | Node.js 17+ | Clean async/await prompts |
| Global singleton readline | Interface per prompt | Best practice | Avoids hanging process on early exit |

**Deprecated/outdated:**
- `git worktree prune --expire=now`: Dangerous in scripts; prefer explicit detection and confirmation
- Manual `.git/worktrees/` manipulation: Git handles this; manual edits can corrupt state

## Open Questions

1. **Default Age Threshold Value**
   - What we know: CONTEXT.md says "configurable via config/flag"
   - What's unclear: What should the default be?
   - Recommendation: 7 days (1 week) - long enough for active development, short enough to catch abandoned work

2. **Finalization Marker File Cleanup on Startup**
   - What we know: Marker files track incomplete finalization
   - What's unclear: Should health check auto-clean stale markers from crashes?
   - Recommendation: Auto-clean markers older than 24 hours with no corresponding worktree

3. **Cross-Machine Lock Detection**
   - What we know: PID check fails across machines
   - What's unclear: How to handle locks from different hostnames
   - Recommendation: Show warning, require `--force` flag, don't auto-clean

## Sources

### Primary (HIGH confidence)
- Git worktree documentation (man git-worktree) - prunable status, repair command, lock semantics
- Node.js readline/promises documentation - async prompt handling
- Existing gsd-tools.cjs cmdWorktreeStatus - discrepancy detection pattern

### Secondary (MEDIUM confidence)
- [Git merge documentation](https://git-scm.com/docs/git-merge) - MERGE_HEAD file behavior
- [GeeksforGeeks MERGE_HEAD article](https://www.geeksforgeeks.org/git/how-to-fix-erroryou-have-not-concluded-your-merge-mergehead-exists/) - incomplete merge recovery
- [Node.js official docs](https://nodejs.org/api/readline.html) - readline module API

### Tertiary (LOW confidence)
- General CLI interactive patterns - derived from multiple sources, standard practice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using only built-in Node.js modules already in codebase
- Architecture: HIGH - extending existing patterns from gsd-tools.cjs
- Pitfalls: HIGH - derived from git documentation and existing GSD error handling

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days - stable domain, git worktree API unchanged)
