# Project Research Summary

**Project:** GSD v1.1 - Upstream Sync Tooling
**Domain:** Fork maintenance and upstream synchronization for AI-assisted workflows
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

Upstream sync tooling for fork maintenance requires NO new runtime dependencies. All capabilities are achievable using native Git CLI commands (plumbing + porcelain), existing Node.js built-ins, and established GSD patterns. The recommended approach creates a new `lib/upstream.cjs` module following the proven `worktree.cjs` / `health.cjs` pattern, with new gsd-tools subcommands (`upstream fetch`, `upstream analyze`, `upstream conflicts`, `upstream merge`) and a `/gsd:sync-upstream` workflow.

The key insight from research is that upstream sync is about **informed decision-making**, not automation. Fork maintainers need to understand what changed upstream, predict conflicts, and verify merges worked. Table stakes features (configure, fetch, status, merge) replicate manual git workflows; the differentiators that justify the tooling are: commit grouping by feature/area, pre-merge conflict preview using `git merge-tree`, interactive exploration mode, and post-merge verification integration. The design explicitly avoids anti-features like automatic scheduled sync, multi-remote support, and automatic conflict resolution.

The primary risks are: (1) sync destroying custom fork enhancements (mitigated by safe defaults, backup branches, merge-not-reset approach), (2) merge conflicts in customized files (mitigated by pre-merge conflict detection, rename tracking), (3) partial sync corruption (mitigated by atomic operations with rollback), and (4) interaction with active worktrees (mitigated by worktree awareness and coordination). The existing `state-merge.cjs` is NOT suitable for upstream syncs - it's designed for worktree-to-main merges and needs a separate upstream merge strategy.

## Key Findings

### Recommended Stack

The stack requires no additions - all capabilities use existing GSD infrastructure plus native Git commands.

**Core Git Commands (all available in Git 2.17+, already required by GSD):**
- `git remote add/set-url upstream <url>` - Configure upstream remote
- `git fetch upstream` - Fetch upstream commits
- `git rev-list --count HEAD..upstream/main` - Behind/ahead counts
- `git merge-tree --write-tree HEAD upstream/main` - Conflict preview (Git 2.38+, with legacy fallback)
- `git log --format=<fmt> main..upstream/main` - Commit analysis
- `git merge upstream/main --no-ff` - Perform merge

**New Module:** `lib/upstream.cjs` following existing patterns
- Export pure functions for each operation
- CLI interface via gsd-tools.cjs routing
- No dependencies on gsd-tools.cjs internals
- Testable in isolation

**Integration Points:**
- Reuse `execGit(cwd, args)` helper from gsd-tools.cjs
- Store config in `.planning/config.json` under new `upstream` section
- Log sync events to STATE.md Implementation Notes section

### Expected Features

**Table Stakes (must have for v1.1):**
| Feature | Complexity | Notes |
|---------|------------|-------|
| Upstream remote configuration | Low | Git handles it |
| Fetch upstream commits | Low | Standard git fetch |
| Behind/ahead status | Low | `git rev-list --count` |
| Commit log from upstream | Low | `git log` with custom format |
| Basic merge operation | Low | `git merge upstream/main` |
| Pre-merge conflict detection | Medium | `git merge-tree` is reliable |
| Post-merge test execution | Low | Reuses existing `/gsd:verify-work` |

**Differentiators (v1.1 scope):**
| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Commit grouping by feature/area | See related changes together instead of chronological wall | Medium |
| Interactive explore mode | Deep dive into specific changes before merge decision | Medium |
| Pre-merge conflict preview | Know exactly what conflicts BEFORE attempting merge | Medium |
| Post-merge verification suite | Run existing GSD verify-work patterns | Low |

**Defer to v2+:**
- Selective sync / cherry-pick workflow (too many edge cases)
- Multi-remote sync (rarely needed, explosion of edge cases)
- Automatic scheduled sync (GSD is session-based)
- Smart merge strategy recommendation (needs more usage data)

### Architecture Approach

The architecture follows existing GSD patterns exactly: command -> workflow -> gsd-tools -> lib module.

**New Components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `upstream.cjs` | `get-shit-done/bin/lib/` | Core sync operations |
| `sync-upstream.md` | `commands/gsd/` | Command entry point |
| `sync-upstream.md` | `get-shit-done/workflows/` | Orchestration workflow |

**Modified Components:**
| Component | Changes |
|-----------|---------|
| `gsd-tools.cjs` | Add `upstream` command routing (~30 lines) |
| `config.json` schema | Add `upstream` section |
| `STATE.md` | Add sync tracking in Implementation Notes |

**Component Boundaries:**
- `lib/upstream.cjs` executes git commands and returns structured data
- Workflow orchestrates steps and handles user decisions
- Workflow handles checkpoints, module does not make decisions

