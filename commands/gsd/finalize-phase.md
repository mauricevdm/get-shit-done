---
name: gsd:finalize-phase
description: Finalize a completed phase — verify gates, merge to main, cleanup worktree
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---
<objective>
Finalize a completed phase by verifying all gates pass (UAT, tests, verification), merging the phase branch to main, and cleaning up the git worktree.

This ensures a phase is properly closed out before moving to the next phase.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/finalize-phase.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Phase: $ARGUMENTS

**Gates verified:**
1. UAT passed (or not required for infrastructure phases)
2. Tests pass (if test suite exists)
3. Verification passed

**Actions performed:**
1. Merge phase branch to main (--no-ff)
2. Remove git worktree (if applicable)
3. Delete phase branch (it's merged)
4. Update STATE.md
</context>

<process>
Execute the finalize-phase workflow from @~/.claude/get-shit-done/workflows/finalize-phase.md end-to-end.
Preserve all workflow gates (UAT check, verification check, tests, merge, cleanup).
</process>
