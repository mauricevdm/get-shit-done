# Phase 1: Foundation - Research

**Researched:** 2026-02-20
**Domain:** Git worktree lifecycle management, directory-based locking, JSON registry
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundation for parallel phase execution through three core components: (1) a `phase-worktree.sh` shell script that wraps Git worktree operations with GSD-specific conventions, (2) a directory-based locking mechanism using atomic `mkdir` for coordination, and (3) a JSON registry for tracking worktree metadata. This foundation enables the execute-phase and finalize-phase workflows (Phase 2) to create isolated working directories where multiple AI sessions can work simultaneously.

The implementation uses battle-tested patterns: Git 2.17+ worktree commands with `--lock` flag for atomic creation, POSIX `mkdir` for lock acquisition (kernel-level atomicity), and explicit JSON state rather than parsing git output. The user has locked key decisions: worktrees live in `.worktrees/` subdirectory, branches follow `phase-{N}-{slug}` pattern, directories follow `{repo}-phase-{N}` pattern, and the registry stores absolute paths.

**Primary recommendation:** Implement `phase-worktree.sh` as a POSIX shell script with subcommands (create, status, path, list, remove), store locks in `.planning/worktrees/locks/phase-{N}/`, and track worktree metadata in `.planning/worktrees/registry.json`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Worktree location | Subdirectory in repo (`.worktrees/`) | Keeps worktrees contained within project structure |
| Branch naming pattern | `phase-{N}-{slug}` | Simple, no namespace prefix (e.g., `phase-1-foundation`) |
| Directory naming | `{repo}-phase-{N}` | Includes repo name for clarity (e.g., `get-shit-done-phase-1`) |
| Path storage in registry | Absolute paths | Unambiguous, works from anywhere |

**Implications:**
- Must add `.worktrees/` to `.gitignore`
- Directory pattern: `.worktrees/{repo}-phase-{N}/`
- Full example: `.worktrees/get-shit-done-phase-1/` with branch `phase-1-foundation`

### Claude's Discretion

- **Command Output Format:** Follow GSD conventions (human-readable by default, JSON via `--json` flag)
- **Lock Behavior and Ownership:** Research established directory-based locks with timestamp/owner metadata in `.planning/worktrees/locks/`
- **Error Messages and Recovery:** Follow GSD conventions (clear messages, actionable recovery, non-zero exit codes)

### Deferred Ideas (OUT OF SCOPE)

None captured.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TREE-01 | Create worktree for phase with unique branch | `git worktree add .worktrees/{dir} -b phase-{N}-{slug} --lock` |
| TREE-02 | List all active worktrees with status | `git worktree list --porcelain` + registry.json merge |
| TREE-03 | Get path for existing worktree by phase number | Registry lookup by phase_number field |
| TREE-04 | Remove worktree and release lock | `git worktree remove` + `rmdir` lock dir + registry update |
| TREE-05 | Detect existing worktree and switch instead of recreate | Registry check before creation, return existing path |
| TREE-06 | Prune stale worktree references automatically | `git worktree prune` on script startup |
| LOCK-01 | Acquire directory-based lock before worktree creation | `mkdir -p` parent then `mkdir` lock dir (atomic) |
| LOCK-02 | Release lock on worktree removal | `rmdir` lock directory after worktree remove |
| LOCK-03 | Prevent concurrent execution of same phase | Lock acquisition fails if dir exists |
| LOCK-04 | Track locks in JSON registry with metadata | `locks` section in registry.json with timestamp, owner |
</phase_requirements>

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git worktree | Git 2.17+ | Branch isolation | Built-in, shared .git objects, `--lock` flag |
| POSIX shell (bash) | 3.2+ | Automation script | Zero dependencies, universal availability |
| mkdir | POSIX | Atomic lock acquisition | Kernel-level atomicity, survives crashes |
| jq | 1.6+ | JSON manipulation | Required for registry operations in shell |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| git rev-parse | Path resolution | `--show-toplevel` for repo root, `--git-common-dir` for main .git |
| git branch | Branch management | Check if branch exists, delete after merge |
| date | Timestamps | ISO 8601 format for registry metadata |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jq | Node.js JSON | jq is lighter, but gsd-tools.cjs could handle registry ops |
| mkdir lock | flock | mkdir survives crashes; flock requires process to hold it |
| JSON registry | Parse `git worktree list` | JSON is explicit state; parsing is fragile |