**Anti-Patterns to Avoid:**
- Direct git commands in workflows (always go through gsd-tools)
- Module-level state (use file-based state via config.json)
- Agent doing everything (agents analyze, workflows execute)

### Critical Pitfalls

**1. Sync Destroys Custom Enhancements (CRITICAL)**
- **Risk:** User loses months of customizations via `reset --hard`
- **Prevention:** Never use reset by default. Auto-create `backup/pre-sync-{timestamp}` branch. Default to merge strategy. Show diff summary before executing.
- **Phase:** Address in Phase 1

**2. Merge Conflicts in Customized Files (CRITICAL)**
- **Risk:** 20+ file conflicts with no guidance on resolution
- **Prevention:** Pre-merge conflict check via `git merge-tree`. Categorize conflicts. Show which files conflict and type BEFORE merge.
- **Phase:** Address in Phase 2

**3. Rename/Delete Conflicts Break Auto-Merge (CRITICAL)**
- **Risk:** Upstream renames file that fork modified; Git sees delete+create, not rename+modify
- **Prevention:** Detect renames explicitly with `--find-renames`. Map which files fork modified. Interactive rename handling.
- **Phase:** Address in Phase 2

**4. Partial Sync Leaves Repository Corrupted (CRITICAL)**
- **Risk:** User abandons merge partway; repo stuck in merge state
- **Prevention:** Atomic operations with rollback. Check for `.git/MERGE_HEAD` before sync. Provide `sync --abort` command.
- **Phase:** Address in Phase 3

**5. Upstream Force Push Breaks History (CRITICAL)**
- **Risk:** Upstream rewrites history; fork tracking becomes inconsistent
- **Prevention:** Track upstream commit SHA. Detect force push before sync. Warn and provide rebase-based recovery.
- **Phase:** Address in Phase 1

**6. STATE.md Merge Conflicts with Worktree System (MODERATE)**
- **Risk:** Existing `state-merge.cjs` designed for worktree merges, not upstream syncs
- **Prevention:** Create separate upstream merge strategy. Fork state generally wins. Don't reuse worktree merge code.
- **Phase:** Address in Phase 3

**7. Sync During Active Phase Execution (MODERATE)**
- **Risk:** Sync modifies main while worktree is active; finalize-phase has unexpected conflicts
- **Prevention:** Check for active worktrees before sync. Warn user. Offer to update worktree bases after sync.
- **Phase:** Address in Phase 4

## Implications for Roadmap

Based on combined research, the suggested phase structure follows dependencies and risk mitigation order.

### Phase 1: Core Sync Infrastructure

**Rationale:** Foundation must exist before any sync operations. Safe defaults prevent the most dangerous pitfalls (data loss). Force push detection catches history issues early.

**Delivers:**
- `lib/upstream.cjs` module with core functions
- `upstream configure <url>` command
- `upstream status` command (behind/ahead, last sync)
- `upstream fetch` command with commit counting
- Pre-sync backup branch creation
- Force push detection
- New `upstream` section in config.json

**From FEATURES:** Upstream remote config, fetch, behind/ahead status (table stakes)

**Avoids Pitfalls:** #1 (safe defaults), #5 (force push detection), #7 (clear UX for fetch vs merge)

**Research Needed:** None - standard git patterns, well-documented

### Phase 2: Analysis and Conflict Detection

**Rationale:** Users need visibility before action. Conflict preview is the biggest differentiator - eliminates surprise conflicts.

**Delivers:**
- `upstream log` command with commit grouping by directory/scope
- `upstream analyze` command for structured JSON output
- `upstream conflicts` command using `git merge-tree`
- Rename detection and mapping
- Binary file conflict flagging
- Conventional commit parsing

**From FEATURES:** Commit log, commit grouping by feature/area, pre-merge conflict preview (differentiators)

**Avoids Pitfalls:** #2 (pre-merge conflict check), #3 (rename detection), #8 (binary handling)

**Research Needed:** Commit grouping heuristics may need iteration during planning

### Phase 3: Merge Execution

**Rationale:** Most dangerous operation comes after users are fully informed. Atomic operations with rollback prevent corruption.

**Delivers:**
- `upstream merge` command with pre-checks
- Atomic merge with rollback on failure
- `upstream abort` command for recovery
- Clean working tree validation
- Descriptive merge commit messages
- STATE.md sync logging (separate from worktree merge logic)
- Integration with `/gsd:verify-work` for post-merge validation

**From FEATURES:** Basic merge, post-merge verification (table stakes + differentiator)

**Avoids Pitfalls:** #4 (atomic operations), #6 (separate state strategy)

