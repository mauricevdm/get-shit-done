---
phase: 05-core-infrastructure
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - .planning/config.json
autonomous: true
requirements:
  - SYNC-01
  - SYNC-02

must_haves:
  truths:
    - "User can configure upstream remote URL and it persists in config.json"
    - "User can fetch upstream changes without modifying local branches"
    - "Upstream URL is validated before saving"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Core upstream operations module"
      exports: ["cmdUpstreamConfigure", "cmdUpstreamFetch", "execGit", "loadUpstreamConfig", "saveUpstreamConfig"]
      min_lines: 150
  key_links:
    - from: "get-shit-done/bin/lib/upstream.cjs"
      to: ".planning/config.json"
      via: "loadUpstreamConfig/saveUpstreamConfig functions"
      pattern: "config\\.json"
    - from: "get-shit-done/bin/lib/upstream.cjs"
      to: "git remote"
      via: "execGit helper"
      pattern: "git.*remote"
---

<objective>
Create the upstream.cjs module with configure and fetch operations.

Purpose: Establish the foundational module for all upstream sync operations, following the established lib/worktree.cjs pattern. This enables users to set up their upstream remote and fetch changes safely.

Output: `lib/upstream.cjs` module with configure and fetch commands, config.json upstream section.
</objective>

<execution_context>
@gsd/get-shit-done/workflows/execute-plan.md
@gsd/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-core-infrastructure/5-CONTEXT.md
@.planning/phases/05-core-infrastructure/5-RESEARCH.md
@get-shit-done/bin/lib/worktree.cjs
@get-shit-done/bin/lib/health.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create upstream.cjs module with config helpers and configure command</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Create the `lib/upstream.cjs` module following the exact structure of `worktree.cjs`:

1. **Constants section:**
   - `DEFAULT_REMOTE_NAME = 'upstream'`
   - `DEFAULT_BRANCH = 'main'`
   - `CACHE_DURATION_MS = 24 * 60 * 60 * 1000` (24 hours)
   - `CONFIG_PATH = '.planning/config.json'`

2. **Helper functions:**
   - `execGit(cwd, args)` - Execute git command, return `{ success, stdout }` or `{ success: false, stderr }`
   - `loadUpstreamConfig(cwd)` - Read `.planning/config.json`, return `upstream` section or defaults
   - `saveUpstreamConfig(cwd, upstreamConfig)` - Merge upstream config into existing config.json
   - `getRemotes(cwd)` - List existing git remotes with URLs

3. **cmdUpstreamConfigure(cwd, url, options, output, error, raw):**
   - If no URL provided: auto-detect from existing remotes
     - If remote named "upstream" exists, use it
     - If multiple remotes, list them for selection (numbered list)
     - If single non-origin remote, suggest it
   - Validate URL with `git ls-remote --exit-code <url> HEAD`
   - Add remote if doesn't exist: `git remote add upstream <url>`
   - Or update: `git remote set-url upstream <url>`
   - Mirror to git config: `git config gsd.upstream.url <url>`
   - Save to config.json under `upstream.url`
   - Output: `{ configured: true, url, remote_name: 'upstream', validated: true }`

Per CONTEXT.md decisions:
- Auto-detect from git remotes, present list if multiple
- Store in both config.json (primary) and git config (mirrored)
- Test fetch immediately - fail fast on bad URL
  </action>
  <verify>
Run: `node get-shit-done/bin/lib/upstream.cjs` should not error (module loads).
Check exports: `const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(Object.keys(u))` shows expected functions.
  </verify>
  <done>
Module exports: execGit, loadUpstreamConfig, saveUpstreamConfig, getRemotes, cmdUpstreamConfigure.
Configure command validates URL, saves to config.json, mirrors to git config.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add fetch command to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add the `cmdUpstreamFetch` function to `upstream.cjs`:

**cmdUpstreamFetch(cwd, options, output, error, raw):**

1. Load upstream config - error if not configured
2. Run `git fetch upstream --quiet` (or `--prune` if option set)
3. Count commits behind: `git rev-list --count HEAD..upstream/main`
4. Get latest upstream commit SHA: `git rev-parse upstream/main`
5. Get latest upstream commit date: `git log -1 --format="%as" upstream/main`
6. Update cache in config.json:
   ```json
   {
     "upstream": {
       "url": "...",
       "last_fetch": "2026-02-24T10:30:00Z",
       "commits_behind": 5,
       "last_upstream_sha": "abc123..."
     }
   }
   ```
7. Output:
   - Success: `{ fetched: true, commits_behind: N, latest_date: "Feb 24", last_sha: "abc123" }`
   - Network error: `{ fetched: false, reason: "network_error", cached_commits_behind: N }`

Per CONTEXT.md decisions:
- Fetch without modifying local branches
- Cache last-known state, warn that fetch failed
- Show message: "Fetched N new commits. Run /gsd:sync-status for details."
  </action>
  <verify>
Manual test in a repo with upstream configured:
1. `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); u.cmdUpstreamFetch(process.cwd(), {}, console.log, console.error, false)"`
Should fetch and show commits_behind count.
  </verify>
  <done>
Fetch command runs `git fetch upstream`, updates cache in config.json with commits_behind, last_fetch timestamp, and last_upstream_sha.
  </done>
</task>

</tasks>

<verification>
1. Module loads without errors: `require('./get-shit-done/bin/lib/upstream.cjs')`
2. All expected functions exported: execGit, loadUpstreamConfig, saveUpstreamConfig, cmdUpstreamConfigure, cmdUpstreamFetch
3. Configure writes to `.planning/config.json` under `upstream` section
4. Fetch updates `upstream.commits_behind` and `upstream.last_fetch` in config.json
</verification>

<success_criteria>
- lib/upstream.cjs exists with ~150+ lines following worktree.cjs patterns
- cmdUpstreamConfigure validates URL, saves config, mirrors to git config
- cmdUpstreamFetch runs fetch, counts commits behind, updates cache
- Config persists between calls (read config, run fetch, read config again - values match)
</success_criteria>

<output>
After completion, create `.planning/phases/05-core-infrastructure/5-01-SUMMARY.md`
</output>