**Installation:**
```bash
# jq is the only external dependency
brew install jq  # macOS
apt-get install jq  # Ubuntu/Debian
```

**Note:** Consider adding registry commands to gsd-tools.cjs instead of using jq directly. This would keep the shell script simpler and leverage existing Node.js infrastructure.

## Architecture Patterns

### Recommended File Structure

```
.planning/
├── worktrees/
│   ├── registry.json       # Worktree metadata (paths, branches, status)
│   └── locks/
│       └── phase-{N}/      # Lock directory (existence = lock held)
│           └── info.json   # Lock metadata (timestamp, owner, pid)
.worktrees/                  # Actual worktree directories (gitignored)
├── {repo}-phase-1/
├── {repo}-phase-2/
└── ...
```

### Pattern 1: Atomic Lock Acquisition

**What:** Use `mkdir` system call atomicity to acquire locks without race conditions.
**When to use:** Before any worktree creation to prevent concurrent execution.
**Example:**
```bash
# Source: https://mywiki.wooledge.org/BashFAQ/045
acquire_lock() {
    local phase="$1"
    local lock_dir=".planning/worktrees/locks/phase-${phase}"

    # Ensure parent exists (mkdir -p is NOT atomic but parent is shared)
    mkdir -p ".planning/worktrees/locks"

    # Atomic lock acquisition - only one process succeeds
    if mkdir "$lock_dir" 2>/dev/null; then
        # Write metadata for debugging/recovery
        cat > "${lock_dir}/info.json" << EOF
{
  "acquired": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pid": $$,
  "owner": "${USER:-unknown}",
  "hostname": "$(hostname)"
}
EOF
        return 0
    else
        return 1  # Lock already held
    fi
}
```

### Pattern 2: Registry as Source of Truth

**What:** JSON registry tracks all worktree metadata; git worktree commands are implementation details.
**When to use:** For all worktree operations - create, list, status, path lookup.
**Example:**
```json
{
  "version": 1,
  "worktrees": {
    "phase-1": {
      "phase_number": "1",
      "phase_name": "foundation",
      "branch": "phase-1-foundation",
      "path": "/absolute/path/to/.worktrees/get-shit-done-phase-1",
      "created": "2026-02-20T15:30:00Z",
      "status": "active"
    }
  },
  "locks": {
    "phase-1": {
      "acquired": "2026-02-20T15:29:59Z",
      "owner": "user",
      "pid": 12345
    }
  }
}
```

### Pattern 3: Worktree Creation with Lock

**What:** Acquire lock before git worktree add, release on failure.
**When to use:** TREE-01 implementation.
**Example:**
```bash
# Source: Git official documentation
create_worktree() {
    local phase="$1"
    local slug="$2"

    # Get repo name and root
    local repo_root=$(git rev-parse --show-toplevel)
    local repo_name=$(basename "$repo_root")

    # Construct paths per user decisions
    local branch="phase-${phase}-${slug}"
    local worktree_dir="${repo_root}/.worktrees/${repo_name}-phase-${phase}"

    # Acquire lock first
    if ! acquire_lock "$phase"; then
        echo "Error: Phase $phase is locked (another session may be active)" >&2
        return 1
    fi

    # Create worktree with lock (Git 2.17+)
    if ! git worktree add "$worktree_dir" -b "$branch" HEAD --lock; then
        # Cleanup lock on failure
        release_lock "$phase"
        echo "Error: Failed to create worktree" >&2
        return 1
    fi

    # Update registry
    update_registry_add "$phase" "$slug" "$branch" "$worktree_dir"

    echo "$worktree_dir"
}
```

### Anti-Patterns to Avoid

