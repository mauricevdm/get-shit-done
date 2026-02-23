# Technology Stack: Upstream Sync Tooling

**Project:** GSD v1.1 - Upstream Sync
**Researched:** 2026-02-23
**Focus:** Stack additions/changes for upstream sync features

## Executive Summary

Upstream sync tooling requires NO new runtime dependencies. All capabilities can be implemented using:
1. Native git CLI commands (plumbing + porcelain)
2. Existing Node.js built-ins (`child_process`, `fs`)
3. Existing GSD patterns from `gsd-tools.cjs`

The key insight: Git already provides all the primitives needed for upstream sync. The work is in orchestrating git commands and parsing their output into actionable UX.

**Recommendation:** Add new commands to `gsd-tools.cjs` using the existing `execGit()` helper. Create a new `lib/upstream.cjs` module following the `worktree.cjs` / `health.cjs` pattern.

---

## Recommended Stack

### Core Git Commands (No Changes Needed)

These git commands form the foundation. All are available in Git 2.17+ (already required by GSD).

| Command | Purpose | Output Format | Confidence |
|---------|---------|---------------|------------|
| `git remote add upstream <url>` | Configure upstream | Exit code | HIGH |
| `git fetch upstream` | Fetch upstream commits | Summary text | HIGH |
| `git rev-list main..upstream/main` | List commits to sync | Hash per line | HIGH |
| `git log --format=<fmt>` | Commit details | Custom format | HIGH |
| `git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main` | Conflict preview | Conflict markers | HIGH |
| `git diff --stat main..upstream/main` | Changed files summary | Stat output | HIGH |
| `git merge upstream/main --no-ff` | Perform merge | Merge result | HIGH |
| `git shortlog -s --group=author main..upstream/main` | Group by author | Count + author | HIGH |

