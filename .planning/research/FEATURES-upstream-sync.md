# Feature Landscape: Upstream Sync Tooling

**Domain:** Git fork maintenance and upstream synchronization
**Researched:** 2026-02-23
**Focus:** GSD v1.1 Milestone - Upstream sync for fork maintainers

## Executive Summary

Upstream sync tooling helps fork maintainers stay current with the original repository while preserving their customizations. The core challenge is not the sync itself (git commands are straightforward) but making informed decisions: understanding what changed upstream, predicting conflicts, and verifying the merge worked.

This feature landscape maps what users expect (table stakes), what differentiates good tooling (beyond manual git), and what to explicitly avoid (complexity traps).

---

## Table Stakes

Features users expect. Missing = product feels incomplete compared to manual git workflows.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Upstream remote configuration** | Every sync requires knowing where upstream is | Low | None |
| **Fetch upstream commits** | Core operation - must be able to get upstream changes | Low | Upstream remote configured |
| **Compare behind/ahead status** | Users need to know if they're out of sync | Low | Upstream remote |
| **Show commit log from upstream** | Users need to see what changed | Low | Fetch complete |
| **Basic merge or rebase** | Standard sync methods everyone knows | Low | Fetch complete |
| **Conflict detection** | Users need to know if sync will cause problems | Medium | Fetch complete |
| **Post-merge test execution** | Verify sync didn't break anything | Low | Existing test runner |

### Notes on Table Stakes

These features replicate what users already do manually with git commands:
- `git remote add upstream <url>`
- `git fetch upstream`
- `git log main..upstream/main`
- `git merge upstream/main` or `git rebase upstream/main`
- `git diff --stat upstream/main`

**Key insight:** Table stakes alone don't justify a tool. The value is in making these faster/safer with better UX.

---

## Differentiators

Features that set upstream sync apart from manual git operations or basic sync scripts.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Commit grouping by feature/area** | See related changes together instead of chronological list | Medium | Fetch complete |
| **Interactive explore mode** | Deep dive into specific changes before deciding to merge | Medium | Commit analysis |
| **Pre-merge conflict preview** | Know exactly what will conflict BEFORE attempting merge | Medium | `git merge-tree` |
| **Selective sync (cherry-pick workflow)** | Sync specific features while deferring others | High | Commit grouping |
| **Diff impact analysis** | Understand which of YOUR customizations are affected | Medium | Fetch complete |
| **Smart merge strategy recommendation** | Suggest rebase vs merge based on history/conflicts | Medium | Conflict detection |
| **Post-merge verification suite** | Run existing GSD verify-work patterns | Low | Existing /gsd:verify-work |
| **Sync state persistence** | Resume interrupted sync, remember decisions | Medium | STATE.md integration |
| **Rollback support** | Easy undo if sync goes wrong | Medium | Git reflog wrapping |

### Differentiator Priority

**Must-have differentiators (v1.1 scope):**
1. Commit grouping by feature/area - transforms wall of commits into understandable chunks
2. Interactive explore mode - per PROJECT.md "Deep dive mode for interactive exploration"
3. Pre-merge conflict preview - per PROJECT.md "Conflict detection before merge attempt"
4. Post-merge verification - per PROJECT.md "Post-merge verification tests"

**Nice-to-have differentiators (future):**
5. Selective sync - complexity high, cherry-pick has gotchas
6. Smart merge strategy recommendation
7. Diff impact analysis
8. Sync state persistence (partial - STATE.md already exists)

---

## Anti-Features

Features to explicitly NOT build. Scope traps that add complexity without proportional value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic scheduled sync** | Adds daemon complexity, GSD is session-based | Manual trigger with clear status |
| **GitHub PR creation** | GitHub CLI (`gh pr create`) already excellent | Document how to use `gh` after sync |
| **Multi-remote sync** | Rarely needed, explosion of edge cases | Support one upstream, document workarounds |
| **Full three-way merge resolution UI** | Massive scope, editors already solve this | Detect conflicts, defer resolution to editor |
| **Semantic versioning automation** | Tangential to sync, complex to get right | Just report what version upstream is at |
| **Automatic conflict resolution** | Dangerous for customized forks | Always require human decision on conflicts |
| **Branch protection bypass** | Security risk | Respect existing branch rules |
| **Force push to main** | Destructive, violates GSD safety principles | Never allow without explicit user confirmation |

### Anti-Feature Rationale

GSD principle: "No runtime deps" - tools that add dependencies for marginal features are rejected.

Upstream sync is about **informed decision-making**, not automation. The user (fork maintainer) must understand what they're merging and why.

---

## Feature Dependencies

