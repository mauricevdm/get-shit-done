# Architecture: Upstream Sync Integration

**Domain:** Fork maintenance tooling for GSD
**Researched:** 2026-02-23
**Overall Confidence:** HIGH (based on existing codebase patterns, git mechanics, established GSD conventions)

## Executive Summary

Upstream sync tooling integrates with GSD's existing command-workflow-agent architecture by adding:
1. A new domain module (`lib/upstream.cjs`) for git fetch/analyze/merge operations
2. New gsd-tools subcommands (`upstream fetch`, `upstream analyze`, `upstream merge`)
3. A new workflow (`sync-upstream.md`) for orchestrated sync operations
4. A new command (`/gsd:sync-upstream`) as the user entry point
5. Optional: A specialized agent (`gsd-upstream-analyzer.md`) for AI-assisted conflict analysis

The design follows existing patterns exactly: state-merge.cjs serves as the architectural model for upstream.cjs (standalone module with CLI interface), while health.md/finalize-phase.md serve as workflow models.

---

## Integration with Existing Architecture

### Existing Layers (from ARCHITECTURE.md)

| Layer | Location | Upstream Sync Additions |
|-------|----------|------------------------|
| Commands | `commands/gsd/*.md` | `sync-upstream.md` |
| Workflows | `get-shit-done/workflows/*.md` | `sync-upstream.md` |
| Agents | `agents/gsd-*.md` | `gsd-upstream-analyzer.md` (optional) |
| Tools | `get-shit-done/bin/gsd-tools.cjs` | New subcommands |
| Lib Modules | `get-shit-done/bin/lib/*.cjs` | `upstream.cjs` |

### Architecture Principle: Module-First

Per PROJECT.md: "Modular code structure | Match upstream's lib/ pattern for easier merges"

**Decision:** Create `lib/upstream.cjs` as a standalone module, following the `worktree.cjs` and `health.cjs` patterns:
- Export pure functions for each operation
- CLI interface via gsd-tools.cjs routing
- No dependencies on gsd-tools.cjs internals
- Testable in isolation

---

## Component Architecture

### New Module: lib/upstream.cjs

```
lib/upstream.cjs
|-- Configuration
|   |-- getUpstreamRemote(cwd)          # Returns configured upstream remote name
|   |-- setUpstreamRemote(cwd, name)    # Store upstream remote in config.json
|   +-- validateUpstreamConfig(cwd)     # Check upstream remote exists
|
|-- Fetch Operations
|   |-- fetchUpstream(cwd, options)     # git fetch upstream (with progress)
|   |-- getUpstreamCommits(cwd, since)  # List commits since last sync
|   +-- groupCommitsByFeature(commits)  # Cluster by conventional commit scope
|
|-- Analysis Operations
|   |-- analyzeCommit(cwd, sha)         # Deep analysis of single commit
|   |-- analyzeRange(cwd, from, to)     # Summary of commit range
|   |-- detectConflicts(cwd, commits)   # Pre-merge conflict detection
|   +-- generateSyncReport(analysis)    # Markdown report generation
|
|-- Merge Operations
|   |-- mergeUpstream(cwd, strategy)    # Execute merge with strategy
|   |-- cherryPickCommits(cwd, shas)    # Selective merge
|   +-- abortMerge(cwd)                 # Clean abort on failure
|
+-- State Tracking
    |-- recordSyncPoint(cwd, sha)       # Track last synced commit
    |-- getLastSyncPoint(cwd)           # Read last sync marker
    +-- getSyncHistory(cwd)             # Full sync log
```

### gsd-tools.cjs Router Additions

Following the existing pattern from lines 5200-5410:

```javascript
case 'upstream': {
  const subcommand = args[1];
  switch (subcommand) {
    case 'fetch':
      cmdUpstreamFetch(cwd, args.slice(2), raw);
      break;
    case 'analyze':
      cmdUpstreamAnalyze(cwd, args.slice(2), raw);
      break;
    case 'conflicts':
      cmdUpstreamConflicts(cwd, args.slice(2), raw);
      break;
    case 'merge':
      cmdUpstreamMerge(cwd, args.slice(2), raw);
      break;
    case 'status':
      cmdUpstreamStatus(cwd, raw);
      break;
    case 'history':
      cmdUpstreamHistory(cwd, raw);
      break;
    default:
      error('Unknown upstream subcommand. Available: fetch, analyze, conflicts, merge, status, history');
  }
  break;
}
```