- **Never use `rm -rf` on worktree directories:** Always use `git worktree remove`. Direct deletion leaves orphaned .git references that cause errors.
- **Never use `mkdir -p` for lock directory:** The `-p` flag makes mkdir succeed even if directory exists, defeating the atomic lock purpose. Use `mkdir` without `-p` for the lock directory itself.
- **Never parse `git worktree list` output for programmatic use:** Use `--porcelain` flag or maintain explicit registry. Human-readable output format changes between Git versions.
- **Never store relative paths in registry:** Relative paths break when invoked from different working directories. Always store absolute paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic lock | Custom file-based locking | `mkdir` system call | Kernel guarantees atomicity; file locks have race windows |
| Worktree creation | Manual checkout + branch | `git worktree add --lock` | Handles .git file creation, branch tracking, lock in one atomic operation |
| Stale worktree cleanup | Manual find + delete | `git worktree prune` | Git knows its own metadata structure; manual deletion corrupts state |
| JSON manipulation in shell | sed/awk parsing | `jq` or gsd-tools.cjs | JSON has edge cases (escaping, nesting) that sed/awk mishandle |
| Path resolution in worktree | `pwd` or hardcoded | `git rev-parse --show-toplevel` | Worktree .git is a file pointing elsewhere; naive pwd breaks |

**Key insight:** Git worktree operations are deceptively complex because they maintain bidirectional links between main repo and worktrees. Custom implementations miss edge cases like .git file format, gitdir pointer, and shared object store.

## Common Pitfalls

### Pitfall 1: Orphaned Worktrees from Manual Deletion

**What goes wrong:** User runs `rm -rf .worktrees/phase-1/` instead of `git worktree remove`. Git's `.git/worktrees/` still has metadata pointing to deleted directory. Future operations fail with confusing errors.

**Why it happens:** Users expect file deletion to be sufficient. Git's worktree metadata is hidden in `.git/worktrees/`.

**How to avoid:**
- Run `git worktree prune` at script startup (TREE-06)
- Provide clear error messages when orphaned worktrees detected
- Document that only `phase-worktree.sh remove` should be used

**Warning signs:** `git worktree list` shows paths that don't exist; `git worktree add` fails with "already checked out" errors.

### Pitfall 2: Stale Locks from Crashes

**What goes wrong:** Script crashes after acquiring lock but before releasing it. Lock directory persists. Subsequent attempts fail permanently.

**Why it happens:** SIGKILL cannot be trapped; crashes before cleanup code runs.

**How to avoid:**
- Store PID and timestamp in lock metadata
- On lock acquisition failure, check if holding PID still exists: `kill -0 $pid 2>/dev/null`
- If PID is dead AND lock is older than threshold (e.g., 24 hours), auto-recover
- Provide `phase-worktree.sh unlock --force` for manual recovery

**Warning signs:** Lock directory exists but no active process matches stored PID.

### Pitfall 3: Branch Already Exists

**What goes wrong:** User creates worktree, removes it (properly), tries to recreate. Branch `phase-1-foundation` still exists. `git worktree add -b` fails.

**Why it happens:** `git worktree remove` doesn't delete the branch by default.

**How to avoid:**
- On worktree removal, also delete the branch if it's fully merged
- Or use `-B` flag (uppercase) to reset existing branch
- Check for existing branch before creation and handle appropriately

**Warning signs:** "fatal: A branch named 'phase-1-foundation' already exists."

### Pitfall 4: Path Resolution in Worktrees

**What goes wrong:** Script uses `pwd` to find repo root. In worktree, `pwd` returns worktree path, but `.git` is a file (not directory) pointing to main repo.

**Why it happens:** Worktrees have different filesystem structure than main repo.

**How to avoid:**
- Always use `git rev-parse --show-toplevel` for worktree root
- Use `git rev-parse --git-common-dir` to find shared .git directory
- Never assume `.git` is a directory

**Warning signs:** Scripts fail when run from worktree; paths resolve to wrong location.

### Pitfall 5: Concurrent Lock Check and Acquire

**What goes wrong:** Two processes check if lock exists (both see "no"), both try to create lock, one fails unexpectedly.

**Why it happens:** Checking then creating is a TOCTOU (time-of-check-time-of-use) race.

**How to avoid:**
- Never check-then-create. Just try to `mkdir` and handle failure.
- The `mkdir` call IS the check - atomic at kernel level.

