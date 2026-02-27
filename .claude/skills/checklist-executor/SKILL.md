---
name: checklist-executor
description: "Works through a markdown checklist file, implementing each unchecked item sequentially. Trigger phrases: work through checklist, execute checklist, fix checklist items, work on the checklist, continue the checklist, next checklist item. Do NOT invoke for: creating new checklists (use checklist-creator), general code changes not tied to a checklist file."
---

# Checklist Executor Skill

Reads a structured markdown checklist file and works through unchecked items
one at a time, implementing fixes and marking items complete.

## Workflow

1. **Load the checklist.** Read the checklist file specified by the user (or find
   the most recent one in `docs-md/` if not specified).

2. **Find the next unchecked item.** Scan for the first `[ ]` item in the file.
   If all items are checked, inform the user that the checklist is complete.

3. **Present the item.** Show the user which item you're about to work on
   (number and title). Ask if they want to proceed with this item, skip it,
   or work on a different one.

4. **Implement the fix.** Follow the item's Problem/Expected/Key file guidance:
   - Read the relevant files mentioned in the item.
   - Investigate the issue as described.
   - Implement the fix following project conventions (CLAUDE.md rules apply).
   - For backend changes: create/update tests and run them.
   - For frontend changes: verify the component renders correctly.
   - For items marked **Action:** (informational only): research and explain
     to the user, no code changes.

5. **Mark complete.** After the fix is implemented and verified:
   - Update the checklist file, changing `[ ]` to `[x]` for the completed item.
   - Summarize what was done.

6. **Continue or stop.** Ask the user if they want to continue to the next item
   or stop here.

## Rules

- Work on ONE item at a time. Do not batch multiple items.
- Always read the checklist file fresh before starting each item (it may have
  been modified externally).
- Follow all CLAUDE.md instructions (no placeholders, no backwards compat,
  proper typing, update tests, update docs-md).
- If an item requires clarification, ask the user before implementing.
- If an item turns out to be already fixed or not reproducible, mark it `[x]`
  and note that it was already resolved.
- Do not skip items without user approval.
- If implementing an item reveals new issues, mention them to the user but
  do NOT add them to the checklist — let the user decide.
- Keep the checklist file's formatting intact when marking items complete
  (only change `[ ]` to `[x]`, nothing else on that line).