**Research Needed:** STATE.md upstream merge strategy needs careful design

### Phase 4: Integration and Polish

**Rationale:** Coordination with existing features and polish comes after core functionality is stable.

**Delivers:**
- `/gsd:sync-upstream` command and workflow
- Interactive explore mode for commit deep-dive
- Worktree awareness (check for active worktrees before sync)
- `/gsd:health` integration for stale sync detection
- Rollback instructions and recovery documentation
- `--limit N` and `--since DATE` options for large repos

**From FEATURES:** Interactive explore mode (differentiator), health integration, worktree coordination

**Avoids Pitfalls:** #11 (worktree awareness)

**Research Needed:** Interactive explore mode UX design

### Phase Ordering Rationale

1. **Infrastructure first:** All other phases depend on configured upstream and safe defaults
2. **Analysis before merge:** Users must understand changes before committing to merge
3. **Merge is dangerous:** Most destructive operation gets most preparation
4. **Integration last:** Workflow orchestration and polish need stable foundation

### Research Flags

**Phases needing `/gsd:research-phase` during planning:**
- **Phase 2:** Commit grouping heuristics - how to cluster commits by "feature" when not all follow conventional commits
- **Phase 3:** STATE.md upstream merge strategy - enumerate scenarios where fork and upstream both changed structure
- **Phase 4:** Interactive explore mode - UX patterns for commit exploration

**Phases with standard patterns (skip research):**
- **Phase 1:** Git remote/fetch commands are well-documented; config.json extension follows existing pattern

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All native Git commands, official documentation, no new dependencies |
| Features | HIGH | Clear table stakes vs differentiators; anti-features explicitly defined |
| Architecture | HIGH | Follows existing GSD patterns exactly; reference modules exist |
| Pitfalls | HIGH | Verified with Git docs, GitHub community discussions, GSD codebase analysis |

**Overall confidence:** HIGH

### Gaps to Address

1. **Commit grouping heuristics:** How to group commits when conventional commit format isn't used? Fallback to primary directory touched, but may need iteration.

2. **STATE.md upstream merge:** The existing `state-merge.cjs` has sophisticated section strategies for worktree merges. Need to define what "upstream merge" means for STATE.md - likely fork sections win, but structural migrations need handling.

3. **Large repo performance:** Research shows pagination needed for 10K+ commits. Defer to Phase 4 `--limit` and `--since` options, but validate during Phase 2 implementation.

4. **Interactive explore mode UX:** Per PROJECT.md this is a required feature, but specific interaction patterns need design during Phase 4 planning.

## Sources

### Authoritative (HIGH Confidence)

**Git Documentation:**
- [git-merge-tree](https://git-scm.com/docs/git-merge-tree) - Conflict detection
- [git-rev-list](https://git-scm.com/docs/git-rev-list) - Commit range filtering
- [git-shortlog](https://git-scm.com/docs/git-shortlog) - Commit grouping
- [git-diff-tree](https://git-scm.com/docs/git-diff-tree) - File changes per commit
- [git-merge](https://git-scm.com/docs/git-merge) - Merge operations
- [remembering-renames](https://git-scm.com/docs/remembering-renames) - Rename handling
- [Advanced Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging) - Merge patterns

**GitHub Documentation:**
- [Syncing a fork](https://docs.github.com/articles/syncing-a-fork) - Standard workflow

**GSD Codebase:**
- `gsd-tools.cjs` - Command structure, `execGit()` pattern
- `lib/worktree.cjs` - Module structure pattern
- `lib/health.cjs` - Complex logic module pattern
- `state-merge.cjs` - Section merge strategies (NOT for upstream, but reference)

### Community Patterns (MEDIUM Confidence)

- [Atlassian - Git Upstreams and Forks](https://www.atlassian.com/git/tutorials/git-forks-and-upstreams) - Workflow guide
- [Atlassian - Merging vs Rebasing](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) - Strategy tradeoffs
- [Happy Git - Get upstream changes](https://happygitwithr.com/upstream-changes) - Fork workflow
- [Conventional Commits Regex](https://gist.github.com/marcojahn/482410b728c31b221b70ea6d2c433f0c) - Commit parsing
- [GitHub Discussion #153608](https://github.com/orgs/community/discussions/153608) - Fork sync best practices
- [GitHub Discussion #46271](https://github.com/orgs/community/discussions/46271) - Undoing sync problems
- [git rebase: what can go wrong?](https://jvns.ca/blog/2023/11/06/rebasing-what-can-go-wrong-/) - Strategy pitfalls
- [Resolve Merge Conflicts with Binary Files](https://www.hannaliebl.com/blog/resolve-merge-conflict-with-binary-files/) - Binary handling

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
