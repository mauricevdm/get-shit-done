---
phase: 06-analysis
plan: 04
type: execute
wave: 2
depends_on: [6-01, 6-02, 6-03]
files_modified:
  - get-shit-done/bin/gsd-tools.cjs
  - get-shit-done/commands/gsd/sync-analyze.md
  - get-shit-done/commands/gsd/sync-preview.md
  - get-shit-done/commands/gsd/sync-resolve.md
autonomous: true
requirements: [ANAL-01, ANAL-02, ANAL-03, ANAL-04]

must_haves:
  truths:
    - "gsd-tools upstream analyze command invokes cmdUpstreamAnalyze"
    - "gsd-tools upstream preview command invokes cmdUpstreamPreview"
    - "gsd-tools upstream resolve command invokes cmdUpstreamResolve"
    - "Workflow commands exist for /gsd:sync-analyze, /gsd:sync-preview, /gsd:sync-resolve"
  artifacts:
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "CLI routing for analyze, preview, resolve subcommands"
      contains: "subcommand === 'analyze'"
    - path: "get-shit-done/commands/gsd/sync-analyze.md"
      provides: "Workflow command for /gsd:sync-analyze"
      contains: "gsd-tools upstream analyze"
    - path: "get-shit-done/commands/gsd/sync-preview.md"
      provides: "Workflow command for /gsd:sync-preview"
      contains: "gsd-tools upstream preview"
    - path: "get-shit-done/commands/gsd/sync-resolve.md"
      provides: "Workflow command for /gsd:sync-resolve"
      contains: "gsd-tools upstream resolve"
  key_links:
    - from: "gsd-tools.cjs"
      to: "upstream.cjs"
      via: "upstreamModule.cmdUpstreamAnalyze"
      pattern: "upstreamModule\\.cmdUpstreamAnalyze"
    - from: "sync-analyze.md"
      to: "gsd-tools"
      via: "Bash tool"
      pattern: "node.*gsd-tools.*upstream analyze"
---

<objective>
Integrate Phase 6 analysis commands into gsd-tools CLI and create workflow command files

Purpose: Make the analysis functionality accessible to users through both the CLI (gsd-tools upstream analyze/preview/resolve) and GSD workflow commands (/gsd:sync-analyze, /gsd:sync-preview, /gsd:sync-resolve).

Output: Updated gsd-tools.cjs with three new subcommand routes, and three new workflow command files in commands/gsd/.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-analysis/6-01-SUMMARY.md
@.planning/phases/06-analysis/6-02-SUMMARY.md
@.planning/phases/06-analysis/6-03-SUMMARY.md
@get-shit-done/bin/gsd-tools.cjs
@get-shit-done/commands/gsd/sync-status.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add upstream subcommand routing to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Update the upstream case in gsd-tools.cjs command router to add analyze, preview, resolve:

1. Find the `case 'upstream':` block (around line 5096)
2. Add new subcommand handlers after the existing ones:

```javascript
} else if (subcommand === 'analyze') {
  const byFeature = args.includes('--by-feature');
  upstreamModule.cmdUpstreamAnalyze(cwd, { by_feature: byFeature }, output, error, raw);
} else if (subcommand === 'preview') {
  upstreamModule.cmdUpstreamPreview(cwd, {}, output, error, raw);
} else if (subcommand === 'resolve') {
  // Parse resolve options
  const ackIndex = args.indexOf('--ack');
  const acknowledge = ackIndex !== -1 ? parseInt(args[ackIndex + 1], 10) : null;
  const acknowledgeAll = args.includes('--ack-all');
  const status = args.includes('--status');
  const list = !acknowledge && !acknowledgeAll && !status;

  upstreamModule.cmdUpstreamResolve(cwd, {
    list,
    acknowledge,
    acknowledge_all: acknowledgeAll,
    status,
  }, output, error, raw);
}
```

3. Update the error message for unknown subcommand to include new commands:
```javascript
error('Unknown upstream subcommand. Available: configure, fetch, status, log, notification, analyze, preview, resolve');
```

4. Update the help text in the header comment (around line 56-60):
```javascript
 *   upstream analyze [--by-feature] Show commits grouped by directory or feature
 *   upstream preview                Preview conflicts and binary changes
 *   upstream resolve [--ack N]      Address structural conflicts (--ack-all, --status)
```
  </action>
  <verify>
Test CLI routing:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream analyze --help 2>&1 || true
# Should not error with "Unknown upstream subcommand"
node get-shit-done/bin/gsd-tools.cjs upstream preview --raw 2>&1 | head -5
node get-shit-done/bin/gsd-tools.cjs upstream resolve --status --raw 2>&1 | head -5
```
Commands should execute without "Unknown subcommand" errors.
  </verify>
  <done>gsd-tools routes upstream analyze/preview/resolve to upstream.cjs command functions</done>
</task>

<task type="auto">
  <name>Task 2: Create workflow command files</name>
  <files>get-shit-done/commands/gsd/sync-analyze.md, get-shit-done/commands/gsd/sync-preview.md, get-shit-done/commands/gsd/sync-resolve.md</files>
  <action>
Create three workflow command files following existing sync-status.md pattern:

**1. sync-analyze.md:**
```markdown
---
name: sync-analyze
description: Show upstream commits grouped by directory or feature
arguments:
  - name: by-feature
    description: Group by conventional commit type instead of directory
    required: false
