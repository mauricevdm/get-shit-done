# Phase 3: State Reconciliation - Research

**Researched:** 2026-02-22
**Domain:** Markdown section-based merging, three-way diff, conflict resolution
**Confidence:** HIGH

## Summary

Phase 3 implements STATE.md reconciliation during worktree finalization. The core challenge is merging section-specific changes from a worktree branch while preserving global changes from main. This is a **semantic merge** problem, not a simple line-level diff, because different sections have different ownership rules (additive, union, recalculate).

The recommended approach is:
1. Parse STATE.md into an AST using **remark/unified** ecosystem
2. Extract sections using **mdast-util-heading-range**
3. Apply section-specific merge strategies defined in CONTEXT.md
4. For true conflicts, use **node-diff3** for three-way text comparison
5. Present conflicts using Claude suggestions with user confirmation

**Primary recommendation:** Build a custom `state-merge.cjs` tool using remark for parsing and node-diff3 for conflict detection, NOT hand-rolling markdown parsing or line-level text diffs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Section Ownership (Merge Strategies)**

| Section | Strategy | Details |
|---------|----------|---------|
| Current Position | **Additive** | Multiple phases can be in-progress simultaneously |
| Performance Metrics | **Additive** | Each phase adds its own stats on merge |
| Key Decisions | **Union** | All entries combined, no conflicts |
| Implementation Notes | **Union** | All entries combined |
| TODOs | **Union + main wins removals** | Additions merge, completions from main stick (no resurrection) |
| Blockers | **Union + main wins removals** | Same as TODOs |
| Session Continuity | Phase-specific | Each worktree tracks its own session context |
| Open Questions | **Union** | All questions combined |

**Conflict Boundaries**

| Scenario | Resolution |
|----------|------------|
| Same line edited (e.g., progress bar) | **Recalculate** from actual plan completion state |
| Same key, different values | **Add both** entries - duplicates OK, clean up later if needed |
| Inserted phases (4.1) | **Not a STATE.md issue** - decimal notation avoids renumbering |
| Unknown conflicts | **Claude suggests** resolution options, user confirms |

**Resolution Experience**

| Step | Behavior |
|------|----------|
| Conflict detected | **Rollback** merge attempt, return to clean slate |
| Show conflict | **Side-by-side diff** - "Main has X, worktree has Y, I suggest Z" |
| User choice | **Multiple choice** - accept suggestion / keep main / keep worktree / edit manually |
| Manual edit | **Open STATE.md in user's editor**, wait for save, then continue finalization |

**Registry-STATE Coupling**

| Aspect | Behavior |
|--------|----------|
| Relationship | **Complementary** - registry for machines, STATE.md for humans |
| Updates | **Independent** - each updated by its own operations |
| Drift | **Allowed during work**, validated at finalization |
| Reconciliation | **Auto-reconcile first**, escalate to user only if that fails |

**Source of Truth**

| Fact | Owner |
|------|-------|
| Worktree exists (path, branch) | Registry (JSON) |
| Worktree is locked | Registry (JSON) |
| Phase is in-progress | STATE.md |
| Phase is complete | STATE.md |
| Plans executed | STATE.md |

### Claude's Discretion

- What editor command to use for "edit manually"? ($EDITOR, code, platform-specific?)
- Should auto-reconcile log what it did, or only report on failure?

### Deferred Ideas (OUT OF SCOPE)

