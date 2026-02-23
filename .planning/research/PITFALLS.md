# Domain Pitfalls: Upstream Sync Tooling for GSD Forks

**Domain:** Fork management with upstream synchronization
**Researched:** 2026-02-23
**Confidence:** HIGH (verified with Git official docs, multiple community sources, and GSD codebase analysis)
**Context:** Adding upstream sync features to existing GSD fork that already has worktree isolation

## Critical Pitfalls

Mistakes that cause data loss, break the fork, or require significant rework.

### Pitfall 1: Sync Destroys Custom Enhancements

**What goes wrong:** User runs sync command and their months of custom GSD modifications disappear. The sync operation treats upstream as authoritative and overwrites local changes.

**Why it happens:** Many sync approaches use `git reset --hard upstream/main` which discards all local commits. Users expect "sync" to mean "integrate" not "replace." The GitHub "Sync fork" button performs a merge that can silently lose changes if conflicts aren't handled.

**Consequences:**
- Custom commands, workflows, and agents gone
- No obvious way to recover (commits not on remote)
- User trust in tooling destroyed
- May need to reconstruct work from memory or backups

**Prevention:**
- **Never use `reset --hard` by default** - Require explicit `--force` flag with scary warning
- **Pre-sync backup branch** - Automatically create `backup/pre-sync-{timestamp}` before any destructive operation
- **Default to merge/rebase** - Use `git merge upstream/main` or `git rebase upstream/main` which preserve local commits
- **Conflict detection before action** - Check for divergence and warn: "Your fork has 15 commits not in upstream. Continue?"
- **Show what will change** - Display diff summary before executing sync

**Detection:**
- `git log --oneline --left-right main...upstream/main` shows `<` commits (local-only)
- Custom modifications exist in tracked files
- Fork is "ahead" of upstream in GitHub UI

**Phase to address:** Phase 1 (Core Sync Infrastructure) - safe defaults with explicit destructive mode

