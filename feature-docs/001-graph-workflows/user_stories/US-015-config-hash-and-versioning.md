# US-015: Implement Config Hash Computation and Version Management

**As a** developer,
**I want to** have a config hash computation utility and version management for graph workflows,
**So that** workflow execution integrity can be verified during replay and semantically identical configs produce the same hash for deduplication.

## Acceptance Criteria
- [ ] **Scenario 1**: Config hash is computed via canonicalization and SHA-256
    - **Given** a `GraphWorkflowConfig` object
    - **When** `computeConfigHash` is called
    - **Then** the config is deep-cloned, defaults are filled in, keys are recursively sorted, the result is stringified, and a SHA-256 hex hash is returned

- [ ] **Scenario 2**: Semantically identical configs produce the same hash
    - **Given** two config objects that differ only in JSON key order or missing default values
    - **When** `computeConfigHash` is called on both
    - **Then** both produce the same hash string

- [ ] **Scenario 3**: Config hash is included in workflow input
    - **Given** a graph workflow is started
    - **When** the `GraphWorkflowInput` is constructed
    - **Then** the `configHash` field contains the computed SHA-256 hash

- [ ] **Scenario 4**: Runner version is included in workflow input
    - **Given** a graph workflow is started
    - **When** the `GraphWorkflowInput` is constructed
    - **Then** the `runnerVersion` field contains the current graph runner semver string (e.g., "1.0.0")

- [ ] **Scenario 5**: Schema version is validated at load time
    - **Given** a graph config with `schemaVersion: "2.0"` (unrecognized)
    - **When** the graph runner loads the config
    - **Then** the runner rejects it with a clear error

- [ ] **Scenario 6**: Runner version mismatch during replay logs a warning
    - **Given** a workflow being replayed where `runnerVersion` in the input differs from the current runner version
    - **When** the runner starts
    - **Then** a warning is logged; if the difference is a major version change, the replay fails with a clear error

- [ ] **Scenario 7**: Database workflow version increments on config change
    - **Given** an existing workflow record is updated with a changed config
    - **When** the update is saved
    - **Then** the `Workflow.version` counter is incremented (detected via stable stringify comparison)

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Config hash algorithm detailed in Section 12.2
- Three version dimensions described in Section 12.1: schemaVersion, runnerVersion, Workflow.version
- Replay safety requirements in Section 12.3
- The `computeConfigHash` function must be deterministic and usable in both backend and Temporal worker contexts
- Tests must cover: config hash matches recomputed hash, stable topo sort produces same order (Section 15.6)
