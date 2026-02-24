---
phase: 08-interactive-integration
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - get-shit-done/bin/lib/upstream.cjs
  - get-shit-done/bin/gsd-tools.cjs
autonomous: true
requirements:
  - INTER-02

must_haves:
  truths:
    - "User sees refactoring suggestions in sync status output when conflicts detected"
    - "Each suggestion shows what, why, and proposed fix"
    - "User can apply a suggestion with sync apply-suggestion <id>"
    - "Suggestions detect renames where fork has modifications"
    - "Suggestions detect function signature changes"
    - "Suggestions detect import relationship conflicts"
  artifacts:
    - path: "get-shit-done/bin/lib/upstream.cjs"
      provides: "Semantic similarity detection and suggestion generation"
      exports: ["detectSemanticSimilarities", "generateSuggestions", "applySuggestion"]
      min_lines: 2500
    - path: "get-shit-done/bin/gsd-tools.cjs"
      provides: "CLI with sync apply-suggestion command"
      contains: "apply-suggestion"
  key_links:
    - from: "get-shit-done/bin/lib/upstream.cjs"
      to: "cmdUpstreamStatus"
      via: "Suggestions section in status output"
      pattern: "suggestions"
    - from: "get-shit-done/bin/gsd-tools.cjs"
      to: "applySuggestion"
      via: "sync apply-suggestion routing"
      pattern: "apply-suggestion"
---

<objective>
Add refactoring suggestions to help minimize merge conflicts.

Purpose: Proactively identify potential conflicts before merge and suggest refactoring actions. This includes detecting renames where fork has modifications, function signature changes, and import relationship conflicts. Users can apply suggestions one at a time.

Output: detectSemanticSimilarities() and applySuggestion() functions in upstream.cjs, integrated into cmdUpstreamStatus output, and `sync apply-suggestion` command.
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
  <name>Task 1: Add semantic similarity detection to upstream.cjs</name>
  <files>get-shit-done/bin/lib/upstream.cjs</files>
  <action>
Add semantic similarity detection functions to upstream.cjs:

1. **detectSemanticSimilarities(cwd):**
   Returns array of suggestions with structure:
   ```javascript
   {
     id: number,           // Sequential ID for apply-suggestion
     type: string,         // 'rename_conflict' | 'signature_conflict' | 'import_conflict'
     severity: string,     // 'high' | 'medium' | 'low'
     file: string,         // Affected file path
     what: string,         // Brief description of the issue
     why: string,          // Why this matters for merge
     fix: string,          // Proposed action
     apply_command: string // Specific apply command
   }
   ```

2. **Rename conflict detection:**
   - Use existing detectRenames() to find renames where fork_modified=true
   - For each, create suggestion: "Apply fork changes to renamed file before merge"
   - Severity: high (these often cause merge failures)

3. **Function signature conflict detection (detectFunctionSignatureConflicts):**
   - Get files modified in both fork and upstream
   - For each, parse diffs for function definition changes
   - Pattern: `^[+-]\s*(async\s+)?function\s+(\w+)\s*\(([^)]*)\)`
   - Compare ours vs theirs signatures
   - Create suggestion with specific line numbers

4. **Import relationship conflict detection (detectImportConflicts):**
   - Check for files where upstream changed exports and fork uses those imports
   - Pattern: look for `module.exports` changes in upstream
   - Cross-reference with fork files that `require()` those modules
   - Create suggestions for import updates

5. **generateSuggestions(cwd):**
   - Call detectSemanticSimilarities()
   - Assign sequential IDs
   - Store in config.json under `upstream.analysis.suggestions`
   - Return suggestions array

6. **Integrate into cmdUpstreamStatus:**
   - After warnings section, check for suggestions
   - If suggestions exist, add "Suggestions" section to output
   - Format: numbered list with what/why/fix for each

Per CONTEXT.md locked decisions:
- Suggestion type: Proposed changes (show actual code/file changes)
- Timing: Automatic in status output
- Aggressiveness: Thorough (analyze semantic similarities, may be noisy)
  </action>
  <verify>
Run: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof u.detectSemanticSimilarities)"` should output 'function'.
Run: `node -e "const u = require('./get-shit-done/bin/lib/upstream.cjs'); console.log(typeof u.generateSuggestions)"` should output 'function'.
  </verify>
  <done>
detectSemanticSimilarities() detects renames, signature conflicts, and import conflicts.
generateSuggestions() assigns IDs and stores in config.
cmdUpstreamStatus shows suggestions section when conflicts detected.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add apply-suggestion command</name>
  <files>get-shit-done/bin/lib/upstream.cjs, get-shit-done/bin/gsd-tools.cjs</files>
  <action>
Add the apply-suggestion command:

1. **In upstream.cjs - applySuggestion(cwd, suggestionId):**
   - Load suggestions from config.json
   - Find suggestion by ID
   - Based on suggestion type, execute appropriate action:

   **For rename_conflict:**
   - Get the fork's diff for the original file
   - Apply the diff to the renamed file path
   - Stage the changes: `git add <renamed_path>`
   - Mark suggestion as applied in config

   **For signature_conflict:**
   - Show the conflict details
   - Create a patch file with recommended changes
   - Return instructions for manual application

   **For import_conflict:**
   - Update import paths in fork files
   - Stage the changes
   - Mark suggestion as applied

   - Return: `{ applied: true, suggestion_id, action_taken }` or `{ applied: false, reason }`

2. **In gsd-tools.cjs - add routing:**
   - Add `cmdSyncApplySuggestion` function
   - Parse suggestion ID from args
   - Call upstream.applySuggestion()
   - Output result

3. **Add command routing:**
   - Route `sync apply-suggestion <id>` to cmdSyncApplySuggestion
   - Validate ID is a number

4. **Update help text:**
   - Add: `sync apply-suggestion <id>  Apply a refactoring suggestion`

Per CONTEXT.md: One-click apply for each suggestion, user applies one at a time.
  </action>
  <verify>
Run: `node get-shit-done/bin/gsd-tools.cjs sync apply-suggestion --help` shows usage.
Run: `node get-shit-done/bin/gsd-tools.cjs sync apply-suggestion 999` shows "suggestion not found" error.
  </verify>
  <done>
applySuggestion() in upstream.cjs handles applying suggestions by type.
`sync apply-suggestion <id>` command routes correctly in gsd-tools.cjs.
Applied suggestions marked in config to prevent re-application.
  </done>
</task>

</tasks>

<verification>
1. detectSemanticSimilarities() exported from upstream.cjs
2. generateSuggestions() stores suggestions in config.json
3. cmdUpstreamStatus includes suggestions in output
4. applySuggestion() handles each suggestion type
5. gsd-tools.cjs routes `sync apply-suggestion` command
6. Suggestions have sequential IDs for easy reference
</verification>

<success_criteria>
- detectSemanticSimilarities() detects: renames, signature conflicts, import conflicts
- Each suggestion has: id, type, severity, file, what, why, fix, apply_command
- cmdUpstreamStatus shows suggestions section when conflicts exist
- `sync apply-suggestion <id>` applies the suggestion
- Applied suggestions marked to prevent duplicate application
- Severity levels used: high (renames), medium (signatures), low (imports)
</success_criteria>

<output>
After completion, create `.planning/phases/08-interactive-integration/8-02-SUMMARY.md`
</output>
