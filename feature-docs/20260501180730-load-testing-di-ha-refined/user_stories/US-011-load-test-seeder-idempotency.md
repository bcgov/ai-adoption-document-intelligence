# US-011: Load-test seeder idempotency documentation and operator flow

**As a** developer or platform engineer rerunning synthetic dataset loads,
**I want to** understand how to re-seed the same group and id prefix without surprise failures,
**So that** repeated runs are predictable and failures are actionable.

## Acceptance Criteria
- [x] **Scenario 1**: Explicit rerunnable flow is documented
    - **Given** toolkit documentation (`tools/load-testing/README.md` and/or `docs-md/LOAD_TESTING.md`)
    - **When** I read how to run the seeder twice for the same `--group-id` and synthetic id prefix
    - **Then** I find copy-paste steps that yield a clean rerun (for example `--delete-by-prefix` before insert, or an equivalent documented sequence).

- [x] **Scenario 2**: Non-idempotent rerun behavior is explained
    - **Given** I run the seeder again without cleanup against an overlapping id range
    - **When** the database rejects duplicate primary keys (or equivalent constraint violation)
    - **Then** documentation states that this is expected, names the failure mode, and points to the rerunnable flow in Scenario 1.

- [x] **Scenario 3**: Idempotent pattern ties to deterministic prefix
    - **Given** generated synthetic ids use a fixed prefix (for example `ldt-`)
    - **When** documentation describes idempotent reruns
    - **Then** it references that prefix and `--delete-by-prefix` scope (same group, prefixed ids only).

- [x] **Scenario 4**: Requirements traceability
    - **Given** `../REQUIREMENTS.md` FR-2a
    - **When** this story is implemented
    - **Then** the documented behavior satisfies FR-2a acceptance criterion #3 (idempotent rerun flow demonstration).

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-2a (Seeder Idempotency); depends on US-002 seeder existing.
- Does not require changing default insert semantics unless product chooses automatic upsert; documenting duplicate-key expectation is sufficient when rerun path uses cleanup first.
