#!/usr/bin/env bash
set -euo pipefail

# phase-worktree.sh - Git worktree lifecycle management for GSD
# Provides atomic locking and worktree operations for parallel phase execution

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GSD_TOOLS="$SCRIPT_DIR/gsd-tools.cjs"

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
