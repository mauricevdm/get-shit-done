---
phase: 05-core-infrastructure
plan: 03
type: execute
wave: 2
depends_on:
  - 5-01
  - 5-02
files_modified:
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - SYNC-01
  - SYNC-02
  - SYNC-03
  - SYNC-04

must_haves:
  truths:
    - "User can run gsd-tools upstream configure to set up upstream"
    - "User can run gsd-tools upstream fetch to get latest changes"
    - "User can run gsd-tools upstream status to see commits behind"
    - "User can run gsd-tools upstream log to view commit history"
  artifacts:
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "upstream subcommand routing"
      contains: "upstream"
  key_links:
    - from: "get-shit-done/bin/gsd-tools.cjs"
      to: "get-shit-done/bin/lib/upstream.cjs"
      via: "require and command routing"
      pattern: "require.*upstream\\.cjs"
---

<objective>
Integrate upstream commands into gsd-tools.cjs CLI.

Purpose: Make upstream operations accessible via the standard gsd-tools CLI interface that all GSD workflows use. This follows the established pattern for worktree and health commands.

Output: `gsd-tools upstream [configure|fetch|status|log]` commands working.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-core-infrastructure/5-01-SUMMARY.md
@.planning/phases/05-core-infrastructure/5-02-SUMMARY.md
@get-shit-done/bin/gsd-tools.cjs
@get-shit-done/bin/lib/upstream.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add upstream module import and command routing to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add upstream command support to gsd-tools.cjs following the worktree pattern:

1. **Add module import** (near other lib imports):
```javascript
const upstreamModule = require('./lib/upstream.cjs');
```

2. **Add help text** (in the header comment, after Lock Operations):
```
 * Upstream Sync Operations:
 *   upstream configure [url]           Configure upstream remote (auto-detect if no URL)
 *   upstream fetch                     Fetch upstream changes, update cache
 *   upstream status                    Show commits behind with file summary
 *   upstream log                       Show grouped commit log
```

3. **Add command routing** (in the main switch/if block, following worktree pattern):

```javascript
// ─── Upstream Commands ─────────────────────────────────────────────────────────

if (command === 'upstream') {
  const subcommand = args[1];

  if (subcommand === 'configure') {
    const url = args[2]; // Optional - auto-detect if not provided
    upstreamModule.cmdUpstreamConfigure(cwd, url, {}, output, errorExit, raw);
  }
  else if (subcommand === 'fetch') {
    upstreamModule.cmdUpstreamFetch(cwd, {}, output, errorExit, raw);
  }
  else if (subcommand === 'status') {
    upstreamModule.cmdUpstreamStatus(cwd, {}, output, errorExit, raw);
  }
  else if (subcommand === 'log') {
    upstreamModule.cmdUpstreamLog(cwd, {}, output, errorExit, raw);
  }
  else {
    errorExit(`Unknown upstream subcommand: ${subcommand}. Use: configure, fetch, status, log`);
  }
}
```

4. **Add to command list** (if there's a help command that lists available commands).

Follow the exact patterns used for worktree commands (around line 1200+ in gsd-tools.cjs).
  </action>
  <verify>
Test all commands:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream configure --help 2>&1 | head -1
node get-shit-done/bin/gsd-tools.cjs upstream status --raw
node get-shit-done/bin/gsd-tools.cjs upstream log --raw
```
All should run without "Unknown command" errors.
  </verify>
  <done>
gsd-tools.cjs routes upstream subcommands to upstream.cjs module functions.
Help text documents all four commands.
  </done>
</task>

<task type="auto">
  <name>Task 2: Test end-to-end CLI workflow</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Verify the complete CLI workflow works:

1. **Test configure** (if upstream not already configured):
```bash
node get-shit-done/bin/gsd-tools.cjs upstream configure "https://github.com/gsd-build/get-shit-done"
```
Expected: `{ "configured": true, "url": "...", "validated": true }`

2. **Test fetch**:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream fetch --raw
```
Expected: `{ "fetched": true, "commits_behind": N, ... }`

3. **Test status**:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream status
```
Expected: Human-readable output with commit count and file summary.

4. **Test log**:
```bash
node get-shit-done/bin/gsd-tools.cjs upstream log
```
Expected: Grouped commits with emoji headers.

5. **Test error handling**:
```bash
# Remove upstream config and test status
node get-shit-done/bin/gsd-tools.cjs upstream status 2>&1
```
Expected: Clear error message about upstream not configured.

If any command fails, fix the routing or module integration.
  </action>
  <verify>
All four commands produce expected output format.
Error messages are clear and actionable.
`--raw` flag produces valid JSON for all commands.
  </verify>
  <done>
Complete CLI workflow: configure -> fetch -> status -> log all work.
Error states produce helpful messages.
Raw JSON output works for scripting.
  </done>
</task>

</tasks>

<verification>
1. `gsd-tools upstream configure` sets up upstream with validation
2. `gsd-tools upstream fetch` updates cache
3. `gsd-tools upstream status` shows commits behind and file summary
4. `gsd-tools upstream log` shows grouped commit log
5. Unknown subcommand shows helpful error
6. All commands support `--raw` for JSON output
</verification>

<success_criteria>
- `gsd-tools upstream configure [url]` configures and validates upstream
- `gsd-tools upstream fetch` fetches and caches state
- `gsd-tools upstream status` displays commit count, files, warnings
- `gsd-tools upstream log` displays grouped commits with emoji
- All commands accessible via standard gsd-tools CLI
- Help text documents all upstream commands
</success_criteria>

<output>
After completion, create `.planning/phases/05-core-infrastructure/5-03-SUMMARY.md`
</output>
