# US-053: Chase the lingering `borderColor` console warning (pending Alex's text)

**As a** maintainer of the V2 editor,
**I want** to eliminate the React `borderColor` / `borderLeftColor`
console warning Alex has been seeing,
**So that** the dev console stays clean.

## Acceptance Criteria

- [ ] **Scenario 1**: Reproduce
    - **Given** Alex pastes the exact dev-console text of the warning
    - **When** this story starts
    - **Then** the warning is reproduced locally with a deterministic interaction; the offending file:line is identified via the React DevTools or by reading the warning's component-stack

- [ ] **Scenario 2**: Audit
    - **Given** the recon already confirmed our code uses longhand consistently (`borderTopColor`, …, `borderLeftColor`) in `WorkflowEditorCanvas.tsx`
    - **When** the audit is run
    - **Then** the offending source is identified — either:
      - one of our other files mixing shorthand `border` with a longhand colour, OR
      - a Mantine internal we can opt out of via a `styles` prop or a longhand override

- [ ] **Scenario 3**: Fix
    - **Given** the identified source
    - **When** the file is edited
    - **Then** the warning stops firing in the previously-reproduced interaction; no behaviour change beyond removing the warning

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Status: BLOCKED on Alex's input

This is filed for visibility; it's gated on Alex pasting the exact
dev-console warning text. Defer until then.

## Files modified

- TBD (whichever file is identified by the audit).
