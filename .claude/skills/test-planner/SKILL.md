---
name: test-planner
description: Converts requirements and user stories into structured test plans for UI testing
---

# Test Plan Generator

Read requirements and user stories from a feature directory and generate comprehensive test plans.

## Input
- Feature directory path (e.g., `feature-docs/003-benchmarking-system/`)

## Process
1. Read `requirements.md` (or `REQUIREMENTS.md`) from the feature directory
2. Read all files in the `user-stories/` subdirectory
3. **Filter: Only include user stories with UI interactions** (forms, buttons, pages, navigation, displays, modals, etc.). Skip pure API/backend/infrastructure stories.
4. Analyze and extract testable scenarios for each UI-focused requirement
5. Identify happy paths, edge cases, and error scenarios
6. Map acceptance criteria to test cases

## Output
Create separate test plan files in `{feature-dir}/playwright/test-plans/`:

### File Structure:
- One file per user story: `{feature-dir}/playwright/test-plans/{user-story-id}.md`
- Summary file: `{feature-dir}/playwright/test-plans/README.md` (index of all test plans)

### Individual Test Plan File Format:
```markdown
# Test Plan: {User Story ID} - {User Story Title}

**Source**: `user-stories/{user-story-id}.md`
**Requirement Section**: [Section from requirements.md]
**Priority**: High/Medium/Low

## User Story
{Full user story text from the source file}

## Acceptance Criteria
{Acceptance criteria from the user story}

## Test Scenarios

### Scenario 1: {Descriptive scenario name}
- **Type**: Happy Path / Edge Case / Error Case
- **Priority**: High/Medium/Low

**Given**: [Initial state/preconditions]
**When**: [User action or system event]
**Then**: [Expected outcome]

**Affected Pages**: [List of pages involved]
**Data Requirements**: [Test data needed]
**Prerequisites**: [Auth state, permissions, etc.]

### Scenario 2: {Another scenario}
[... repeat structure ...]

## Coverage Analysis
- ✅ Happy path covered
- ✅ Edge cases covered
- ✅ Error handling covered
- ⚠️ Missing: [Any gaps identified]
