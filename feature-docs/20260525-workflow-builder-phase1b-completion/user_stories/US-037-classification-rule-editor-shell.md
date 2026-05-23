# US-037: `ClassificationRuleEditor` list shell — add/remove rules

**As a** workflow author writing classification rules for
`document.classify`,
**I want** a list shell where each entry is a rule (`name`, `resultType`)
that opens its own pattern editor,
**So that** I can author rule-based classifiers in V2.

## Acceptance Criteria

- [ ] **Scenario 1**: Empty + add
    - **Given** `value: []`
    - **When** "Add rule" is clicked
    - **Then** `onChange` fires with one default rule: `{ name: "", resultType: "", patterns: [<one empty pattern>] }`

- [ ] **Scenario 2**: Each row exposes `name`, `resultType` TextInputs + the patterns sub-editor (US-038)
    - **Given** a single rule
    - **When** rendered
    - **Then** TextInputs for `name` and `resultType` are present (both required, with asterisks)
    - **And** a placeholder for the patterns body (US-038's `ClassificationPatternRows`) renders below

- [ ] **Scenario 3**: Removing a rule shrinks the list
    - **Given** an editor with two rules
    - **When** the trash icon on the first row is clicked
    - **Then** `onChange` fires with an array containing only what was the second rule

- [ ] **Scenario 4**: Root testid + dispatch
    - **Given** any value
    - **When** rendered
    - **Then** the root carries `data-testid="classification-rule-editor"` for routing tests

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ClassificationRuleEditor.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ClassificationRuleEditor.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts` — re-export.