### New Command: commands/gsd/sync-upstream.md

```yaml
---
name: gsd:sync-upstream
description: Fetch and analyze upstream changes, optionally merge
argument-hint: "[--fetch] [--analyze] [--merge] [--interactive]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---
```

Entry point delegating to `workflows/sync-upstream.md`.

### New Workflow: workflows/sync-upstream.md

Orchestration following the finalize-phase.md pattern:

```
Step 1: Initialize
  +-- gsd-tools upstream status (check configuration)

Step 2: Fetch
  +-- gsd-tools upstream fetch (git fetch upstream)

Step 3: Analyze
  |-- gsd-tools upstream analyze (list changes)
  +-- Group by feature/scope

Step 4: Conflict Detection
  +-- gsd-tools upstream conflicts (dry-run merge)

Step 5: Decision Point [Checkpoint]
  |-- Show diff summary
  |-- Show potential conflicts
  +-- User confirms proceed/abort/cherry-pick

Step 6: Merge
  |-- gsd-tools upstream merge
  +-- Handle conflicts interactively

Step 7: Post-Merge
  |-- Run tests (if configured)
  |-- Record sync point
  +-- Update STATE.md sync log
```

---

## Data Flow

### Sync Operation Flow

```
User: /gsd:sync-upstream --analyze

       +------------------+
       |   Command.md     |
       | sync-upstream    |
       +--------+---------+
                |
                v
       +------------------+
       |   Workflow.md    |
       | sync-upstream    |
       +--------+---------+
                |
    +-----------+-----------+
    |           |           |
    v           v           v
+--------+ +--------+ +----------+
| fetch  | |analyze | |conflicts |
+----+---+ +----+---+ +----+-----+
     |          |          |
     +----------+----------+
                |
                v
       +------------------+
       | lib/upstream.cjs |
       |   (via tools)    |
       +--------+---------+
                |
                v
       +------------------+
       |   git commands   |
       |   (execSync)     |
       +--------+---------+
                |
                v
       +------------------+
       |  JSON output     |
       |  to workflow     |
       +------------------+
```

### State Storage

**New config.json fields:**
```json
{
  "upstream": {
    "remote": "upstream",
    "last_sync": "abc123def",
    "sync_strategy": "merge",
    "auto_fetch": false
  }
}
```

**New STATE.md section (optional):**
```markdown
## Upstream Sync

**Last sync:** 2026-02-23 (abc123def)
**Upstream remote:** upstream
**Pending commits:** 5 since last sync

Recent syncs:
- 2026-02-23: Merged abc123def (feat: new tooling)
- 2026-02-20: Merged def456abc (fix: state parsing)
```

---

## Component Boundaries

### lib/upstream.cjs Responsibilities

**Does:**
- Execute git commands (fetch, merge, cherry-pick)
- Parse git output (commit logs, diff stats)
- Generate structured analysis data
- Track sync state in config.json

**Does NOT:**
- Present user interface (workflow handles this)
- Make decisions (returns data, workflow decides)
- Handle checkpoints (workflow handles this)
- Spawn subagents (orchestrator handles this)

### Workflow Responsibilities

**Does:**
- Orchestrate multi-step operations
- Present information to user
- Handle checkpoints for user decisions
- Call gsd-tools subcommands

**Does NOT:**
- Directly execute git commands
- Parse git output
- Store state directly

### Agent Responsibilities (if created)

**Does:**
- Deep analysis of commit changes
- Suggest refactoring approaches
- Generate conflict resolution suggestions

**Does NOT:**
- Execute merges
- Make final decisions
- Modify files without workflow approval

---

## New vs Modified Components

### New Components (create from scratch)

