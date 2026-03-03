# US-019: Exploration document for AI-generated correction nodes

**As a** product or tech lead,
**I want** a short design/exploration document in `/docs` that describes at least two approaches (e.g. AI-generated rule config vs AI-generated code) for having AI generate custom correction nodes on the fly, including risks and validation strategy,
**So that** we can decide whether and how to implement AI-generated nodes in a later iteration.

## Acceptance Criteria
- [ ] **Scenario 1**: At least two approaches described
    - **Given** the exploration document
    - **When** a reader opens it
    - **Then** it describes at least two approaches (e.g. AI-generated rule config vs AI-generated code, or hybrid), with options, constraints (e.g. determinism for Temporal), and a recommendation

- [ ] **Scenario 2**: Risks and validation strategy
    - **Given** the document
    - **When** a reader evaluates implementation
    - **Then** it covers risks and a validation strategy (e.g. schema, sandbox, or review) for any generated node before use in a workflow

- [ ] **Scenario 3**: No placeholder implementations
    - **Given** the scope is exploration only
    - **When** the feature is delivered
    - **Then** no placeholder or stub implementations are required; if one approach is later implemented, it must include validation and be documented

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature 005 Step 3. Exploration only unless one approach is chosen for implementation.
