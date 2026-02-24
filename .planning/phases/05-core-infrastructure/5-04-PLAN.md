---
phase: 05-core-infrastructure
plan: 04
type: execute
wave: 2
depends_on:
  - 5-01
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - NOTIF-01
  - NOTIF-02
  - NOTIF-03

must_haves:
  truths:
    - "System checks for upstream updates on session start (background, non-blocking)"
    - "User is notified when upstream has new commits"
    - "User can see count and summary of pending upstream updates"
    - "Cache prevents repeated network calls (24-hour duration)"
    - "Network errors are handled silently without blocking session"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Notification check function"
      exports: ["checkUpstreamNotification", "formatNotificationBanner"]
  key_links:
    - from: "checkUpstreamNotification"
      to: "config.json upstream cache"
      via: "cache validity check"
      pattern: "CACHE_DURATION_MS|last_fetch"
    - from: "formatNotificationBanner"
      to: "NOTIF-02 output"
      via: "banner text formatting"
      pattern: "commits available|sync-status"
---

<objective>
Add notification check functionality for session start integration.

Purpose: Enable proactive notification when upstream has new commits available, displayed in the session banner. Uses caching to avoid repeated network calls and handles errors silently.

Output: `checkUpstreamNotification` and `formatNotificationBanner` functions, plus gsd-tools command for notification check.
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
@.planning/phases/05-core-infrastructure/5-01-SUMMARY.md
@get-shit-done/bin/lib/upstream.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add notification check function to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add notification-related functions to upstream.cjs:

**checkUpstreamNotification(cwd, options):**

This is the core function for session-start notifications:

1. Load config - if no upstream configured, return `{ enabled: false, reason: 'not_configured' }`
2. Check if notifications disabled: `upstream_notifications: false` in config
3. Check cache validity:
   - If `last_fetch` is within CACHE_DURATION_MS (24 hours), use cached value
   - Return immediately with cached `commits_behind`
4. If cache is stale and `options.fetch !== false`:
   - Attempt quiet fetch: `git fetch upstream --quiet`
   - On success: update cache, return fresh count
   - On network error: return cached value with `fetch_failed: true`
5. Never throw - always return a result object

**Return structure:**
```javascript
{
  enabled: true,
  commits_behind: 5,           // Number or null if unknown
  cached: true,                // Was this from cache?
  fetch_failed: false,         // Did network fail?
  last_fetch: "2026-02-24...", // When was last successful fetch
  notifications_enabled: true, // User preference
}
```

**formatNotificationBanner(checkResult):**

Format the notification for session banner display:

```javascript
function formatNotificationBanner(result) {
  if (!result.enabled) return null;
  if (!result.notifications_enabled) return null;
  if (result.commits_behind === null) return null;

  if (result.commits_behind === 0) {
    return 'Fork is up to date with upstream';
  }

  const s = result.commits_behind === 1 ? '' : 's';
  return `${result.commits_behind} upstream commit${s} available. Run /gsd:sync-status for details`;
}
```

Per CONTEXT.md decisions:
- Background (non-blocking) - returns quickly, uses cache
- Cache duration: 24 hours
- Network errors: Silent skip - don't block or warn on failures
- Quiet mode: Respects `upstream_notifications: false` in config
- Zero state: "Fork is up to date with upstream"
- Non-zero: "5 upstream commits available. Run /gsd:sync-status for details"
  </action>
  <verify>
Test with cached value:
```javascript
const u = require('./get-shit-done/bin/lib/upstream.cjs');
const result = u.checkUpstreamNotification(process.cwd(), { fetch: false });
console.log(result);
console.log(u.formatNotificationBanner(result));
```
  </verify>
  <done>
checkUpstreamNotification returns notification state using cache.
formatNotificationBanner produces banner text.
Network errors handled silently.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add notification command to gsd-tools.cjs</name>
  <files>get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add a `upstream notification` subcommand for session integration:

1. **Add to help text** (in Upstream Sync Operations):
```
 *   upstream notification [--refresh]  Check for upstream updates (for session banner)
```

2. **Add routing** (in the upstream command block):
```javascript
else if (subcommand === 'notification') {
  const refresh = args.includes('--refresh');
  const result = upstreamModule.checkUpstreamNotification(cwd, { fetch: refresh });

  if (raw) {
    output(result, raw);
  } else {
    const banner = upstreamModule.formatNotificationBanner(result);
    if (banner) {
      console.log(banner);
    }
  }
}
```

**Usage in workflows:**
- Session start can call: `gsd-tools upstream notification --raw`
- Parse JSON response to get `commits_behind`
- Display banner text if commits_behind > 0

**--refresh flag:**
- Without flag: use cache only (fast, no network)
- With flag: attempt fresh fetch (for explicit refresh)

This enables workflows to:
1. Check notification state quickly using cache
2. Format appropriate banner message
3. Optionally force a refresh
  </action>
  <verify>
```bash
# Cached check (fast)
node get-shit-done/bin/gsd-tools.cjs upstream notification --raw

# Force refresh
node get-shit-done/bin/gsd-tools.cjs upstream notification --refresh --raw
```
Both should return valid JSON with `commits_behind` field.
  </verify>
  <done>
`gsd-tools upstream notification` provides session-start notification check.
Supports --refresh for explicit fetch.
Returns cached value by default for fast response.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add config toggle for notifications</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Ensure the notification toggle is respected throughout:

1. **In loadUpstreamConfig**, include default for `upstream_notifications`:
```javascript
function loadUpstreamConfig(cwd) {
  // ... existing code ...
  return {
    upstream: config.upstream || {},
    notifications_enabled: config.upstream_notifications !== false, // default true
  };
}
```

2. **In checkUpstreamNotification**, check the toggle:
```javascript
function checkUpstreamNotification(cwd, options) {
  const config = loadUpstreamConfig(cwd);

  if (!config.upstream?.url) {
    return { enabled: false, reason: 'not_configured' };
  }

  if (!config.notifications_enabled) {
    return {
      enabled: true,
      notifications_enabled: false,
      commits_behind: config.upstream.commits_behind,
      reason: 'disabled_by_user',
    };
  }

  // ... rest of function
}
```

3. **Document in config.json** (add to config schema understanding):
```json
{
  "upstream": { ... },
  "upstream_notifications": true  // Set to false to disable notifications
}
```

Per CONTEXT.md: Quiet mode config toggle `upstream_notifications: false` in config.json
  </action>
  <verify>
Test with notifications disabled:
1. Set `"upstream_notifications": false` in config.json
2. Run `gsd-tools upstream notification --raw`
3. Should return `notifications_enabled: false`
  </verify>
  <done>
Notification toggle respected in checkUpstreamNotification.
Users can disable with `upstream_notifications: false` in config.json.
  </done>
</task>

</tasks>

<verification>
1. checkUpstreamNotification returns cached value within 24 hours
2. formatNotificationBanner produces correct text for 0, 1, N commits
3. Network errors return cached value with fetch_failed flag
4. `upstream_notifications: false` disables notifications
5. gsd-tools command works with --raw and --refresh flags
</verification>

<success_criteria>
- `checkUpstreamNotification` uses 24-hour cache, returns quickly
- Network failures handled silently (no thrown errors, use cache)
- `formatNotificationBanner` produces: "N upstream commits available" or "Fork is up to date"
- Config toggle `upstream_notifications: false` respected
- `gsd-tools upstream notification` available for workflow integration
</success_criteria>

<output>
After completion, create `.planning/phases/05-core-infrastructure/5-04-SUMMARY.md`
</output>
