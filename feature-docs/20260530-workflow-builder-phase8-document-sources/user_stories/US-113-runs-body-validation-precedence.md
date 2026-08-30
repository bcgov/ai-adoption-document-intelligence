# US-113: `POST /runs` body-validation precedence

**As an** API consumer hitting `POST /api/workflows/:id/runs`,
**I want** body validation to use the same precedence as `/run-spec`,
**So that** the schema described by `/run-spec` IS the schema my body is validated against — no drift between description and enforcement.

## Acceptance Criteria

- [x] **Scenario 1**: source.api fields drive `/runs` validation
    - **Given** a workflow with a `source.api` declaring `fields: [{ name: "documentUrl", type: "string", required: true }]`
    - **When** a client POSTs `{}` to `/api/workflows/:id/runs`
    - **Then** the backend returns 400 with the existing `validateRunInput` error shape indicating `documentUrl` is required
    - **And** POSTing `{ "documentUrl": "https://example.com/doc.pdf" }` succeeds and starts a Temporal execution (returns `{ workflowId: "graph-adhoc-…", status: "started", … }`)

- [x] **Scenario 2**: legacy `isInput` fallback unchanged
    - **Given** a workflow with NO source nodes and a `CtxDeclaration` flagged `isInput: true`
    - **When** a client POSTs to `/runs`
    - **Then** validation derives from `isInput`-flagged ctx exactly as Phase 2 Track 2 — no behaviour change
    - **And** the existing Phase 2 Track 2 controller test for this path still passes

- [x] **Scenario 3**: strict allowlist on source.api body
    - **Given** a workflow with a source.api declaring 2 fields (`documentUrl: string/required`, `priority: number/optional`)
    - **When** a client POSTs `{ "documentUrl": "...", "priority": 1, "extra": true }`
    - **Then** the backend returns 400 — the `extra` field is rejected by `validateRunInput`'s existing strict allowlist behaviour (same as Phase 2 Track 2)

- [x] **Scenario 4**: regression — `workflowVersionId` still works orthogonally
    - **Given** a workflow with a source.api and multiple versions
    - **When** a client POSTs `{ ...validBody, "workflowVersionId": "<v1.id>" }`
    - **Then** validation runs against THAT version's source.api (the version's `config` is the source of truth, NOT the head)
    - **And** the execution runs against the pinned version

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/workflow.controller.ts` — update `POST /:id/runs` to fetch the input schema via the US-111 precedence-aware helper instead of the Track-2 isInput-only path
- `apps/backend-services/src/workflow/workflow.controller.spec.ts` — Scenarios 1, 3, 4 explicit tests; verify Scenario 2 (existing test) still passes

## Technical notes

- This story is a single-call-site refactor: replace the `deriveInputSchema` call site to use the new precedence (US-111 already extended the helper). The validation path itself (`validateRunInput`) is unchanged.
- For Scenario 4, the existing `resolveLineageAndVersion(...)` flow already fetches the right `wf.config`. The schema derivation just needs to read from THAT config, not the head.
- DO NOT add any new endpoints in this story. The new `/sources/:id/upload` endpoint is US-114.
- After this story merges, every existing `/runs` integration test should still pass (Phase 2 Track 2 + Phase 2 Track 3 regression). New precedence-specific tests add coverage on top.
