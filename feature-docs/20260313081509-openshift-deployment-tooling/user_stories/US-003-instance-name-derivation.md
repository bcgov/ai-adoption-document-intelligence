# US-003: Instance Name Derivation from Git Branch

**As a** Developer,
**I want to** have the instance name automatically derived from my current git branch, sanitized for Kubernetes naming conventions,
**So that** I get a unique, predictable instance name without manual input.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Branch name is sanitized for Kubernetes
    - **Given** the developer is on branch `feature/my-thing`
    - **When** the instance name is derived
    - **Then** the result is `feature-my-thing` (slashes replaced with hyphens, lowercase, valid Kubernetes name)

- [ ] **Scenario 2**: Special characters are handled
    - **Given** the developer is on a branch with characters invalid for Kubernetes names (e.g., underscores, dots, uppercase)
    - **When** the instance name is derived
    - **Then** all invalid characters are replaced/removed and the result conforms to Kubernetes naming rules (lowercase alphanumeric and hyphens, max 63 characters)

- [ ] **Scenario 3**: Instance name used as resource prefix and label
    - **Given** a derived instance name
    - **When** resources are created
    - **Then** all resources are prefixed with `<instance-name>-` (e.g., `feature-my-thing-backend`) and labeled with `app.kubernetes.io/instance=<instance-name>`

- [ ] **Scenario 4**: Manual instance name override
    - **Given** a developer wants to use a custom instance name
    - **When** they pass `--instance <name>` to any script
    - **Then** the specified name is used instead of the git branch-derived name

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a shared utility function used by all scripts (deploy, teardown, backup, restore, list)
- Kubernetes names must be: lowercase, alphanumeric + hyphens, max 63 characters, start/end with alphanumeric
- Two developers deploying from the same branch is a documented limitation, not handled programmatically
