***
name: test-planner
description: Converts requirements and user stories into structured test plans
allowed-tools: [Read, Glob, Grep, Edit, Write]
***

# Test Plan Generator

Read requirements and user stories from a feature directory and generate comprehensive test plans.

## Input
- Feature directory path (e.g., `feature-docs/003-benchmarking-system/`)

## Process
1. Read `requirements.md` (or `REQUIREMENTS.md`) from the feature directory
2. Read all files in the `user-stories/` subdirectory
3. Analyze and extract testable scenarios for each requirement
4. Identify happy paths, edge cases, and error scenarios
5. Map acceptance criteria to test cases

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
```

### Summary File Format (`README.md`):
```markdown
# Test Plans Overview

**Feature**: {Feature name from requirements.md}
**Generated**: {timestamp}

## Test Plan Files

| User Story | File | Scenarios | Priority | Status |
|------------|------|-----------|----------|--------|
| US-001     | [US-001.md](./US-001.md) | 5 | High | ✅ Ready |
| US-002     | [US-002.md](./US-002.md) | 3 | Medium | ✅ Ready |

## Coverage Summary
- **Total Scenarios**: {count}
- **Happy Paths**: {count}
- **Edge Cases**: {count}
- **Error Cases**: {count}

## Cross-Feature Dependencies
{List any dependencies on other features}

## Test Data Requirements
{Consolidated list of all test data needed}
```

Group related scenarios within each user story file. Include authentication requirements, data setup needs, and inter-feature dependencies.

## Important References
- Always refer to the feature's `requirements.md` for the source of truth on expected behavior
- Cross-reference user stories in the `user-stories/` folder to understand acceptance criteria
- When unclear about expected behavior, flag it in the test plan with a `⚠️ CLARIFICATION NEEDED` marker
