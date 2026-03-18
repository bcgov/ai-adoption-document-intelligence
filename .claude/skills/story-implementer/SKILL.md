---
name: story-implementer
description: "Implements user stories from a user_stories directory in dependency order using subagents. Reads README.md to find the next unchecked story, spawns Agent tool subagents to implement each one, tracks progress via scenario checkboxes in story files and story checkboxes in README. Trigger phrases: implement stories, implement user stories, story implementer, work on stories, implement next story. Do NOT invoke for: writing user stories (use write-user-stories), general code changes, checklist execution."
---

Implement user stories from: $ARGUMENTS

**Role**: You are an implementation orchestrator. You read a user stories README.md, identify the next unimplemented story, and dispatch subagents to implement them one at a time in dependency order.

## Input

$ARGUMENTS should be a path to either:
- A `user_stories/README.md` file, OR
- A `user_stories/` directory (read README.md inside it), OR
- A feature-docs directory containing a `user_stories/` subfolder

If no argument is provided, look for the most recently modified directory under `feature-docs/` that contains `user_stories/README.md`.

## Orchestration Algorithm

### Step 1: Read README.md and locate context

1. Read the `user_stories/README.md` file
2. Extract the path to the requirements document from the NOTE line at the top
3. Identify the base directory (the parent of `user_stories/`)

### Step 2: Find the next unchecked story

1. Go to the "Suggested Implementation Order" section
2. Find the first line matching `- [ ] **US-XXX**`
3. Extract the story ID (e.g., `US-001`)
4. If no unchecked stories remain, report completion to the user and stop

### Step 3: Read the story file and assess size

1. Find the story file matching the ID in the `user_stories/` directory (e.g., `US-001-*.md`)
2. Read the story file
3. Count the number of `- [ ]` scenario checkboxes in the Acceptance Criteria section
4. Decide the implementation strategy:
   - **8 or fewer unchecked scenarios**: Send ALL to a single subagent
   - **More than 8 unchecked scenarios**: Split into batches of 4-6 scenarios, send to sequential subagents

### Step 4: Dispatch subagent(s)

Read the workflow template from `.claude/skills/story-implementer/Workflows/implement-story.md` and construct the subagent prompt by substituting the variables.

Use the **Agent tool** to spawn the subagent. Pass the constructed prompt as the `prompt` parameter.

**For a single subagent (all scenarios fit):**
- Pass the full story file content
- Pass the requirements document path
- Pass the list of ALL scenario numbers to implement
- Pass the story file path (so subagent can check off scenarios)

**For batched scenarios:**
- For each batch:
  - Pass the full story file content
  - Pass the requirements document path
  - Pass the specific scenario numbers for THIS batch only (e.g., "Scenarios 1-4")
  - Pass the story file path
  - Add batch note: "This is batch N of M. Only implement the specified scenarios."
  - After each batch subagent completes, re-read the story file to verify the scenarios were checked off
  - Then dispatch the next batch

### Step 5: Verify story completion

After the subagent(s) finish:
1. Re-read the story file
2. Verify ALL scenario checkboxes are `[x]`
3. If any scenarios remain unchecked, report which ones to the user and ask whether to retry or skip

### Step 6: Mark story complete and commit

1. In `user_stories/README.md`, change the line `- [ ] **US-XXX**` to `- [x] **US-XXX**`
2. Stage all changes and commit with message: `feat: implement US-XXX - <story title>`
   - Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
3. Report to the user: which story was completed, summary of what was implemented

### Step 7: Loop

Return to Step 2 to find the next unchecked story. Continue until all stories are implemented or the user interrupts.

## Rules

- Implement stories strictly in the order listed in the README (respect dependency chain)
- Never skip a story without user approval
- Always re-read README.md fresh before each iteration (it may have been modified)
- Each subagent MUST follow all CLAUDE.md rules (tests for backend, proper typing, no placeholders, update docs-md)
- Auto-commit after each STORY (not each scenario)
- If a subagent encounters a question or ambiguity, it should surface it to the user rather than making assumptions
- Do not modify the story file format beyond checking off scenario checkboxes
- The orchestrator never implements code directly — always delegate to subagents via Agent tool

## Workflow Reference

- [Implement a single story](Workflows/implement-story.md) — subagent prompt template for implementing scenarios within a story
