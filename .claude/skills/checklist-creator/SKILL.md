---
name: checklist-creator
description: "Converts a user-provided list of issues, bugs, or tasks into a structured markdown checklist file in docs-md/. Trigger phrases: create checklist, make a checklist, turn these into a checklist, create todo file, checklist from these items. Do NOT invoke for: executing/working through checklist items, editing existing checklists, or general markdown file creation."
---

# Checklist Creator Skill

Converts a freeform list of issues, tasks, or bugs into a structured markdown
checklist file with rich context for each item.

## Output Format

The output file follows this exact structure:

```markdown
# [System/Feature Name]: [Checklist Purpose]

[1-2 sentence description of what this checklist tracks.]

---

## [Category Section]

### 1. [ ] [Short descriptive title]
**Area:** [Component area — e.g. "Frontend — Component Name" or "Backend — Service Name"]
**Problem:** [What's wrong or what needs to happen, written clearly.]
**Expected:** [What the correct behavior or outcome should be.]
**Key file:** `[path/to/relevant/file]` — [brief note on where to look.]

### 2. [ ] [Next item...]
...

---

## Key Files Reference

| Area | Files |
|------|-------|
| ... | ... |
```

## Workflow

1. Read the user's list of items carefully.
2. Determine a logical grouping/categorization for the items (by area, component, severity, etc.).
3. For each item, derive:
   - A short descriptive title
   - The affected area (Frontend/Backend/Temporal/etc. + specific component)
   - Problem description (expand on what the user said, add technical context)
   - Expected behavior or resolution
   - Key files to investigate (use codebase knowledge or search if needed)
4. If an item is purely informational (e.g. "explain X to me"), use **Action:** instead of **Expected:** and note that no code changes are needed.
5. If the user provides log output or error messages with an item, include them in the problem description as a code block.
6. Build a Key Files Reference table at the bottom covering all areas mentioned.
7. Ask the user for the output filename if not obvious from context. Default location is `docs-md/`.
8. Write the file.

## Rules

- Items are numbered sequentially across all sections (not restarting per section).
- All checkboxes start unchecked: `[ ]`.
- Use `###` for individual items, `##` for category sections.
- Include `---` horizontal rules between sections.
- Do NOT invent issues the user didn't mention — only structure what they gave you.
- DO use codebase knowledge to fill in key files and technical context.
- Keep problem/expected descriptions concise but complete enough for someone to implement without re-asking the user.
- If the user specifies a context (e.g. "benchmarking system"), include it in the title and description.
