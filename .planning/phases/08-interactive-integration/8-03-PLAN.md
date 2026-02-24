---
phase: 08-interactive-integration
plan: 03
type: execute
wave: 2
depends_on:
  - 8-01
  - 8-02
files_modified:
  - get-shit-done/bin/lib/test-discovery.cjs
  - get-shit-done/bin/lib/upstream.cjs
autonomous: true
requirements:
  - INTER-03

must_haves:
  truths:
    - "Post-merge verification runs automatically after successful merge"
    - "System identifies tests covering files that differ from upstream"
    - "User sees progressive output (spinner, test count, expand on failure)"
    - "On test failure, user is prompted to rollback or keep changes"
    - "Rollback uses backup branch created during merge (Phase 7)"
  artifacts:
    - path: "get-shit-done/bin/lib/test-discovery.cjs"
      provides: "Test file mapping and discovery"
      exports: ["discoverTestsForFiles", "findByNamingConvention", "findByImportAnalysis", "runVerificationTests"]
      min_lines: 150
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Post-merge verification hook in cmdUpstreamMerge"
      contains: "runPostMergeVerification"
  key_links:
    - from: "get-shit-done/bin/lib/test-discovery.cjs"
      to: "node --test"
      via: "Test runner execution"
      pattern: "node.*--test"
    - from: "get-shit-done/bin/lib/upstream.cjs"
      to: "get-shit-done/bin/lib/test-discovery.cjs"
      via: "Post-merge verification call"
      pattern: "require.*test-discovery"
---

<objective>
Implement post-merge verification with automatic test discovery and rollback prompt.

Purpose: After a successful upstream merge, automatically run tests that cover fork-specific customizations. If tests fail, prompt the user to rollback to the backup branch or keep changes and fix manually. This catches regressions immediately after merge.

Output: `lib/test-discovery.cjs` module for file-to-test mapping, post-merge verification hook in upstream.cjs cmdUpstreamMerge.
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
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create test-discovery.cjs module</name>
  <files>get-shit-done/bin/lib/test-discovery.cjs</files>
  <action>
Create the `lib/test-discovery.cjs` module for test file discovery:

1. **Constants:**
   - `TEST_TIMEOUT_MS = 30000` (30 second timeout per RESEARCH)
   - Test file patterns for GSD project

2. **findByNamingConvention(cwd, srcFile):**
   - Try common patterns:
     - `foo.cjs` -> `foo.test.cjs` (same directory)
     - `foo.cjs` -> `foo.spec.cjs` (same directory)
     - `lib/foo.cjs` -> `foo.test.cjs` (GSD pattern: test in parent)
     - `src/file.js` -> `__tests__/file.test.js`
   - Return array of existing test file paths

3. **findByImportAnalysis(cwd, srcFile):**
   - Find all test files (pattern: `*.test.cjs`, `*.spec.cjs`)
   - For each test file, read content
   - Check for `require()` or `import` of the source file
   - Use regex: `require\s*\(['"].*{basename}['"]` and `import.*from\s+['"].*{basename}`
   - Return array of test files that import the source

4. **discoverTestsForFiles(cwd, changedFiles):**
   - For each changed file:
     - Skip non-JS files
     - Try findByNamingConvention first (fast)
     - If no matches, try findByImportAnalysis (slower)
     - Track unmapped files
   - Return: `{ tests: string[], unmapped: string[], coverage: { mapped, total } }`

5. **runVerificationTests(cwd, testFiles, options):**
   - Options: `{ timeout, progressive }`
   - If progressive=true, show spinner with test count
   - Run tests with: `node --test --test-timeout={timeout} {testFiles.join(' ')}`
   - Parse output for pass/fail status
   - Return: `{ passed: boolean, total, passed_count, failed_count, failures: [], output }`

6. **getForkModifiedFiles(cwd):**
   - Get files that differ between fork and upstream: `git diff --name-only upstream/main..HEAD`
   - Filter to JS/CJS files
   - Return array of file paths