**Warning signs:** Intermittent "lock already held" errors that seem impossible.

## Code Examples

Verified patterns from official sources:

### Git Worktree Create with Lock

```bash
# Source: https://git-scm.com/docs/git-worktree
# Git 2.17+ supports --lock with add
git worktree add <path> -b <new-branch> [<start-point>] --lock

# Example for phase 1:
git worktree add .worktrees/get-shit-done-phase-1 -b phase-1-foundation HEAD --lock
```

### Git Worktree List (Porcelain Format)

```bash
# Source: https://git-scm.com/docs/git-worktree
git worktree list --porcelain

# Output format (one block per worktree):
# worktree /absolute/path/to/worktree
# HEAD <commit-hash>
# branch refs/heads/<branch-name>
# [locked]
# [prunable]
```

### POSIX Atomic Lock Pattern

```bash
# Source: https://mywiki.wooledge.org/BashFAQ/045
# Key insight: mkdir is atomic at kernel level

LOCKDIR="/path/to/lockdir"

if mkdir -- "$LOCKDIR" 2>/dev/null; then
    echo "Lock acquired"
    trap 'rmdir -- "$LOCKDIR"' EXIT  # Cleanup on normal exit
    # ... do work ...
else
    echo "Failed to acquire lock"
    exit 1
fi
```

### Stale Lock Detection

```bash
# Source: Adapted from https://github.com/trbs/pid patterns
check_stale_lock() {
    local lock_dir="$1"
    local info_file="${lock_dir}/info.json"

    if [ ! -f "$info_file" ]; then
        return 1  # No info, can't determine staleness
    fi

    local pid=$(jq -r '.pid' "$info_file")
    local acquired=$(jq -r '.acquired' "$info_file")

    # Check if process exists (signal 0 = existence check only)
    if ! kill -0 "$pid" 2>/dev/null; then
        # Process dead - lock is stale
        return 0
    fi

    # Optional: check age threshold (24 hours = 86400 seconds)
    # ... timestamp comparison logic ...

    return 1  # Lock is valid
}
```

### Registry Update with jq

```bash
# Source: jq manual
# Add worktree to registry
add_to_registry() {
    local registry=".planning/worktrees/registry.json"
    local phase="$1"
    local slug="$2"
    local branch="$3"
    local path="$4"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Initialize if doesn't exist
    if [ ! -f "$registry" ]; then
        echo '{"version":1,"worktrees":{},"locks":{}}' > "$registry"
    fi

    jq --arg p "$phase" \
       --arg s "$slug" \
       --arg b "$branch" \
       --arg path "$path" \
       --arg ts "$timestamp" \
       '.worktrees["phase-" + $p] = {
           phase_number: $p,
           phase_name: $s,
           branch: $b,
           path: $path,
           created: $ts,
           status: "active"
       }' "$registry" > "${registry}.tmp" && mv "${registry}.tmp" "$registry"
}
```

## gsd-tools.cjs Commands Needed

To minimize jq dependency and leverage existing infrastructure, consider adding these commands to gsd-tools.cjs:

### Proposed Commands

```bash
# Worktree registry operations
gsd-tools worktree init                    # Create registry.json if needed
gsd-tools worktree add <phase> <path>      # Add entry to registry
gsd-tools worktree remove <phase>          # Remove entry from registry
gsd-tools worktree get <phase>             # Get worktree info by phase
gsd-tools worktree list                    # List all worktrees from registry
gsd-tools worktree status                  # Merge registry with git worktree list

# Lock registry operations
gsd-tools lock acquire <phase>             # Record lock in registry
gsd-tools lock release <phase>             # Remove lock from registry
gsd-tools lock check <phase>               # Check if phase is locked
gsd-tools lock list                        # List all locks
```

### Integration with phase-worktree.sh