**Source:** [Git Documentation](https://git-scm.com/docs) - verified current as of 2026-02

### New GSD Module: `lib/upstream.cjs`

Following the established pattern from `worktree.cjs` and `health.cjs`:

| Component | Purpose | Pattern Reference |
|-----------|---------|-------------------|
| `cmdUpstreamConfigure` | Set up upstream remote | Similar to `cmdWorktreeInit` |
| `cmdUpstreamStatus` | Show behind/ahead count | Uses `git rev-list --count` |
| `cmdUpstreamFetch` | Fetch and report new commits | Uses `execGit` wrapper |
| `cmdUpstreamAnalyze` | Parse commits into groups | New logic, outputs JSON |
| `cmdUpstreamConflicts` | Preview conflicts pre-merge | Uses `git merge-tree` |
| `cmdUpstreamMerge` | Execute merge with validation | Uses `git merge` |

**Integration:** Module exports functions consumed by main `gsd-tools.cjs` command router.

### Git Plumbing for Conflict Detection

The `git merge-tree` command (modern `--write-tree` mode, Git 2.38+) enables conflict preview without touching the working tree.

```bash
# Modern syntax (Git 2.38+)
git merge-tree --write-tree HEAD upstream/main

# Legacy fallback (Git 2.17+)
git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main
```

**Output parsing:**
- Exit code 0 = clean merge possible
- Exit code 1 = conflicts exist
- Stdout contains tree OID and conflict file list

**Confidence:** HIGH - Verified via [git-merge-tree documentation](https://git-scm.com/docs/git-merge-tree)

### Commit Analysis Strategy

#### Grouping Commits by Directory

Git doesn't have built-in commit grouping by file/directory. Implement via `git log` with custom format:

```bash
# Get commits with primary directory touched
git log --format="%H" main..upstream/main | while read hash; do
  primary_dir=$(git diff-tree --no-commit-id --name-only -r "$hash" | cut -d/ -f1 | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
  echo "$hash:$primary_dir"
done
```

**Alternative:** Use `--name-only` and parse in JavaScript for better control.

**Confidence:** MEDIUM - Custom implementation, but uses stable git primitives

#### Conventional Commit Parsing

For commit messages following conventional commits format, use regex parsing:

```javascript
// Pattern for conventional commits
const conventionalPattern = /^(?<type>\w+)(?:\((?<scope>[^()]+)\))?(?<breaking>!)?:\s*(?<description>.+)/;
```

**Source:** [Conventional Commits Regex (GitHub Gist)](https://gist.github.com/marcojahn/482410b728c31b221b70ea6d2c433f0c)

**Confidence:** HIGH - Well-established pattern, works with existing GSD commit conventions

---

## Integration Points with Existing GSD Code

### Existing Patterns to Reuse

| Pattern | Location | How to Reuse |
|---------|----------|--------------|
| `execGit(cwd, args)` | gsd-tools.cjs:243 | Use for all git command execution |
| `loadConfig(cwd)` | gsd-tools.cjs:178 | Check for upstream sync settings |
| `output(data, raw, plaintext)` | Throughout | Consistent JSON/human output |
| `error(message)` | Throughout | Consistent error handling |
| Module structure | lib/worktree.cjs | Follow export pattern |
| State persistence | STATE.md patterns | Log sync events |

### New Config Fields

Add to `.planning/config.json`:

```json
{
  "upstream": {
    "remote_name": "upstream",
    "remote_url": null,
    "default_branch": "main",
    "merge_strategy": "merge",
    "auto_verify": true
  }
}
```

**Confidence:** HIGH - Follows existing config.json structure

### STATE.md Integration

Track upstream sync state in Implementation Notes section:

```markdown
## Implementation Notes
- [2026-02-23] Upstream sync: Merged 15 commits from upstream/main (abc123..def456)
```

---

## Git Commands by Feature

### Feature: `upstream configure <url>`

```bash
git remote add upstream "$URL" 2>/dev/null || git remote set-url upstream "$URL"
git fetch upstream --tags
```

### Feature: `upstream status`

```bash
# Behind count (commits upstream has that we don't)
git rev-list --count HEAD..upstream/main

# Ahead count (commits we have that upstream doesn't)
git rev-list --count upstream/main..HEAD

# Last sync (when upstream/main was last fetched)
git log -1 --format="%ci" upstream/main
```

### Feature: `upstream log` (grouped)

```bash
# Raw commit data in parseable format
git log --format="COMMIT:%H%nAUTHOR:%an%nDATE:%ci%nSUBJECT:%s%nFILES:" main..upstream/main
git diff-tree --no-commit-id --name-only -r <hash>
```

Parse output in JavaScript to group by:
1. Primary directory (most files touched)
2. Conventional commit type (feat, fix, docs, etc.)
3. Author

### Feature: `upstream conflicts`

```bash
# Modern (Git 2.38+) - preferred
git merge-tree --write-tree HEAD upstream/main

# Exit code: 0 = clean, 1 = conflicts
# Output: <tree-oid>\n<conflicted-file-info>
```

Parse output:
```javascript
const result = execGit(cwd, ['merge-tree', '--write-tree', 'HEAD', 'upstream/main']);
const lines = result.stdout.split('\n');
const treeOid = lines[0];
const hasConflicts = result.exitCode !== 0;
const conflictedFiles = lines.slice(1).filter(l => l.includes('CONFLICT'));
```

### Feature: `upstream merge`

```bash
# Pre-checks
git diff --quiet || error "Working tree not clean"
git diff --cached --quiet || error "Index not clean"

# Fetch latest
git fetch upstream

# Merge with descriptive message
git merge upstream/main --no-ff -m "sync: Merge upstream changes

Commits merged: $(git rev-list --count HEAD..upstream/main)
Range: $(git rev-parse --short HEAD)..$(git rev-parse --short upstream/main)"
```

---

## What NOT to Add

### No External Dependencies

GSD constraint: zero runtime dependencies. These are explicitly rejected:

| Library | Why Tempting | Why Rejected |
|---------|--------------|--------------|
| `simple-git` | Nice Promise API | Runtime dependency |
| `parse-diff` | Easy diff parsing | Runtime dependency |
| `conventional-commits-parser` | Commit message parsing | Runtime dependency |
| `isomorphic-git` | Pure JS git | Runtime dependency, massive |
| `nodegit` | Native bindings | Native dependency, complex |

**Instead:** Parse git output directly. Git's `--porcelain` and format options provide stable, machine-readable output.

### No New Binary Tools

| Tool | Why Tempting | Why Rejected |
|------|--------------|--------------|
| `gh` (GitHub CLI) | PR creation | Adds GitHub dependency to git tool |
| `delta` | Pretty diffs | Not available everywhere |
| `tig` | Interactive git | TUI complexity |

**Instead:** Use standard git commands. Let users invoke `gh` separately if needed.

### No Database/Persistence

| Approach | Why Tempting | Why Rejected |
|----------|--------------|--------------|
| SQLite for commit cache | Fast repeat queries | Runtime dependency |
| Redis for state | Shared state across sessions | Overkill, external service |

**Instead:** Use existing STATE.md and ephemeral JSON output. Git is the source of truth.

---

## Version Requirements

| Component | Minimum Version | Required For | Check Command |
|-----------|-----------------|--------------|---------------|
| Git | 2.17 | `worktree --lock` | `git --version` |
| Git | 2.38 | `merge-tree --write-tree` | (falls back gracefully) |
| Node.js | 18.0 | Built-in fetch, modern APIs | `node --version` |

**Fallback strategy:** If `git merge-tree --write-tree` fails (Git < 2.38), use legacy three-tree syntax:
```bash
git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main
```

---

## Implementation Roadmap

### Phase 1: Core Module Structure

1. Create `lib/upstream.cjs` following `worktree.cjs` pattern
2. Add upstream command routing to `gsd-tools.cjs`
3. Implement `cmdUpstreamConfigure`, `cmdUpstreamStatus`

### Phase 2: Analysis Commands

4. Implement `cmdUpstreamFetch` with commit counting
5. Implement `cmdUpstreamAnalyze` with grouping logic
6. Implement `cmdUpstreamConflicts` using merge-tree

### Phase 3: Merge Operations

7. Implement `cmdUpstreamMerge` with pre-checks
8. Add STATE.md logging for sync events
9. Integration with `/gsd:verify-work` for post-merge validation

---

## Sources

### Authoritative (HIGH Confidence)

- [Git Documentation - git-merge-tree](https://git-scm.com/docs/git-merge-tree) - Conflict detection
- [Git Documentation - git-rev-list](https://git-scm.com/docs/git-rev-list) - Commit range filtering
- [Git Documentation - git-shortlog](https://git-scm.com/docs/git-shortlog) - Commit grouping
- [Git Documentation - git-diff-tree](https://git-scm.com/docs/git-diff-tree) - File changes per commit
- [GitHub Docs - Syncing a fork](https://docs.github.com/articles/syncing-a-fork) - Standard workflow

### Community Patterns (MEDIUM Confidence)

- [Atlassian - Git Upstreams and Forks](https://www.atlassian.com/git/tutorials/git-forks-and-upstreams) - Workflow guide
- [Conventional Commits Regex](https://gist.github.com/marcojahn/482410b728c31b221b70ea6d2c433f0c) - Commit parsing
- [GitHub Community - Fork Sync Best Practices](https://github.com/orgs/community/discussions/153608) - Community discussion

### Existing GSD Code (HIGH Confidence)

- `gsd-tools.cjs` - Command structure, `execGit()` pattern
- `lib/worktree.cjs` - Module structure pattern
- `lib/health.cjs` - Complex logic module pattern

---

*Stack research for upstream sync: 2026-02-23*