Per CONTEXT.md locked decisions:
- Detection method: Diff-based (files differing from upstream)
- Output style: Progressive (spinner, expand on failure)
  </action>
  <verify>
Run: `node get-shit-done/bin/lib/test-discovery.cjs` should not error (module loads).
Check exports: `node -e "const t = require('./get-shit-done/bin/lib/test-discovery.cjs'); console.log(Object.keys(t))"` shows discoverTestsForFiles, runVerificationTests.
  </verify>
  <done>
Module exports: discoverTestsForFiles, findByNamingConvention, findByImportAnalysis, runVerificationTests, getForkModifiedFiles.
Three-tier discovery: naming conventions first, then import analysis.
Progressive output with spinner and test count.
  </done>
</task>

<task type="auto">
  <name>Task 2: Hook verification into cmdUpstreamMerge</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add post-merge verification to upstream.cjs:

1. **Import test-discovery module:**
   Add to requires: `const { discoverTestsForFiles, runVerificationTests, getForkModifiedFiles } = require('./test-discovery.cjs');`

2. **Add runPostMergeVerification(cwd, backupBranch, output, raw):**
   - Get fork-modified files: `getForkModifiedFiles(cwd)`
   - Discover tests: `discoverTestsForFiles(cwd, modifiedFiles)`
   - If no tests found, warn and return success
   - Run tests with progressive output: `runVerificationTests(cwd, tests, { progressive: true })`
   - If tests pass: return `{ verified: true, tests_run: N }`
   - If tests fail: prompt user for action (rollback or keep)

3. **Add handleVerificationFailure(cwd, backupBranch, failures, output):**
   - Display failure summary
   - Show prompt: "Rollback merge or keep and fix manually? (r/k)"
   - If rollback requested:
     - Run: `git reset --hard {backupBranch}`
     - Output: "Rolled back to {backupBranch}"
   - If keep requested:
     - Output: "Keeping changes. Fix failing tests manually."

4. **Modify cmdUpstreamMerge (when it exists from Phase 7):**
   - After successful merge commit, call runPostMergeVerification()
   - Pass the backup branch name for potential rollback
   - Handle verification result

5. **Export new functions:**
   Add to module.exports: runPostMergeVerification

Note: This hooks into cmdUpstreamMerge from Phase 7. If Phase 7 is not complete, add a placeholder function that will be called from merge.

Per CONTEXT.md locked decisions:
- Trigger: Always automatic (every successful merge runs verification)
- Failure handling: Prompt user (rollback or keep)
- Output style: Progressive (spinner with test count, expand on failure)
  </action>
  <verify>
Run: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof u.runPostMergeVerification)"` should output 'function'.
  </verify>
  <done>
runPostMergeVerification() discovers and runs tests for fork-modified files.
handleVerificationFailure() prompts user for rollback or keep decision.
Verification hook ready to integrate with cmdUpstreamMerge from Phase 7.
Progressive output implemented (spinner, expand on failure).
  </done>
</task>

</tasks>

<verification>
1. test-discovery.cjs loads without errors
2. discoverTestsForFiles() finds tests via naming conventions and imports
3. runVerificationTests() executes tests with timeout and progressive output
4. runPostMergeVerification() exported from upstream.cjs
5. Failure handler prompts for rollback vs keep decision
6. Rollback uses backup branch from merge operation
</verification>

<success_criteria>
- lib/test-discovery.cjs exists with ~150+ lines
- discoverTestsForFiles() returns tests, unmapped files, and coverage stats
- runVerificationTests() runs node --test with timeout
- Progressive output: spinner during run, expand on failure
- runPostMergeVerification() integrates with merge workflow
- Failure prompts: "Rollback merge or keep and fix manually?"
- Rollback resets to backup branch
</success_criteria>

<output>
After completion, create `.planning/phases/08-interactive-integration/8-03-SUMMARY.md`
</output>