None captured.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STATE-01 | Worktree registry tracks active worktrees in JSON file | Registry already exists (.planning/worktrees/registry.json), needs status tracking enhancement |
| STATE-02 | STATE.md updates in worktree accumulate per-phase changes | Section isolation via mdast-util-heading-range enables clean separation |
| STATE-03 | Reconcile STATE.md on finalization (worktree wins for phase, main for global) | Section-based merge strategies (additive/union/recalculate) with node-diff3 for conflict detection |
| STATE-04 | Detect STATE.md conflicts and present manual resolution steps | Three-way merge with external-editor for manual editing, rollback via git merge --abort pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [unified](https://github.com/unifiedjs/unified) | ^11.0.0 | AST processing framework | De facto standard for text-to-AST transformations |
| [remark-parse](https://github.com/remarkjs/remark) | ^11.0.0 | Markdown to mdast | World's most popular markdown parser (150+ plugins) |
| [remark-stringify](https://github.com/remarkjs/remark) | ^11.0.0 | mdast to Markdown | Preserves formatting, configurable output |
| [mdast-util-heading-range](https://github.com/syntax-tree/mdast-util-heading-range) | ^4.0.0 | Section extraction/manipulation | Official utility for heading-delimited sections |
| [node-diff3](https://github.com/bhousel/node-diff3) | ^3.0.0 | Three-way merge algorithm | Used by Google Docs, Myer's diff algorithm |
| [external-editor](https://github.com/mrkmg/node-external-editor) | ^3.1.0 | Launch $EDITOR for manual edits | Standard for CLI editor integration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| [unist-util-visit](https://github.com/syntax-tree/unist-util-visit) | ^5.0.0 | Tree traversal | Walking mdast to find/modify nodes |
| [mdast-util-to-string](https://github.com/syntax-tree/mdast-util-to-string) | ^4.0.0 | Extract text content | Getting plain text from heading nodes |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | ^4.0.0 | GitHub-flavored markdown | Tables, task lists, strikethrough |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| remark-parse | marked, markdown-it | remark has better AST manipulation utilities |
| node-diff3 | jsdiff, diff-match-patch | node-diff3 specifically supports three-way merge with conflict markers |
| external-editor | open-editor, launch-editor | external-editor handles $VISUAL/$EDITOR properly, synchronous for CLI |
| mdast-util-heading-range | mdast-zone | heading-range matches by heading text, zone uses HTML comments |

**Installation:**
```bash
npm install unified remark-parse remark-stringify remark-gfm \
  mdast-util-heading-range unist-util-visit mdast-util-to-string \
  node-diff3 external-editor
```

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/
├── gsd-tools.cjs           # Add state reconciliation commands
├── phase-worktree.sh       # Existing worktree management
└── state-merge.cjs         # NEW: Dedicated STATE.md merge logic
```

### Pattern 1: Section-Based Merge
**What:** Parse STATE.md into sections, apply per-section merge strategies, reconstruct document
**When to use:** Always for STATE.md reconciliation

```javascript
// Source: mdast-util-heading-range + custom merge logic
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { headingRange } from 'mdast-util-heading-range';

// Extract a section by heading text
function extractSection(tree, headingText) {
  let sectionContent = null;
  headingRange(tree, headingText, (start, nodes, end) => {
    sectionContent = { start, nodes, end };
  });
  return sectionContent;
}

// Merge strategy: Additive (append new items)
function mergeAdditive(mainSection, worktreeSection) {
  const mainItems = extractListItems(mainSection);
  const worktreeItems = extractListItems(worktreeSection);
  // Union: combine both, preserving order
  return [...mainItems, ...worktreeItems.filter(i => !mainItems.includes(i))];
}

// Merge strategy: Union + main wins removals
function mergeUnionMainWins(mainSection, worktreeSection, baseSection) {
  const mainItems = extractListItems(mainSection);
  const worktreeItems = extractListItems(worktreeSection);
  const baseItems = extractListItems(baseSection);

  // Items removed from main (were in base, not in main) - stay removed
  const mainRemoved = baseItems.filter(i => !mainItems.includes(i));

  // Items added by worktree
  const worktreeAdded = worktreeItems.filter(i => !baseItems.includes(i));

  // Result: main items + worktree additions (excluding main's removals)
  return [...mainItems, ...worktreeAdded.filter(i => !mainRemoved.includes(i))];
}
```

### Pattern 2: Three-Way Conflict Detection
**What:** Compare base (merge-base), main, and worktree versions to detect true conflicts
**When to use:** When automatic merge cannot resolve differences

```javascript
// Source: node-diff3 GitHub README
import { diff3Merge, merge } from 'node-diff3';

function detectConflicts(base, main, worktree) {
  // Split by lines for line-level comparison
  const baseLines = base.split('\n');
  const mainLines = main.split('\n');
  const worktreeLines = worktree.split('\n');

  const result = diff3Merge(mainLines, baseLines, worktreeLines);

  // Check for conflicts
  const hasConflicts = result.some(hunk => hunk.conflict);

  return {
    hasConflicts,
    hunks: result,
    // Generate git-style conflict markers if needed
    merged: merge(mainLines, baseLines, worktreeLines)
  };
}
```

### Pattern 3: Rollback-First Conflict Resolution
**What:** Abort merge before showing conflicts, never leave half-merged state
**When to use:** STATE-04 conflict detection and resolution

```javascript
// Source: CONTEXT.md Resolution Experience decisions
async function reconcileWithRollback(mainPath, worktreePath) {
  // 1. Read both versions BEFORE any changes
  const mainContent = fs.readFileSync(mainPath, 'utf-8');
  const worktreeContent = fs.readFileSync(worktreePath, 'utf-8');
  const baseContent = getBaseContent(mainPath); // from merge-base

  // 2. Attempt auto-reconcile
  const autoResult = autoReconcile(baseContent, mainContent, worktreeContent);

  if (autoResult.success) {
    // Write result and return
    fs.writeFileSync(mainPath, autoResult.content);
    return { success: true, autoResolved: true };
  }

  // 3. Conflict detected - DO NOT modify files yet
  // Present side-by-side diff to user
  console.log("Main has:", autoResult.mainVersion);
  console.log("Worktree has:", autoResult.worktreeVersion);
  console.log("Suggestion:", autoResult.suggestion);

  // 4. Get user choice
  const choice = await promptUser([
    'Accept suggestion',
    'Keep main',
    'Keep worktree',
    'Edit manually'
  ]);

  // 5. Apply choice
  return applyResolution(choice, mainPath, autoResult);
}
```

### Pattern 4: External Editor Integration
**What:** Open STATE.md in user's editor for manual conflict resolution
**When to use:** When user chooses "edit manually" option

```javascript
// Source: external-editor npm package
import { editAsync } from 'external-editor';

async function editManually(content, originalPath) {
  // external-editor respects $VISUAL then $EDITOR
  // It creates a temp file, opens editor, waits for close
  const edited = await editAsync(content, {
    postfix: '.md'  // Helps editor with syntax highlighting
  });

  return edited;
}

// For opening the actual file (not temp):
import { spawnSync } from 'child_process';

function openFileInEditor(filePath) {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vim';

  // Synchronous - waits for editor to close
  const result = spawnSync(editor, [filePath], {
    stdio: 'inherit'  // Share terminal with editor
  });

  return result.status === 0;
}
```

### Anti-Patterns to Avoid
- **Line-level text diff for structured content:** Markdown sections have semantic meaning; line diffs create false conflicts
- **Global "last writer wins":** Loses data from one side entirely
- **Auto-merge without conflict markers:** User can't verify what was merged
- **Modifying files during conflict detection:** Creates half-merged state that's hard to recover from
- **Blocking on all merge attempts:** Most sections are additive/union and won't conflict

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Regex-based section extraction | remark-parse + mdast | Handles edge cases (code blocks, nested lists, frontmatter) |
| Three-way diff | Custom diff algorithm | node-diff3 | Myer's algorithm, battle-tested by Google Docs |
| Section extraction | String.indexOf() for headings | mdast-util-heading-range | Handles heading depth, nested sections, edge cases |
| Editor launching | process.spawn with hard-coded editors | external-editor | Cross-platform, respects $VISUAL/$EDITOR, handles temp files |
| Conflict markers | Custom marker format | node-diff3 merge() | Git-compatible markers, widely understood format |

**Key insight:** Markdown is structured content. Tools designed for structured content (remark/mdast) are dramatically more reliable than text manipulation, especially when STATE.md contains code blocks, tables, or nested lists.

## Common Pitfalls

### Pitfall 1: Code Block Confusion
**What goes wrong:** Markdown parser treats code block contents as literal, but section extraction may miss code blocks spanning sections
**Why it happens:** remark-parse correctly identifies fenced code blocks, but naive section extraction cuts at any `##` heading
**How to avoid:** Use mdast-util-heading-range which understands document structure
**Warning signs:** Merge corrupts code blocks or creates unbalanced fences

### Pitfall 2: Table Row Merging
**What goes wrong:** Tables have rows with semantic meaning (metrics, decisions) but line-diff treats them as unrelated lines
**Why it happens:** Line-level diff doesn't understand table structure
**How to avoid:** Parse tables into structured data, merge by key column, regenerate table
**Warning signs:** Table alignment breaks, duplicate rows with slight variations

### Pitfall 3: Progress Bar Conflicts
**What goes wrong:** Both main and worktree update the same progress bar line, creating conflict
**Why it happens:** Progress percentage changes in both branches
**How to avoid:** CONTEXT.md specifies: **Recalculate** from actual plan completion state (don't merge, derive)
**Warning signs:** Conflict markers in middle of progress bar

### Pitfall 4: TODO Resurrection
**What goes wrong:** Worktree has uncompleted TODO, main has same TODO marked complete, merge resurrects it
**Why it happens:** Union merge adds all items from both sides
**How to avoid:** CONTEXT.md specifies: **main wins removals** - if main removed it, it stays removed
**Warning signs:** Completed TODOs reappear as incomplete

### Pitfall 5: Editor Environment Variables
**What goes wrong:** `$EDITOR` not set, or set to GUI editor that doesn't block
**Why it happens:** macOS may have `code --wait` needed, Linux might have `nano` or nothing
**How to avoid:** Fallback chain: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> error with instructions
**Warning signs:** Editor opens but script continues before save, or "editor not found" errors

### Pitfall 6: Frontmatter Handling
**What goes wrong:** STATE.md doesn't have frontmatter but other GSD files do; mixing handling
**Why it happens:** Inconsistent parsing assumptions
**How to avoid:** STATE.md uses markdown-only format (no YAML frontmatter), document this explicitly
**Warning signs:** Parser errors about invalid frontmatter

## Code Examples

Verified patterns from official sources:

### Parse Markdown to AST
```javascript
// Source: https://github.com/remarkjs/remark README
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm);  // Tables, task lists

const tree = processor.parse(markdownContent);
// tree is now an mdast (Markdown Abstract Syntax Tree)
```

### Extract Section Content
```javascript
// Source: https://github.com/syntax-tree/mdast-util-heading-range README
import { headingRange } from 'mdast-util-heading-range';
import { visit } from 'unist-util-visit';

// Find section by heading text
headingRange(tree, 'Key Decisions', (start, nodes, end, info) => {
  // start: the heading node
  // nodes: array of nodes between heading and next same-level heading
  // end: the next heading (or undefined if end of doc)
  // info: { parent, start, end } indices

  console.log('Section content nodes:', nodes);
});
```

### Three-Way Merge with Conflict Detection
```javascript
// Source: https://github.com/bhousel/node-diff3 README + tests
import * as Diff3 from 'node-diff3';

const base = ['line1', 'line2', 'line3'];
const ours = ['line1', 'changed2', 'line3'];
const theirs = ['line1', 'line2', 'added3', 'line3'];

// Get structured merge result
const result = Diff3.diff3Merge(ours, base, theirs);

result.forEach(hunk => {
  if (hunk.ok) {
    // Clean merge - add to output
    output.push(...hunk.ok);
  } else {
    // Conflict detected
    // hunk.conflict.a = ours version
    // hunk.conflict.o = base version
    // hunk.conflict.b = theirs version
    console.log('CONFLICT:', hunk.conflict);
  }
});

// Or get git-style output with markers
const merged = Diff3.merge(ours, base, theirs);
if (merged.conflict) {
  console.log('Has conflicts:', merged.result.join('\n'));
  // Will contain <<<<<<< ======= >>>>>>> markers
}
```

### Open User's Editor
```javascript
// Source: https://github.com/mrkmg/node-external-editor README
import { edit, editAsync } from 'external-editor';

// Synchronous (blocks until editor closes)
const result = edit('Initial content\n\n# Edit above');
console.log('User wrote:', result);

// With file extension hint for syntax highlighting
const mdResult = edit(content, { postfix: '.md' });

// Async version
const asyncResult = await editAsync(content);
```

### Serialize AST Back to Markdown
```javascript
// Source: https://github.com/remarkjs/remark README
import remarkStringify from 'remark-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',           // List bullet style
    emphasis: '*',         // Emphasis marker
    listItemIndent: 'one'  // Consistent indentation
  });

// Parse, modify, stringify
const tree = processor.parse(input);
// ... modify tree ...
const output = processor.stringify(tree);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Line-level git merge | Structured/semantic merge | 2010s | Fewer false conflicts, better accuracy |
| Text-based section extraction | AST-based section extraction | unified ecosystem | Handles edge cases (code blocks, nested content) |
| Custom diff algorithms | Battle-tested libraries (node-diff3) | Always | Reliability, performance |
| Blocking merges | Union-first with conflict escalation | Design choice | Most changes merge automatically |

**Deprecated/outdated:**
- `diff` npm package: Lacks three-way merge support needed for git-style merging
- `diff-match-patch`: Designed for plain text, warns against structured content
- String.split() for markdown sections: Breaks on code blocks containing `##`

## Open Questions

1. **$EDITOR fallback chain**
   - What we know: $VISUAL checked first, then $EDITOR
   - What's unclear: Best fallback when neither is set (vim? nano? error?)
   - Recommendation: Fallback chain with clear error message if nothing works

2. **Auto-reconcile logging**
   - What we know: CONTEXT.md leaves this to Claude's discretion
   - What's unclear: Silent success vs. verbose logging
   - Recommendation: Log to STATE.md itself in "Implementation Notes" section on successful auto-reconcile

3. **Table row identification**
   - What we know: Key Decisions table has Decision | Rationale | Date columns
   - What's unclear: How to identify "same row" for deduplication (by Decision column?)
   - Recommendation: Match by first column (Decision text), merge other columns

## Sources

### Primary (HIGH confidence)
- [remark/remarkjs](https://github.com/remarkjs/remark) - Markdown parser documentation, examples
- [mdast specification](https://github.com/syntax-tree/mdast) - AST format definition
- [mdast-util-heading-range](https://github.com/syntax-tree/mdast-util-heading-range) - Section extraction API
- [node-diff3](https://github.com/bhousel/node-diff3) - Three-way merge implementation, test examples
- [external-editor](https://github.com/mrkmg/node-external-editor) - Editor integration API

### Secondary (MEDIUM confidence)
- [unist-util-visit](https://github.com/syntax-tree/unist-util-visit) - Tree traversal patterns
- [Snyk node-diff3 examples](https://snyk.io/advisor/npm-package/node-diff3/example) - Usage patterns
- [Git merge documentation](https://git-scm.com/docs/git-merge) - Conflict marker format, merge strategies

### Tertiary (LOW confidence)
- [Three-way structured merge paper](https://www.sciencedirect.com/science/article/abs/pii/S138376212300190X) - Academic algorithm background
- [SemanticMerge concepts](https://endjin.com/blog/2014/08/using-semanticmerge-to-fix-git-merge-conflicts) - Semantic vs textual merge patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are well-documented, actively maintained, widely used
- Architecture: HIGH - Patterns derived from official documentation and CONTEXT.md decisions
- Pitfalls: MEDIUM - Some based on general markdown/merge experience, not GSD-specific testing

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (60 days - ecosystem is stable, no rapid churn expected)
