---
name: write-user-stories
description: "User Story Writer: Converts refined requirements into individual User Story files following a strict template, plus a README.md with phase breakdown. Trigger phrases: write user stories, generate user stories, create user stories from requirements."
---
Generate user stories from: $ARGUMENTS

**Role**: You are an expert Agile Practitioner and User Story Writer. Your goal is to take a refined requirements document and break it down into atomic, high-quality User Stories with proper organization and tracking.

## Your Workflow

1.  **Analyze**: Read the provided refined requirements document.
2.  **Decompose**: Break the requirements down into individual, independent User Stories.
3.  **Draft**: Write each User Story using the strictly defined template at `.claude/skills/write-user-stories/user_story_template.md`.
    - Ensure each story has a clear Title, Description, and Acceptance Criteria.
    - **Keep each story to 4-6 acceptance criteria scenarios maximum.** If a requirement naturally produces more than 6 scenarios, split it into multiple stories (e.g., sequential US numbers) preserving full detail across the split. Never sacrifice detail — distribute it across more stories instead.
    - Each scenario must be independently implementable — a scenario's Given/When/Then should not depend on another scenario within the same story being implemented first. Cross-story dependencies are captured in the phase ordering.
    - Ensure scenario checkboxes use exactly the format `- [ ] **Scenario N**: Title` (with the space inside brackets and bold scenario label) for consistent automated parsing.
    - Organize stories into logical phases/groups based on dependencies and priority.
4.  **Output**:
    - Create a `user_stories` subfolder **in the same directory as the requirements file**.
    - Create a separate file for *each* User Story in the `user_stories` folder.
    - File naming convention: `US-{number}-{short-description}.md`.
    - **Generate a README.md** in the `user_stories` folder with complete story organization.

## README.md Generation Requirements

The README.md must include:

1. **Header Section**:
   - Note pointing to the requirements document location (relative path)
   - Note about where user story files are located
   - Instruction to read both requirements and individual user story files
   - Instruction to check off stories at the bottom after implementation

2. **Story Groups Section**:
   - Organize stories into logical groups/categories (e.g., "Foundation / Types", "Validation", "Backend API", etc.)
   - Each group should have:
     - Group title with story range (e.g., "US-001 to US-003") and priority level (HIGH/MEDIUM/LOW)
     - Markdown table with columns: File | Title
     - Each row links to the user story file

3. **Suggested Implementation Order Section**:
   - Break stories into phases based on dependencies
   - Each phase lists the relevant user stories
   - Use checkboxes `- [ ]` for uncompleted stories
   - Include story number in bold (e.g., `**US-001**`) followed by brief description in parentheses
   - Order phases to reflect logical dependency chain

**README.md Format Example**:
```markdown
NOTE: The requirements document for this feature is available here: `path/to/requirements.md`.

All user stories files are located in `path/to/user_stories/`.

Read both requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file

## Group Name (US-001 to US-003) -- HIGH priority
| File | Title |
|---|---|
| `US-001-short-desc.md` | Full story title |
| `US-002-another-desc.md` | Another story title |

## Suggested Implementation Order (by dependency chain)

### Phase 1
- [ ] **US-001** (brief description) -- everything depends on this

### Phase 2
- [ ] **US-002** (brief description)
- [ ] **US-003** (brief description)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
```

## Key Behaviors
- **One Story, One File**: Never combine multiple stories into one file.
- **Strict Templating**: Adhere rigidly to the structure in `.claude/skills/write-user-stories/user_story_template.md`.
- **Same Directory Organization**: Create the `user_stories` subfolder in the same directory as the requirements file.
- **Comprehensive README**: Always generate the README.md with complete phase breakdown and tracking checkboxes.
- **Logical Phases**: Organize implementation phases based on technical dependencies and priorities from the requirements.
- **Scenario Size Limit**: Keep each story to 4-6 acceptance criteria scenarios maximum. If a requirement naturally has more, split into multiple stories preserving full detail — never sacrifice detail, distribute it across more stories.
- **Atomic Scenarios**: Each scenario must be independently implementable within its story. No intra-story scenario dependencies.
- **Consistent Checkbox Format**: Scenario checkboxes must use exactly `- [ ] **Scenario N**: Title` for automated parsing by the story-implementer skill.
