#!/usr/bin/env bash
set -euo pipefail

# phase-worktree.sh - Git worktree lifecycle management for GSD
# Provides atomic locking and worktree operations for parallel phase execution

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GSD_TOOLS="$SCRIPT_DIR/gsd-tools.cjs"

# ============================================================================
# Repository Info Helpers
# ============================================================================

get_repo_root() {
    git rev-parse --show-toplevel
}

get_repo_name() {
    basename "$(get_repo_root)"
}

# ============================================================================
# Worktree Path Functions
# ============================================================================

# Get worktree directory path (per user decision: .worktrees/{repo}-phase-{N})
get_worktree_dir() {
    local phase="$1"
    local repo_root
    local repo_name
    repo_root=$(get_repo_root)
    repo_name=$(get_repo_name)
    echo "${repo_root}/.worktrees/${repo_name}-phase-${phase}"
}

# Get branch name (per user decision: phase-{N}-{slug})
get_branch_name() {
    local phase="$1"
    local slug="$2"
    echo "phase-${phase}-${slug}"
}

# Get phase slug from roadmap via gsd-tools
get_phase_slug() {
    local phase="$1"
    # Use gsd-tools to get phase info
    local info
    info=$(node "$GSD_TOOLS" find-phase "$phase" 2>/dev/null) || {
        echo "unknown"
        return 1
    }
    # Extract slug from phase name (e.g., "01-foundation" -> "foundation")
    echo "$info" | sed 's/.*-//'
}

# Ensure .worktrees/ is in .gitignore
ensure_gitignore() {
    local repo_root
    repo_root=$(get_repo_root)
    local gitignore="${repo_root}/.gitignore"

    if ! grep -q "^\.worktrees/" "$gitignore" 2>/dev/null; then
        echo "" >> "$gitignore"
        echo "# Worktree directories (created by phase-worktree.sh)" >> "$gitignore"
        echo ".worktrees/" >> "$gitignore"
    fi
}

# Prune stale worktrees (TREE-06)
prune_stale() {
    # Run git worktree prune to clean up stale references
    git worktree prune 2>/dev/null || true
}

# ============================================================================
# Lock Functions
# ============================================================================

# Get lock directory path for a phase
get_lock_dir() {
    local phase="$1"
    local repo_root
    repo_root=$(git rev-parse --show-toplevel)
    echo "${repo_root}/.planning/worktrees/locks/phase-${phase}"
}

# Acquire atomic lock for a phase
# Returns 0 on success, 1 if lock already held
acquire_lock() {
    local phase="$1"
    local lock_dir
    lock_dir=$(get_lock_dir "$phase")

    # Ensure parent exists (mkdir -p is safe for parent)
    mkdir -p "$(dirname "$lock_dir")"

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
        # Record in registry
        node "$GSD_TOOLS" lock record "$phase" 2>/dev/null || true
        return 0
    else
        echo "Error: Phase $phase is locked. Another session may be active." >&2
        echo "Lock info: $(cat "${lock_dir}/info.json" 2>/dev/null || echo 'unavailable')" >&2
        return 1
    fi
}

# Release lock for a phase
# Returns 0 on success, 1 if lock didn't exist
release_lock() {
    local phase="$1"
    local lock_dir
    lock_dir=$(get_lock_dir "$phase")

    if [ -d "$lock_dir" ]; then
        rm -f "${lock_dir}/info.json"
        rmdir "$lock_dir" 2>/dev/null || true
        node "$GSD_TOOLS" lock clear "$phase" 2>/dev/null || true
        return 0
    else
        echo "Warning: No lock to release for phase $phase" >&2
        return 1
    fi
}

# Check if a lock is stale (process no longer exists)
# Returns 0 (true) if stale, 1 (false) if active or no lock
check_stale_lock() {
    local phase="$1"
    local lock_dir
    lock_dir=$(get_lock_dir "$phase")
    local info_file="${lock_dir}/info.json"

    if [ ! -d "$lock_dir" ]; then
        echo '{"stale": false, "reason": "no_lock"}'
        return 1
    fi

    if [ ! -f "$info_file" ]; then
        echo '{"stale": true, "reason": "no_info_file"}'
        return 0
    fi

    # Extract PID (simple grep, avoid jq dependency in shell)
    local pid
    pid=$(grep -o '"pid": *[0-9]*' "$info_file" | grep -o '[0-9]*')

    if [ -z "$pid" ]; then
        echo '{"stale": true, "reason": "no_pid_in_info"}'
        return 0
    fi

    # Check if process exists
    if kill -0 "$pid" 2>/dev/null; then
        echo '{"stale": false, "reason": "active", "pid": '"$pid"'}'
        return 1
    else
        echo '{"stale": true, "reason": "pid_dead", "pid": '"$pid"'}'
        return 0
    fi
}

# Force remove a lock (for recovery)
force_unlock() {
    local phase="$1"
    local lock_dir
    lock_dir=$(get_lock_dir "$phase")

    echo "Force-unlocking phase $phase..."
    rm -rf "$lock_dir"
    node "$GSD_TOOLS" lock clear "$phase" 2>/dev/null || true
    echo "Lock removed."
}

# Self-test function for development/debugging
_test_lock_atomicity() {
    local test_phase="__test_atomicity__"
    local lock_dir
    lock_dir=$(get_lock_dir "$test_phase")

    echo "Testing lock atomicity..."

    # Clean up any previous test
    rm -rf "$lock_dir" 2>/dev/null || true

    # Acquire lock
    if acquire_lock "$test_phase"; then
        echo "[PASS] First lock acquired"
    else
        echo "[FAIL] Failed to acquire first lock"
        return 1
    fi

    # Try to acquire again (should fail)
    if acquire_lock "$test_phase" 2>/dev/null; then
        echo "[FAIL] Second lock should have failed"
        release_lock "$test_phase"
        return 1
    else
        echo "[PASS] Second lock correctly rejected"
    fi

    # Release and cleanup
    release_lock "$test_phase"
    echo "[PASS] Lock released"

    # Verify cleanup
    if [ -d "$lock_dir" ]; then
        echo "[FAIL] Lock directory still exists after release"
        return 1
    else
        echo "[PASS] Lock directory cleaned up"
    fi

    echo "All lock tests passed."
    return 0
}

# Command dispatch
case "${1:-}" in
    acquire-lock)
        acquire_lock "${2:?Phase number required}"
        ;;
    release-lock)
        release_lock "${2:?Phase number required}"
        ;;
    check-stale)
        check_stale_lock "${2:?Phase number required}"
        ;;
    force-unlock)
        force_unlock "${2:?Phase number required}"
        ;;
    _test)
        _test_lock_atomicity
        ;;
    *)
        # If sourced, don't show usage
        if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
            echo "Usage: phase-worktree.sh <command> [args]"
            echo ""
            echo "Lock Commands:"
            echo "  acquire-lock <phase>   Acquire atomic lock for phase"
            echo "  release-lock <phase>   Release lock for phase"
            echo "  check-stale <phase>    Check if lock is stale"
            echo "  force-unlock <phase>   Force remove lock (recovery)"
            echo ""
            echo "Testing:"
            echo "  _test                  Run lock atomicity self-test"
            exit 1
        fi
        ;;
esac