| Component | Location | Purpose |
|-----------|----------|---------|
| `upstream.cjs` | `get-shit-done/bin/lib/` | Core sync operations |
| `sync-upstream.md` | `commands/gsd/` | Command entry point |
| `sync-upstream.md` | `get-shit-done/workflows/` | Orchestration workflow |
| `gsd-upstream-analyzer.md` | `agents/` | Optional: AI analysis |

### Modified Components (extend existing)

| Component | Location | Changes |
|-----------|----------|---------|
| `gsd-tools.cjs` | `get-shit-done/bin/` | Add `upstream` command routing (~30 lines) |
| `config.json` schema | Runtime | Add `upstream` section |
| `STATE.md` template | `templates/` | Optional: Add sync tracking section |

### Unchanged Components

- `worktree.cjs` - No changes
- `health.cjs` - No changes
- All existing workflows - No changes
- All existing commands - No changes

---

## Patterns to Follow

### Pattern 1: Module Export Pattern (from worktree.cjs)

```javascript
// lib/upstream.cjs
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Constants ---
const DEFAULT_REMOTE = 'upstream';

// --- Helpers ---
function execGit(cwd, args) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

// --- Commands ---
function cmdUpstreamFetch(cwd, options, output, error, raw) {
  // Implementation
}

// --- Exports ---
module.exports = {
  DEFAULT_REMOTE,
  cmdUpstreamFetch,
  cmdUpstreamAnalyze,
  // ...
};
```

### Pattern 2: gsd-tools Integration (from health.cjs)

```javascript
// In gsd-tools.cjs
const upstreamModule = require('./lib/upstream.cjs');

// In main() switch statement
case 'upstream': {
  const subcommand = args[1];
  if (subcommand === 'fetch') {
    upstreamModule.cmdUpstreamFetch(cwd, parseOptions(args), output, error, raw);
  }
  // ...
}
```

### Pattern 3: Workflow Step Pattern (from finalize-phase.md)

```markdown
<step name="fetch_upstream">
Load upstream changes:

\`\`\`bash
FETCH_RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.cjs upstream fetch --raw)
\`\`\`

Parse JSON for: `commits_fetched`, `new_commits`, `behind_count`, `ahead_count`.

**If fetch fails:** Report error, suggest checking remote configuration.
</step>
```

### Pattern 4: Checkpoint Pattern (from execute-phase.md)

```markdown
<step name="confirm_merge">
**Checkpoint: User Decision Required**

Present merge preview:
- N commits to merge
- Files changed: X
- Potential conflicts: Y files

Use `AskUserQuestion` tool:
"Proceed with merge? (y/n/cherry-pick/abort)"

| Response | Action |
|----------|--------|
| y | Continue to merge step |
| n | Skip merge, keep analysis |
| cherry-pick | Show commit picker |
| abort | Exit workflow |
</step>
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bypassing gsd-tools

**Bad:**
```markdown
<step name="fetch">
\`\`\`bash
git fetch upstream
\`\`\`
</step>
```

**Good:**
```markdown
<step name="fetch">
\`\`\`bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs upstream fetch
\`\`\`
</step>
```

**Why:** Centralized tooling ensures consistent error handling, JSON output, and state tracking.

### Anti-Pattern 2: Stateful Module

**Bad:**
```javascript
// lib/upstream.cjs
let lastFetchTime = null;  // Module-level state

function fetch(cwd) {
  lastFetchTime = Date.now();
  // ...
}
```

**Good:**
```javascript
// lib/upstream.cjs
function fetch(cwd, options) {
  // Read state from config.json
  const config = loadConfig(cwd);
  // ...
  // Write state back to config.json
  saveConfig(cwd, updatedConfig);
}
```

**Why:** Module state doesn't persist across tool invocations. Use file-based state.

### Anti-Pattern 3: Agent Does Everything

**Bad:**
```markdown
<!-- gsd-upstream-analyzer.md -->
<process>
1. Fetch upstream
2. Analyze commits
3. Detect conflicts
4. Execute merge
5. Update state
</process>
```

**Good:**
```markdown
<!-- gsd-upstream-analyzer.md -->
<process>
1. Read commit data from <files_to_read>
2. Analyze changes semantically
3. Return structured analysis report
</process>
```

**Why:** Agents analyze and suggest. Workflows orchestrate and execute.