```
[Configure upstream]
    |
    v
[Fetch upstream]
    |
    v
[Analyze commits] --> [Group by feature]
    |                       |
    v                       v
[Detect conflicts] <-- [Interactive explore]
    |
    v
[Merge/Rebase] --> [Verify tests pass]
    |
    v
[Update STATE.md]
```

### Integration with Existing GSD Features

| New Feature | Depends On (Existing) | How |
|-------------|----------------------|-----|
| Post-merge verification | `/gsd:verify-work` | Invoke existing workflow |
| State persistence | STATE.md, `state-merge.cjs` | Log sync events to Implementation Notes |
| Conflict resolution UI | `external-editor` (already used) | Reuse openInEditor pattern |
| Health check integration | `/gsd:health` | Detect stalled syncs as health issues |
| Worktree awareness | `worktree.cjs` | Don't sync in phase worktrees, warn user |

---

## MVP Recommendation

### Phase 1: Core Sync Operations
1. `upstream configure <url>` - Set upstream remote
2. `upstream status` - Show behind/ahead, last sync date
3. `upstream fetch` - Fetch upstream commits
4. `upstream log` - Show commits grouped by file/directory touched
5. `upstream conflicts` - Preview conflicts without merging

### Phase 2: Interactive Workflow
6. `upstream explore` - Interactive mode to drill into specific commits
7. `upstream merge [--strategy merge|rebase]` - Perform sync with chosen strategy
8. `upstream verify` - Run post-merge tests

### Phase 3: Polish
9. Integration with `/gsd:health` for stale sync detection
10. STATE.md logging of sync events
11. Clear rollback instructions in case of problems

### Why This Order

1. **Fetch/status first** - Users need visibility before action
2. **Conflict preview** - Biggest pain point is surprise conflicts
3. **Grouping/explore** - Differentiator that adds real value
4. **Merge last** - Most dangerous operation, should be well-informed

### Defer

- **Selective sync/cherry-pick** - Too many edge cases for v1.1
- **Multi-remote** - Niche use case
- **Scheduled sync** - Against GSD session-based design

---

## Expected Behaviors by Command

### `upstream fetch`
- Fetches from upstream remote
- Reports number of new commits
- Updates local tracking refs
- Does NOT modify working tree
- Idempotent - safe to run multiple times

### `upstream analyze`
- Groups commits by primary directory touched
- Identifies commits touching GSD customizations
- Outputs structured JSON for tooling
- Highlights breaking changes (major version bumps, deprecations)

### `upstream explore`
- Interactive TUI or prompted workflow
- Show commit, let user drill into diffs
- Support: next, prev, show-diff, skip, done
- Remember exploration state if interrupted

### `upstream merge`
- Check for uncommitted changes first (block if dirty)
- Preview conflicts BEFORE attempting
- Support `--strategy merge` (default) or `--strategy rebase`
- Create descriptive merge commit message
- Trigger post-merge verification automatically

### `upstream verify`
- Run test suite (npm test, pytest, etc.)
- Check for broken imports/references
- Report verification status
- Block finalization if verification fails

---

## Complexity Assessment

| Feature | Complexity | Risk | Notes |
|---------|------------|------|-------|
| Upstream remote config | Low | Low | Git handles it |
| Fetch and status | Low | Low | Git commands, parsing output |
| Commit grouping | Medium | Medium | Need heuristics for grouping |
| Conflict preview | Medium | Low | `git merge-tree` is reliable |
| Interactive explore | Medium | Medium | UX design challenge |
| Merge execution | Low | Medium | Git merge, but error handling matters |
| Post-merge verify | Low | Low | Reuses existing patterns |

---

## Sources

- [GitHub Docs - Syncing a fork](https://docs.github.com/articles/syncing-a-fork) - Official GitHub guidance
- [Atlassian Git Tutorial - Upstreams and Forks](https://www.atlassian.com/git/tutorials/git-forks-and-upstreams) - Comprehensive fork workflow guide
- [Atlassian - Merging vs Rebasing](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) - Strategy tradeoffs
- [GitHub Desktop Issue #4588](https://github.com/desktop/desktop/issues/4588) - Discussion on conflict detection before merge
- [git-merge-tree Documentation](https://git-scm.com/docs/git-merge-tree) - Pre-merge conflict detection
- [Atlassian - Cherry Pick](https://www.atlassian.com/git/tutorials/cherry-pick) - When to use cherry-pick vs merge
- [Aviator Blog - Pre and Post-Merge Tests](https://www.aviator.co/blog/pre-and-post-merge-tests-using-a-merge-queue/) - Testing strategies
- [Git Shortlog Documentation](https://git-scm.com/docs/git-shortlog) - Commit grouping by author
- [GitHub Community Discussion #153608](https://github.com/orgs/community/discussions/153608) - Fork sync best practices

---

*Feature landscape analysis for upstream sync: 2026-02-23*