```bash
# phase-worktree.sh create (simplified with gsd-tools)
create_worktree() {
    local phase="$1"

    # Check if already exists
    local existing=$(node gsd-tools.cjs worktree get "$phase" 2>/dev/null)
    if [ -n "$existing" ]; then
        echo "Worktree already exists: $(echo "$existing" | jq -r '.path')"
        return 0
    fi

    # Acquire lock via shell (atomic mkdir) - can't delegate this
    if ! acquire_lock "$phase"; then
        echo "Error: Phase $phase is locked" >&2
        return 1
    fi

    # Get phase info from gsd-tools
    local info=$(node gsd-tools.cjs init phase-op "$phase")
    local slug=$(echo "$info" | jq -r '.phase_slug')

    # Create worktree
    local repo_root=$(git rev-parse --show-toplevel)
    local repo_name=$(basename "$repo_root")
    local branch="phase-${phase}-${slug}"
    local worktree_path="${repo_root}/.worktrees/${repo_name}-phase-${phase}"

    git worktree add "$worktree_path" -b "$branch" HEAD --lock

    # Update registry via gsd-tools
    node gsd-tools.cjs worktree add "$phase" "$worktree_path" \
        --branch "$branch" --slug "$slug"
    node gsd-tools.cjs lock acquire "$phase"

    echo "$worktree_path"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `git clone` for isolation | `git worktree add` | Git 2.5 (2015) | Shared objects, instant creation, disk space savings |
| Manual lock + create | `git worktree add --lock` | Git 2.17 (2018) | Atomic creation + lock, no race window |
| Human-readable list parsing | `git worktree list --porcelain` | Git 2.7 (2016) | Stable machine-readable format |
| flock for shell locking | mkdir for shell locking | N/A (both old) | mkdir survives crashes, no process dependency |

**Deprecated/outdated:**
- **`git clone` for branch isolation:** Wastes disk space, doesn't share objects. Use worktree instead.
- **Parsing `git worktree list` human output:** Format changes between versions. Use `--porcelain`.

## Open Questions

1. **Stale lock recovery TTL**
   - What we know: Research suggests 24 hours + no PID as threshold
   - What's unclear: Is 24 hours appropriate for GSD usage? AI sessions may be long-running.
   - Recommendation: Start with 24 hours, add `--force` override, tune based on usage

2. **What if `.worktrees/` is deleted but registry has entries?**
   - What we know: Registry would be out of sync with filesystem
   - What's unclear: Best recovery strategy
   - Recommendation: On any operation, verify path exists. If not, run `git worktree prune` and remove from registry. Self-healing.

3. **Lazy vs eager `.worktrees/` creation**
   - What we know: User asked about this in CONTEXT.md open questions
   - What's unclear: User preference
   - Recommendation: Lazy creation on first worktree (simpler, no unused directories). Add `.worktrees/` to `.gitignore` on first create.

## Sources

### Primary (HIGH confidence)
- [Git Worktree Official Documentation](https://git-scm.com/docs/git-worktree) — command reference, `--lock` flag (Git 2.17+), `--porcelain` format
- [BashFAQ/045 - Greg's Wiki](https://mywiki.wooledge.org/BashFAQ/045) — POSIX atomic locking with mkdir
- Git 2.39.5 local installation — verified all commands work on target system

### Secondary (MEDIUM confidence)
- [Things UNIX can do atomically](https://rcrowley.org/2010/01/06/things-unix-can-do-atomically.html) — mkdir atomicity at kernel level
- [GitHub trbs/pid](https://github.com/trbs/pid) — PID file stale detection patterns
- [Easy bash script locking with mkdir](https://www.tobru.ch/easy-bash-script-locking-with-mkdir/) — practical mkdir locking
- [Restic Locking System](https://deepwiki.com/restic/restic/8.1-locking-system) — lock refresh and stale detection patterns

### Tertiary (context only)
- Existing GSD codebase: `gsd-tools.cjs`, `execute-phase.md`, `finalize-phase.md`
- `.planning/research/SUMMARY.md` — prior project research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Git worktree is mature (Git 2.5+), mkdir atomicity is kernel-guaranteed
- Architecture: HIGH — Follows existing GSD patterns, user decisions are clear
- Pitfalls: HIGH — Well-documented failure modes from Git docs and shell scripting community

**Research date:** 2026-02-20
**Valid until:** 30 days (stable domain, no rapid changes expected)