**Sources:**
- [GitHub Docs - Syncing a fork](https://docs.github.com/articles/syncing-a-fork)
- [Happy Git - Get upstream changes for a fork](https://happygitwithr.com/upstream-changes)
- [GitHub Discussion #46271](https://github.com/orgs/community/discussions/46271) - Users losing work from sync

---

### Pitfall 2: Merge Conflicts in Customized Files

**What goes wrong:** Upstream modifies the same files the fork customized. Merge fails with conflicts in 20+ files. User doesn't know how to resolve conflicts in GSD's complex markdown prompts.

**Why it happens:** Common files attract changes from both sides: `README.md`, `commands/gsd/*.md`, `workflows/*.md`, configuration files. Upstream refactors file structure. Fork adds new sections to existing templates.

**Consequences:**
- Sync blocked until conflicts resolved
- User may incorrectly resolve conflicts (losing upstream improvements OR local customizations)
- Partial resolution leaves inconsistent state
- May need GSD expertise to resolve semantic conflicts

**Prevention:**
- **Pre-merge conflict check** - Run `git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main` before attempting merge
- **Categorize conflicts** - Separate "your customizations vs their changes" from "both added different things"
- **Conflict preview** - Show which files conflict and what type BEFORE starting merge
- **Staged resolution** - Handle conflicts one file at a time with clear options
- **Escape hatch** - Always provide `--abort` to restore clean state

**Detection:**
- `git merge --no-commit --no-ff upstream/main` then check status
- Files appear in both `git diff HEAD...upstream/main` and `git diff $(git merge-base HEAD upstream/main)...HEAD`

**Phase to address:** Phase 2 (Conflict Detection) - comprehensive pre-flight checks

**Sources:**
- [Git Advanced Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging)
- [Handling Merge Conflicts in Git](https://www.geeksforgeeks.org/git/merge-conflicts-and-how-to-handle-them/)

---

### Pitfall 3: Rename/Delete Conflicts Break Auto-Merge

**What goes wrong:** Upstream renames `workflows/execute.md` to `workflows/execute-phase.md`. Fork modified the original file. Git doesn't know the file moved - sees delete + create, not rename + modify. Auto-merge produces wrong result or fails mysteriously.

**Why it happens:** Git's rename detection is heuristic-based (content similarity). Heavily modified files may not be detected as renames. Delete/modify conflicts have no obvious "right" resolution. User sees conflict in file that "shouldn't exist anymore."

**Consequences:**
- Fork ends up with both old and new versions
- Or fork loses changes that were in the "deleted" file
- Or changes get applied to wrong file
- Confusing error messages ("CONFLICT (modify/delete)")

**Prevention:**
- **Detect renames explicitly** - Use `git diff --find-renames --diff-filter=R` to identify upstream renames
- **Map customizations** - Track which files fork has modified (can compare against base commit)
- **Warn on path conflicts** - If upstream renamed a file that fork modified, flag for manual review
- **Interactive rename handling** - "Upstream renamed X to Y. Apply your changes to Y?"

**Detection:**
- `git diff --find-renames upstream/main^..upstream/main --diff-filter=R` shows renames
- Compare against list of fork-modified files

**Phase to address:** Phase 2 (Conflict Detection) - special handling for rename/delete cases

**Sources:**
- [Git - remembering-renames Documentation](https://git-scm.com/docs/remembering-renames)
- [TIL How to resolve Git rebase conflicts on renamed files](https://til.codeinthehole.com/posts/how-to-resolve-git-conflicts-on-renamed-files/)

---

### Pitfall 4: Partial Sync Leaves Repository Corrupted

**What goes wrong:** Merge starts, conflicts occur, user tries to continue but gives up partway. Repository is now in merge state. Other git operations fail. State files may be half-updated.

**Why it happens:** Merge operations are multi-step. User runs `git merge upstream/main`, sees conflicts, resolves some, gets stuck, closes terminal. `.git/MERGE_HEAD` exists. Running other commands gives confusing errors.

**Consequences:**
- Repository in unusable state until merge completed or aborted
- `git status` shows ongoing merge
- Can't switch branches or do other work
- STATE.md or other GSD files may be partially modified
- AI agents may write to wrong files or see inconsistent state

**Prevention:**
- **Atomic sync operations** - Either complete entirely or abort entirely (rollback pattern)
- **Pre-sync checkpoint** - Record exact state before sync starts
- **Merge state detection** - Check for `.git/MERGE_HEAD` before any sync operation
- **Cleanup command** - Provide `gsd-tools sync --abort` that safely restores pre-sync state
- **Lock during sync** - Prevent concurrent GSD operations during sync

**Detection:**
- `test -f .git/MERGE_HEAD` indicates merge in progress
- `git status` shows "You have unmerged paths"
- GSD health check should detect merge-in-progress state

**Phase to address:** Phase 3 (Sync Execution) - atomic operations with rollback

**Sources:**
- [Git - git-merge Documentation](https://git-scm.com/docs/git-merge)
- Existing GSD `health.cjs` already detects `MERGE_HEAD` (see line 312-324)

---

### Pitfall 5: Upstream Force Push Breaks History

**What goes wrong:** Upstream maintainer force-pushes `main` (rewrites history). Fork's tracking becomes inconsistent. Subsequent syncs produce strange results - duplicate commits, conflicts in files that shouldn't conflict, or worse.

**Why it happens:** Force pushes rewrite commit SHAs. Fork's reference to "last synced commit" becomes invalid. `git merge` may re-apply changes or conflict with itself. History diverges unpredictably.

**Consequences:**
- `git pull` fails with "refusing to merge unrelated histories"
- Duplicate commits appear in history
- Conflicts in files neither side changed recently
- "Already up to date" but files are clearly different
- Fork history may become permanently diverged

**Prevention:**
- **Track upstream commit SHA** - Store the upstream commit SHA that fork is based on
- **Detect force push** - Before sync, check if stored SHA is still an ancestor of `upstream/main`
- **Force push warning** - "Upstream appears to have rewritten history. This requires special handling."
- **Rebase-based recovery** - If force push detected, use `git rebase --onto upstream/main <old-sha> main`
- **Document recovery** - Provide clear instructions for force push scenarios

**Detection:**
- `git merge-base --is-ancestor <stored-sha> upstream/main` returns non-zero if force pushed
- `git log --oneline upstream/main | head -20` doesn't contain stored SHA

**Phase to address:** Phase 1 (Core Sync Infrastructure) - force push detection and handling

**Sources:**
- [Force your forked repo to be the same as upstream](https://gist.github.com/glennblock/1974465)
- [Syncing a fork - GitHub Docs](https://docs.github.com/articles/syncing-a-fork)

---

### Pitfall 6: STATE.md Merge Conflicts with Worktree Isolation

**What goes wrong:** Fork has worktree isolation (v1.0). Upstream also evolves STATE.md structure. During sync, STATE.md conflicts occur but the existing `state-merge.cjs` doesn't handle upstream as a merge source - it's designed for worktree-to-main merges only.

**Why it happens:** `state-merge.cjs` has section strategies (`SECTION_STRATEGIES`) designed for phase worktree merges. Upstream changes don't fit this model - upstream may add/remove sections, change structure. The three-way merge assumes specific roles for base/main/worktree.

**Consequences:**
- STATE.md merge fails or produces garbled output
- Section strategies apply incorrectly (e.g., "worktree-wins" for Session Continuity when there's no worktree)
- Lost state information from either upstream or fork
- Merge appears successful but STATE.md is invalid

**Prevention:**
- **Separate upstream merge strategy** - Don't reuse worktree merge logic for upstream syncs
- **Structural migration first** - If upstream changed STATE.md structure, migrate fork structure before content merge
- **Section presence validation** - Verify all expected sections exist after merge
- **Conservative merge for STATE.md** - Prefer keeping fork's state with option to review upstream changes
- **Backup fork STATE.md** - Always preserve fork's STATE.md before sync attempt

**Detection:**
- STATE.md validation fails after sync
- Missing sections in merged STATE.md
- `state-merge.cjs` throws unexpected errors during sync

**Phase to address:** Phase 3 (Sync Execution) - upstream-aware state merge strategy

**Sources:**
- GSD `state-merge.cjs` analysis (see `/Users/mauricevandermerwe/Projects/get-shit-done/get-shit-done/bin/state-merge.cjs`)

---

## Moderate Pitfalls

Issues that cause delays or confusion but are recoverable.

### Pitfall 7: Upstream Changes Not Visible After Fetch

**What goes wrong:** User runs `git fetch upstream` and expects to see changes, but `git diff` shows nothing. Upstream definitely changed. User thinks fetch failed or upstream sync is broken.

**Why it happens:** `fetch` only updates remote tracking branches (`upstream/main`), not local branches. User needs to run `git merge upstream/main` or `git diff HEAD...upstream/main`. Difference between fetch and merge not understood.

**Prevention:**
- **Combined operations** - Sync command should fetch + show changes + prompt for merge
- **Clear status output** - After fetch: "Fetched 5 new commits from upstream. Run 'gsd-tools sync --apply' to merge."
- **Diff against remote** - Always diff against `upstream/main`, not expecting local changes

**Detection:**
- `git rev-parse upstream/main` differs from `git rev-parse main`
- User confusion in logs/reports

**Phase to address:** Phase 1 (Core Sync Infrastructure) - clear UX for fetch vs merge

---

### Pitfall 8: Binary File Conflicts

**What goes wrong:** Fork modifies an image, diagram, or other binary file. Upstream also modifies it. Git cannot merge binary files - just shows conflict with no useful diff.

**Why it happens:** Binary files can't be line-merged. Git offers only "ours" or "theirs" choice. For GSD, this might affect: `assets/terminal.svg`, documentation images, or any generated files.

**Consequences:**
- Conflict resolution requires external tools
- Easy to accidentally lose one version
- No visibility into what changed in each version

**Prevention:**
- **Detect binary conflicts early** - Flag binary files in conflict preview
- **Side-by-side preview** - For images, show both versions (if possible)
- **Clear resolution options** - "Keep fork version" / "Take upstream version" / "Keep both as separate files"
- **Git LFS consideration** - If project uses LFS, handle accordingly

**Detection:**
- `git diff --binary` shows binary file changes
- `file <path>` shows file type

**Phase to address:** Phase 2 (Conflict Detection) - binary file handling

**Sources:**
- [Resolve Merge Conflicts with Binary Files](https://www.hannaliebl.com/blog/resolve-merge-conflict-with-binary-files/)

---

### Pitfall 9: Wrong Branch Synced

**What goes wrong:** Fork tracks multiple upstream branches. User runs sync expecting `main` but sync operates on different branch, or syncs the wrong remote entirely (origin vs upstream).

**Why it happens:** Remote naming conventions vary (`upstream`, `origin`, `parent`). Branch naming varies (`main`, `master`, `develop`). Configuration may point to wrong target. Auto-detection picks wrong default.

**Prevention:**
- **Explicit remote/branch specification** - `gsd-tools sync upstream/main` not just `gsd-tools sync`
- **Confirm before sync** - "Sync local 'main' with 'upstream/main'? [y/N]"
- **Validate remote exists** - Check `git remote -v` includes the target remote
- **Store sync configuration** - Remember last successful sync target

**Detection:**
- `git remote -v` shows remote configuration
- Compare intended target with actual

**Phase to address:** Phase 1 (Core Sync Infrastructure) - explicit targeting with confirmation

---

### Pitfall 10: Rebase Destroys Merge History

**What goes wrong:** User chooses rebase strategy for cleaner history. Rebase rewrites all fork commits. If fork was previously merged with upstream (has merge commits), rebase may fail or produce duplicates.

**Why it happens:** Rebase replays commits on new base. Merge commits don't rebase cleanly. Previous syncs that used merge now conflict with rebase approach. History becomes tangled.

**Consequences:**
- "Duplicate" commits in history
- Conflicts in files that shouldn't conflict
- Push requires `--force` (dangerous for shared forks)
- Mixed merge/rebase history is confusing

**Prevention:**
- **Consistent strategy** - Pick merge OR rebase and stick with it
- **Strategy recommendation** - For forks with customizations, merge is safer
- **Detect prior strategy** - Check for merge commits in fork history
- **Warn on strategy change** - "Fork has merge commits. Switching to rebase is not recommended."

**Detection:**
- `git log --merges main` shows merge commits
- User tries rebase after prior merges

**Phase to address:** Phase 1 (Core Sync Infrastructure) - strategy detection and guidance

**Sources:**
- [git rebase: what can go wrong?](https://jvns.ca/blog/2023/11/06/rebasing-what-can-go-wrong-/)

---

### Pitfall 11: Sync During Active Phase Execution

**What goes wrong:** User runs sync while a phase is being executed in a worktree. Sync modifies `main`. Worktree's base becomes stale. Merge at finalize-phase now has unexpected conflicts.

**Why it happens:** Sync and phase execution are independent operations. No coordination between them. User may not realize syncing affects active work. Main branch diverges while worktree branches based on old main.

**Consequences:**
- `finalize-phase` has more conflicts than expected
- STATE.md diverges in unexpected ways
- Work may need to be rebased onto new main
- Confusion about "what changed"

**Prevention:**
- **Check active worktrees before sync** - "Phase 3 is active in a worktree. Sync may cause conflicts at finalization. Continue?"
- **Lock sync during execution** - Optionally prevent sync while phases active
- **Post-sync worktree update** - Offer to update worktree bases after sync
- **Document interaction** - Clear guidance on sync timing

**Detection:**
- GSD registry shows active worktrees
- `loadRegistry(cwd).worktrees` has entries with status 'active'

**Phase to address:** Phase 4 (Integration) - coordination with worktree isolation

**Sources:**
- GSD `worktree.cjs` analysis

---

## Minor Pitfalls

Annoyances that can be worked around.

### Pitfall 12: Upstream Adds New Dependencies

**What goes wrong:** Upstream adds new npm/system dependencies. Fork syncs code but doesn't reinstall. Code runs with missing dependencies until user manually runs `npm install`.

**Prevention:**
- **Detect package.json changes** - After sync, check if dependency files changed
- **Prompt for reinstall** - "package.json changed. Run npm install? [Y/n]"
- **Post-sync hooks** - Option to auto-run dependency install

**Detection:**
- `git diff HEAD~1 -- package.json package-lock.json` shows changes

---

### Pitfall 13: Changelog Conflicts

**What goes wrong:** Both fork and upstream add entries to CHANGELOG.md. Always conflicts because both append to the same section.

**Prevention:**
- **Auto-resolve CHANGELOG** - Sort entries or keep both with deduplication
- **Separate fork changelog** - Consider FORK-CHANGELOG.md for fork-specific changes
- **Changelog merge strategy** - Union strategy that combines entries

**Detection:**
- CHANGELOG.md always conflicts on sync

---

### Pitfall 14: Upstream Removes Feature Fork Uses

**What goes wrong:** Upstream deprecates a feature or command that fork extended or depends on. Sync succeeds but fork functionality breaks.

**Prevention:**
- **Breaking change detection** - Compare file deletions against fork's modified files
- **Warn on removals** - "Upstream removed commands/gsd/old-command.md which fork modified"
- **Test after sync** - Recommend running fork's tests after sync

**Detection:**
- `git diff --diff-filter=D upstream/main^..upstream/main` shows deletions
- Cross-reference with fork modifications

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Core Sync Infrastructure | Destroying custom enhancements, force push handling | Safe defaults, backup branches, force push detection |
| Conflict Detection | Rename/delete confusion, binary files | Pre-flight checks, rename tracking, binary handling |
| Sync Execution | Partial sync corruption, STATE.md merge issues | Atomic operations, rollback, separate state strategies |
| Integration with Worktrees | Sync during active phase | Worktree awareness, coordination, timing guidance |
| Deep Dive Mode | User gets lost in change exploration | Clear navigation, escape hatches, scope limits |

## GSD-Specific Integration Considerations

Based on the existing GSD codebase:

1. **Worktree isolation interaction:** The existing worktree system assumes `main` is stable during phase execution. Upstream sync can change main, affecting all worktrees' merge base. Consider:
   - Block sync while worktrees active, OR
   - Auto-rebase worktree branches after sync, OR
   - Warn and let user decide

2. **STATE.md is special:** The `state-merge.cjs` has sophisticated section-based merge logic designed for worktree-to-main merges. This logic doesn't apply to upstream syncs. Need separate strategy:
   - Fork's state sections should generally win (local context)
   - Structural changes from upstream may need migration
   - Don't reuse worktree merge code

3. **Health system should detect sync issues:** Extend `health.cjs` to detect:
   - Stale upstream tracking
   - Diverged history needing attention
   - Failed sync attempts (backup branches exist)

4. **Registry considerations:** The worktree registry tracks phases. Consider adding:
   - Last sync timestamp
   - Upstream commit SHA synced from
   - Pending upstream changes count

5. **Command naming:** Follow existing GSD patterns:
   - `gsd-tools sync fetch` - fetch upstream changes
   - `gsd-tools sync status` - show divergence
   - `gsd-tools sync apply` - merge changes
   - `gsd-tools sync abort` - rollback failed sync

## Sources

- [GitHub Docs - Syncing a fork](https://docs.github.com/articles/syncing-a-fork) - HIGH confidence
- [Happy Git - Get upstream changes for a fork](https://happygitwithr.com/upstream-changes) - HIGH confidence
- [Git - Advanced Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging) - HIGH confidence
- [Git - git-merge Documentation](https://git-scm.com/docs/git-merge) - HIGH confidence
- [Git - remembering-renames Documentation](https://git-scm.com/docs/remembering-renames) - HIGH confidence
- [Git - Rerere](https://git-scm.com/book/en/v2/Git-Tools-Rerere) - MEDIUM confidence
- [Atlassian Git Tutorial - Merge Strategies](https://www.atlassian.com/git/tutorials/using-branches/merge-strategy) - MEDIUM confidence
- [Resolve Merge Conflicts with Binary Files](https://www.hannaliebl.com/blog/resolve-merge-conflict-with-binary-files/) - MEDIUM confidence
- [GitHub Discussion #22440](https://github.com/orgs/community/discussions/22440) - Sync leaving commits ahead - MEDIUM confidence
- [GitHub Discussion #46271](https://github.com/orgs/community/discussions/46271) - Undoing sync - MEDIUM confidence
- [git rebase: what can go wrong?](https://jvns.ca/blog/2023/11/06/rebasing-what-can-go-wrong-/) - MEDIUM confidence
- GSD codebase analysis: `state-merge.cjs`, `worktree.cjs`, `health.cjs` - HIGH confidence

---

*Pitfalls audit: 2026-02-23 | Focus: Upstream sync for existing GSD fork with worktree isolation*