---

# /gsd:sync-analyze

Show upstream commits organized by directory (default) or by feature type (--by-feature).

## Usage

```
/gsd:sync-analyze              # Group by directory (default)
/gsd:sync-analyze --by-feature # Group by conventional commit type
```

## What It Does

1. Fetches commit data from upstream
2. Groups commits by:
   - **Directory (default):** Which directories are affected (lib/, commands/, etc.)
   - **Feature (--by-feature):** Conventional commit types (feat, fix, refactor, etc.)
3. Shows multi-touch commits under each affected area

## Output

Directory grouping shows which parts of codebase changed:
- `lib/` — Core library changes
- `commands/` — New or modified commands
- `templates/` — Template updates

Feature grouping shows what kind of changes:
- Features — New capabilities
- Fixes — Bug corrections
- Refactors — Code improvements

## Implementation

```bash
node get-shit-done/bin/gsd-tools.cjs upstream analyze $ARGS
```
```

**2. sync-preview.md:**
```markdown
---
name: sync-preview
description: Preview merge conflicts and binary changes before sync
arguments: []
---

# /gsd:sync-preview

Preview what would happen if you merged upstream changes right now.

## Usage

```
/gsd:sync-preview
```

## What It Does

1. Uses `git merge-tree` to predict conflicts without modifying your working tree
2. Shows conflict regions with full `<<<<<<<`/`=======`/`>>>>>>>` markers
3. Assigns risk score: EASY, MODERATE, or HARD
4. Detects binary file changes and categorizes by risk level
5. Saves analysis state for /gsd:sync-resolve

## Output

- **Conflict Preview:** Files that would conflict, with regions shown
- **Risk Assessment:** Overall difficulty of the merge
- **Suggestions:** Context-aware advice based on conflict types
- **Binary Changes:** Safe (images), Review (archives), Dangerous (executables)

## Requirements

- Git 2.38+ for conflict preview (graceful fallback for older versions)
- Upstream configured via /gsd:sync-configure

## Implementation

```bash
node get-shit-done/bin/gsd-tools.cjs upstream preview
```
```

**3. sync-resolve.md:**
```markdown
---
name: sync-resolve
description: Address structural conflicts (renames/deletes) before merge
arguments:
  - name: ack
    description: Acknowledge conflict by number
    required: false
  - name: ack-all
    description: Acknowledge all conflicts at once
    required: false
  - name: status
    description: Show merge readiness status
    required: false
---

# /gsd:sync-resolve

Address rename and delete conflicts that require explicit acknowledgment before merge.

## Usage

```
/gsd:sync-resolve              # List all structural conflicts
/gsd:sync-resolve --ack 1      # Acknowledge conflict #1
/gsd:sync-resolve --ack-all    # Acknowledge all conflicts
/gsd:sync-resolve --status     # Check if ready to merge
```

## What It Does

1. Detects renames where upstream moved a file you modified
2. Detects deletes where upstream removed a file you modified
3. Shows similarity percentage for renames (e.g., "92% similar")
4. Shows your modifications that would be affected
5. Requires explicit acknowledgment before merge can proceed

## Why Acknowledgment?

Structural conflicts can cause silent data loss:
- **Rename:** Your changes in `old.cjs` won't automatically move to `new.cjs`
- **Delete:** Your additions to a deleted file will be lost

Acknowledgment ensures you've seen the warning and decided how to proceed.

## Workflow

1. Run `/gsd:sync-preview` to see all issues
2. Run `/gsd:sync-resolve` to see structural conflicts
3. For each conflict, decide:
   - Extract your changes first, or
   - Accept the loss
4. Run `/gsd:sync-resolve --ack N` for each reviewed conflict
5. Run `/gsd:sync-resolve --status` to confirm ready to merge

## Implementation

```bash
node get-shit-done/bin/gsd-tools.cjs upstream resolve $ARGS
```
```
  </action>
  <verify>
Verify files exist and have correct structure:
```bash
ls -la get-shit-done/commands/gsd/sync-*.md
head -20 get-shit-done/commands/gsd/sync-analyze.md
```
Should show all three files with frontmatter.
  </verify>
  <done>Workflow commands exist for /gsd:sync-analyze, /gsd:sync-preview, /gsd:sync-resolve</done>
</task>

</tasks>

<verification>
1. gsd-tools upstream analyze executes without error
2. gsd-tools upstream preview executes without error
3. gsd-tools upstream resolve executes without error
4. All three workflow files exist in commands/gsd/
5. Workflow files follow existing sync-status.md pattern
6. Help text updated in gsd-tools.cjs header comment
7. No syntax errors: `node -c get-shit-done/bin/gsd-tools.cjs`
</verification>

<success_criteria>
- `gsd-tools upstream analyze` routes to cmdUpstreamAnalyze with --by-feature support
- `gsd-tools upstream preview` routes to cmdUpstreamPreview
- `gsd-tools upstream resolve` routes to cmdUpstreamResolve with --ack, --ack-all, --status options
- Workflow command files exist and are properly formatted
- Error messages include new subcommands
- Help text documents new commands
</success_criteria>

<output>
After completion, create `.planning/phases/06-analysis/6-04-SUMMARY.md`
</output>