---

## Build Order (Dependency-Aware)

### Phase 1: Foundation (No Dependencies)

1. **lib/upstream.cjs** - Core module with git operations
   - `fetchUpstream()`
   - `getUpstreamCommits()`
   - `analyzeCommit()`
   - `detectConflicts()`

2. **gsd-tools.cjs routing** - Wire module to CLI
   - `upstream fetch`
   - `upstream analyze`
   - `upstream conflicts`
   - `upstream status`

### Phase 2: Workflow Integration (Depends on Phase 1)

3. **workflows/sync-upstream.md** - Orchestration
   - Fetch -> Analyze -> Checkpoint -> Merge flow
   - Error handling and recovery

4. **commands/gsd/sync-upstream.md** - Entry point
   - Argument parsing
   - Workflow delegation

### Phase 3: Merge Operations (Depends on Phase 1-2)

5. **lib/upstream.cjs additions**
   - `mergeUpstream()`
   - `cherryPickCommits()`
   - `abortMerge()`
   - `recordSyncPoint()`

6. **Workflow additions**
   - Merge step implementation
   - Post-merge verification
   - State recording

### Phase 4: Polish (Depends on Phase 1-3)

7. **Optional: gsd-upstream-analyzer.md** - AI assistance
   - Deep commit analysis
   - Conflict resolution suggestions
   - Refactoring recommendations

8. **Integration with existing workflows**
   - `/gsd:health` checks for stale sync
   - `/gsd:progress` shows sync status

---

## Scalability Considerations

| Concern | Small Repo (100 commits) | Medium Repo (1K commits) | Large Repo (10K+ commits) |
|---------|--------------------------|--------------------------|---------------------------|
| Fetch speed | Instant | 1-2 seconds | 5-10 seconds |
| Commit analysis | All commits | Last 100 by default | Pagination required |
| Conflict detection | Full diff | Summary mode | File-level only |
| Memory usage | Negligible | ~10MB for analysis | Stream processing needed |

**Recommendation:** Start with small repo assumptions. Add `--limit N` and `--since DATE` options in Phase 1 for medium/large repos.

---

## Testing Strategy

### Unit Tests (lib/upstream.cjs)

```javascript
// upstream.test.cjs
const { getUpstreamCommits, groupCommitsByFeature } = require('./upstream.cjs');

test('groups commits by conventional commit scope', () => {
  const commits = [
    { message: 'feat(tools): add websearch' },
    { message: 'feat(tools): add progress' },
    { message: 'fix(workflow): handle edge case' }
  ];
  const grouped = groupCommitsByFeature(commits);
  expect(grouped['tools'].length).toBe(2);
  expect(grouped['workflow'].length).toBe(1);
});
```

### Integration Tests (via gsd-tools)

```bash
# Test CLI interface
node gsd-tools.cjs upstream fetch --dry-run
node gsd-tools.cjs upstream analyze --since=HEAD~5
node gsd-tools.cjs upstream conflicts --raw
```

### Manual Workflow Tests

```bash
# Test full workflow
/gsd:sync-upstream --analyze  # Should show commit list
/gsd:sync-upstream --fetch    # Should fetch and report
/gsd:sync-upstream            # Should run full flow with checkpoints
```

---

## Sources

### Existing Codebase (Authoritative)
- `get-shit-done/bin/lib/worktree.cjs` - Module pattern reference
- `get-shit-done/bin/lib/health.cjs` - Module pattern reference
- `get-shit-done/bin/state-merge.cjs` - Conflict handling reference
- `get-shit-done/workflows/finalize-phase.md` - Workflow pattern reference
- `get-shit-done/workflows/health.md` - Interactive workflow reference

### Git Documentation (Authoritative)
- `git fetch` - Fetch from remote
- `git merge-base` - Find common ancestor
- `git diff --stat` - Summary of changes
- `git log --oneline` - Commit listing

### GSD Conventions (Authoritative)
- `.planning/codebase/ARCHITECTURE.md` - System architecture
- `.planning/codebase/CONVENTIONS.md` - Code conventions
- `.planning/PROJECT.md` - Project context

---

*Architecture research: 2026-02-23*
