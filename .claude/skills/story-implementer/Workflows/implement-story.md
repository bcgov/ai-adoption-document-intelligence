# Implement Story Scenarios

This workflow is used by the story-implementer orchestrator. The orchestrator reads this file and substitutes the variables below before passing to the Agent tool.

## Subagent Prompt Template

The Agent tool should be invoked with a prompt constructed as follows:

---

You are implementing a user story for this project. Follow ALL rules in CLAUDE.md strictly.

### Your Assignment

**Story**: {STORY_ID} - {STORY_TITLE}

**Scenarios to implement**: {SCENARIO_LIST}

**Story file path**: {STORY_FILE_PATH}

**Requirements document**: Read the requirements at {REQUIREMENTS_PATH} for full context.

### Story Content

{FULL_STORY_FILE_CONTENT}

### Implementation Instructions

#### Phase 1: Explore & Plan (before writing any code)

1. Read the requirements document at {REQUIREMENTS_PATH} for full project context
2. Read CLAUDE.md for project rules you must follow
3. Read each scenario's Given/When/Then carefully and identify:
   - Which apps/packages are affected (backend-services, temporal, frontend, shared)
   - Which existing files need to be modified vs. new files to create
   - Existing patterns, utilities, or similar implementations to reuse
4. Write a brief plan summarizing:
   - Files to create or modify (with paths)
   - Existing patterns or code to reuse
   - Any ambiguities or gaps found — surface these to the user BEFORE implementing
5. Only proceed to Phase 2 after your plan is clear and there are no blocking questions

#### Phase 2: Implement

6. For each scenario in your assignment:
   a. Implement the scenario fully (no stubs, no placeholders)
   b. For backend changes: create/update tests and run them (`npm run test` from the relevant app directory)
   c. For frontend changes: run typecheck (`npm run typecheck`)
   d. After the scenario is fully working, edit {STORY_FILE_PATH} and change that scenario's `- [ ]` to `- [x]`
7. After all assigned scenarios are complete, provide a summary of:
   - Files created or modified
   - Tests added or updated
   - Any gaps or questions that came up (per CLAUDE.md: do not assume, report gaps)

### Rules You Must Follow

- Implement ONLY the scenarios assigned to you, not others
- Check off EACH scenario in the story file as you complete it (change `- [ ]` to `- [x]`)
- Do NOT modify the README.md (the orchestrator handles that)
- Do NOT commit (the orchestrator handles commits)
- Follow all CLAUDE.md rules: no "any" types, no placeholders, create tests for backend, update docs-md, no document-specific implementations
- If you need to run `npx prisma generate`, use `npm run db:generate` from `apps/backend-services`
- If something is ambiguous or unclear, stop and ask the user rather than guessing
- Do not add backwards compatibility features
- The system is generic and must support arbitrary workloads

{BATCH_NOTE}

---

## Variable Reference

| Variable | Source |
|----------|--------|
| STORY_ID | Extracted from story filename (e.g., US-001) |
| STORY_TITLE | First heading in story file |
| SCENARIO_LIST | "All scenarios" or "Scenarios 1-4" etc. |
| STORY_FILE_PATH | Absolute path to the story .md file |
| REQUIREMENTS_PATH | Extracted from README.md NOTE line |
| FULL_STORY_FILE_CONTENT | Complete contents of the story .md file |
| BATCH_NOTE | Empty string for single subagent, or "This is batch N of M. Only implement the specified scenarios. Check off each scenario as you complete it." for batched |

## Common Pitfalls

- Forgetting to check off scenarios in the story file — the orchestrator relies on these checkboxes to verify completion
- Committing changes — the subagent must NOT commit; the orchestrator does this after verifying all scenarios
- Modifying README.md — the subagent must NOT touch the README; only the orchestrator updates it
- Making assumptions about unclear requirements — always surface questions to the user
