---
phase: 08-interactive-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/interactive.cjs
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - INTER-01

must_haves:
  truths:
    - "User can run sync explore <hash> to enter interactive exploration mode"
    - "User can use files command to see affected files in current commit"
    - "User can use diff command to see smart preview (summary for >50 lines)"
    - "User can use conflicts command to see predicted conflicts"
    - "User can use related command to see commits touching same files"
    - "User can navigate between commits with next/prev commands"
    - "User can ask Claude questions with ask <question> command"
    - "User can quit exploration with quit command"
  artifacts:
    - path: "get-shit-done/bin/lib/interactive.cjs"
      provides: "Interactive exploration REPL module"
      exports: ["createExploreSession", "EXPLORE_COMMANDS", "showSmartDiff", "loadCommitDetails"]
      min_lines: 200
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "CLI entry point with sync explore command"
      contains: "sync explore"
  key_links:
    - from: "get-shit-done/bin/lib/interactive.cjs"
      to: "get-shit-done/bin/lib/upstream.cjs"
      via: "execGit helper and conflict preview functions"
      pattern: "require.*upstream"
    - from: "get-shit-done/bin/gsd-tools.cjs"
      to: "get-shit-done/bin/lib/interactive.cjs"
      via: "cmdSyncExplore routing"
      pattern: "interactive"
---

<objective>
Create the interactive exploration mode for upstream commits.

Purpose: Enable users to deep-dive into specific upstream commits, viewing diffs, predicted conflicts, related commits, and asking Claude questions about changes. This provides the "drill down" capability from sync status output.

Output: `lib/interactive.cjs` module with readline-based REPL, `sync explore <hash>` command in gsd-tools.cjs.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-interactive-integration/8-CONTEXT.md
@.planning/phases/08-interactive-integration/08-RESEARCH.md
@get-shit-done/bin/lib/upstream.cjs
@get-shit-done/bin/gsd-tools.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create interactive.cjs module with readline REPL</name>
  <files>get-shit-done/bin/lib/interactive.cjs</files>
  <action>
Create the `lib/interactive.cjs` module following existing lib module patterns:

1. **Constants section:**
   - `DIFF_PREVIEW_THRESHOLD = 50` (lines threshold for smart preview)
   - Import readline from Node.js built-in

2. **Helper functions:**
   - `loadCommitDetails(cwd, hash)` - Load commit metadata (hash, subject, author, date, files)
   - `showSmartDiff(cwd, commit)` - Show summary if >50 lines changed, full diff otherwise
   - `showFileDiff(cwd, commit, filename)` - Show diff for specific file
   - `showAffectedFiles(commit)` - List files changed in commit
   - `showPredictedConflicts(cwd, commit)` - Use upstream.getConflictPreview()
   - `showRelatedCommits(cwd, commit)` - Find other commits touching same files
   - `askClaude(cwd, commit, question)` - Format prompt for Claude analysis

3. **EXPLORE_COMMANDS object:**
   Define command handlers per CONTEXT.md:
   - `files`: Show affected files
   - `diff`: Smart diff preview (or `diff <filename>` for specific file)
   - `conflicts`: Predicted conflicts
   - `related`: Related commits (touch same files)
   - `next`: Navigate to next commit in range
   - `prev`: Navigate to previous commit
   - `ask <question>`: AI escape hatch - format prompt for Claude
   - `quit` / `q`: Exit exploration

4. **createExploreSession(cwd, commitHash, commitList):**
   - Create readline interface with prompt: `explore {short_hash}> `
   - Load commit context once at start
   - Track position in commitList for next/prev navigation
   - Handle line input, dispatch to command handlers
   - On 'close', print "Exploration ended."
   - Return promise that resolves when session ends

Per CONTEXT.md locked decisions:
- Entry point from sync status output (user runs sync explore after sync status)
- Structured queries + AI escape hatch
- Linear chronological navigation (next/prev)
- Smart preview: summary for >50 lines
  </action>
  <verify>
Run: `node get-shit-done/bin/lib/interactive.cjs` should not error (module loads).
Check exports: `node -e "const i = require('./get-shit-done/bin/lib/interactive.cjs'); console.log(Object.keys(i))"` shows createExploreSession, EXPLORE_COMMANDS, showSmartDiff, loadCommitDetails.
  </verify>
  <done>
Module exports: createExploreSession, EXPLORE_COMMANDS, showSmartDiff, loadCommitDetails.
createExploreSession creates readline REPL with all structured commands implemented.
Smart diff shows summary for changes >50 lines.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add sync explore command to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add the `sync explore` command to gsd-tools.cjs:

1. **Import interactive module:**
   Add to requires section: `const { createExploreSession } = require('./lib/interactive.cjs');`

2. **Add cmdSyncExplore function:**
   ```javascript
   function cmdSyncExplore(cwd, hash, options, output, error, raw) {
     // Validate hash provided
     if (!hash) {
       error('Commit hash required. Usage: sync explore <hash>');
       return;
     }

     // Get list of upstream commits for navigation
     const upstream = require('./lib/upstream.cjs');
     const commits = upstream.getCommitsWithFiles(cwd);

     if (commits.length === 0) {
       error('No upstream commits to explore. Run sync fetch first.');
       return;
     }

     // Verify hash exists in commit list
     const commitHashes = commits.map(c => c.hash);
     const fullHash = commitHashes.find(h => h.startsWith(hash));

     if (!fullHash) {
       error(`Commit ${hash} not found in upstream commits. Run sync status to see available commits.`);
       return;
     }

     // Start interactive session
     output({ exploring: fullHash, total_commits: commits.length }, raw, `Exploring commit ${fullHash}...`);
     createExploreSession(cwd, fullHash, commitHashes);
   }
   ```

3. **Add routing in command handler:**
   In the command switch/if-else block:
   - Route `sync explore <hash>` to cmdSyncExplore
   - Pass hash as first positional arg after 'explore'

4. **Add help text:**
   Update help/usage output to include: `sync explore <hash>  Interactive exploration of upstream commit`

Per CONTEXT.md: Entry point is from sync status output - user sees commit hashes there, then runs `sync explore <hash>`.
  </action>
  <verify>
Run: `node get-shit-done/bin/gsd-tools.cjs sync explore --help` shows usage.
Run: `node get-shit-done/bin/gsd-tools.cjs sync explore abc123` (with invalid hash) shows appropriate error message.
  </verify>
  <done>
`sync explore <hash>` command routed to cmdSyncExplore.
Command validates hash exists in upstream commits.
Starts interactive exploration session with navigation support.
  </done>
</task>

</tasks>

<verification>
1. Module loads without errors: `require('./get-shit-done/bin/lib/interactive.cjs')`
2. All expected functions exported: createExploreSession, EXPLORE_COMMANDS, showSmartDiff, loadCommitDetails
3. gsd-tools.cjs routes `sync explore` command correctly
4. Interactive session starts with readline prompt
5. Commands (files, diff, conflicts, related, next, prev, ask, quit) handled correctly
</verification>

<success_criteria>
- lib/interactive.cjs exists with ~200+ lines following upstream.cjs patterns
- createExploreSession creates readline REPL with proper prompt
- All 8 structured commands implemented: files, diff, conflicts, related, next, prev, ask, quit
- Smart diff shows summary for >50 lines, full diff otherwise
- gsd-tools.cjs routes `sync explore <hash>` to interactive session
- Navigation (next/prev) works through commit list
</success_criteria>

<output>
After completion, create `.planning/phases/08-interactive-integration/8-01-SUMMARY.md`
</output>
