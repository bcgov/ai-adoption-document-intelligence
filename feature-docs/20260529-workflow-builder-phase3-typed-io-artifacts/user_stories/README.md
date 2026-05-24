NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone A — Shared package types/registry/subtype-check + schema extensions (US-089 to US-092) -- HIGH priority

| File | Title |
|---|---|
| [US-089-artifacts-module.md](./US-089-artifacts-module.md) | `artifacts.ts` — `ArtifactKind` union + provenance interfaces |
| [US-090-artifact-registry.md](./US-090-artifact-registry.md) | `artifact-registry.ts` — runtime registry + `registerArtifactKind` |
| [US-091-isassignable-subtype-check.md](./US-091-isassignable-subtype-check.md) | `subtype-check.ts` — `isAssignable(from, to)` walking the registry's `baseKind` chain |
| [US-092-schema-kind-extensions.md](./US-092-schema-kind-extensions.md) | Extend `PortDescriptor` + `CtxDeclaration` + `LibraryPortDescriptor` with `kind?: KindRef` |

## Milestone B — Backend binding-walk validator + library path depth-check (US-093 to US-094) -- HIGH priority

| File | Title |
|---|---|
| [US-093-binding-walk-validator.md](./US-093-binding-walk-validator.md) | Binding-walk type-check pass in `validateGraphConfig` |
| [US-094-library-path-depth-check.md](./US-094-library-path-depth-check.md) | Library `metadata.inputs[].path` depth-check in `validateGraphConfig` |

## Milestone C — Frontend canvas handle colour + type pill (US-095 to US-096) -- HIGH priority

| File | Title |
|---|---|
| [US-095-handle-colour-and-tooltip.md](./US-095-handle-colour-and-tooltip.md) | Canvas handle colour + hover tooltip |
| [US-096-on-selection-type-pill.md](./US-096-on-selection-type-pill.md) | On-selection type pill next to node handles |

## Milestone D — Frontend variable picker dim-with-tooltip (US-097) -- HIGH priority

| File | Title |
|---|---|
| [US-097-variable-picker-dim-tooltip.md](./US-097-variable-picker-dim-tooltip.md) | Variable picker — compatible-first ordering + dim-with-tooltip for incompatibles |

## Milestone E — Frontend "Kind" Select columns + signature summaries (US-098 to US-100) -- HIGH priority

| File | Title |
|---|---|
| [US-098-workflow-settings-drawer-kind-column.md](./US-098-workflow-settings-drawer-kind-column.md) | `WorkflowSettingsDrawer` ctx-row "Kind" Select column |
| [US-099-library-port-list-editor-kind-column.md](./US-099-library-port-list-editor-kind-column.md) | `LibraryPortListEditor` "Kind" Select column |
| [US-100-signature-summaries-surface-kind.md](./US-100-signature-summaries-surface-kind.md) | Library picker + child-workflow signature summaries surface `kind` |

## Milestone F — Catalog fan-out + provider catalog (US-101 to US-104) -- HIGH priority

| File | Title |
|---|---|
| [US-101-type-single-output-exemplars.md](./US-101-type-single-output-exemplars.md) | Type 4 single-output catalog exemplars (`document.split`, `mistral-ocr.process`, `document.validateFields`, `tables.lookup`) |
| [US-102-type-document-classify-multiport.md](./US-102-type-document-classify-multiport.md) | Type `document.classify` as the multi-typed-port exemplar |
| [US-103-bulk-catalog-test-invariant.md](./US-103-bulk-catalog-test-invariant.md) | Bulk catalog test — all-or-nothing per entry for `kind` annotations |
| [US-104-provider-catalog-scaffold.md](./US-104-provider-catalog-scaffold.md) | `provider-catalog.ts` scaffold + Azure OCR / Mistral OCR seed descriptors |

## Milestone G — End-to-end verification (US-105) -- HIGH priority

| File | Title |
|---|---|
| [US-105-end-to-end-verification.md](./US-105-end-to-end-verification.md) | End-to-end Playwright walkthrough — typed I/O artifacts |

## Suggested Implementation Order (by dependency chain)

Phase 3 has a clear linear backbone (shared package → backend → frontend → catalog fan-out → verification). Frontend stories within a milestone are independent and can land in parallel; backend stories within Milestone B are independent of each other.

### Phase 1 — shared package (Vite-restart point after Milestone A)
- [x] **US-089** (`artifacts.ts` — `ArtifactKind` union + provenance interfaces) — foundation; everything below depends on it
- [x] **US-090** (`artifact-registry.ts` + `registerArtifactKind`) — depends on US-089
- [x] **US-091** (`isAssignable` subtype check) — depends on US-090 (needs the registry's `baseKind` chain)
- [x] **US-092** (schema extensions — `PortDescriptor` + `CtxDeclaration` + `LibraryPortDescriptor`) — depends on US-089's `KindRef` alias

### Phase 2 — backend validator (depends on Phase 1)
- [x] **US-093** (binding-walk type-check pass) — consumes `isAssignable` from US-091 + all three `kind?` fields from US-092
- [x] **US-094** (library path depth-check) — sibling pass in the same validator entrypoint; independent of US-093 but shares the validator file

### Phase 3 — frontend canvas rendering (depends on Phase 1 + Vite restart)
- [x] **US-095** (handle colour + hover tooltip) — consumes `ARTIFACT_REGISTRY` (US-090) + new `kind?` fields on ports (US-092)
- [x] **US-096** (on-selection type pill) — independent of US-095 but visually adjacent; can land in parallel

### Phase 4 — frontend picker dim (depends on Phase 1 + Phase 3 patterns)
- [x] **US-097** (variable picker compatible-first + dim + tooltip) — consumes `isAssignable` (US-091) + same kind-resolution helper as US-093

### Phase 5 — frontend "Kind" Select columns + signature summaries (depends on Phase 1)
- [x] **US-098** (`WorkflowSettingsDrawer` Kind column) — first surface; produces `kind-select-options.ts` helper
- [x] **US-099** (`LibraryPortListEditor` Kind column) — reuses the helper from US-098
- [x] **US-100** (signature summaries surface kind — `LibraryPickerModal` + `ChildWorkflowNodeSettings`) — independent of US-098/099 but uses the same `<KindDot>` helper from US-095

### Phase 6 — catalog fan-out + provider catalog (depends on Phase 1; Phase 2/3/4/5 happy-path tests benefit from this landing)
- [ ] **US-101** (type 4 single-output exemplars) — independent
- [ ] **US-102** (type `document.classify` multi-port exemplar) — independent of US-101
- [ ] **US-103** (bulk catalog test invariant) — depends on US-101 + US-102 (the invariant needs typed entries to compare against the un-typed ones)
- [ ] **US-104** (`provider-catalog.ts` scaffold + 2 seed descriptors) — independent

### Phase 7 — end-to-end verification
- [ ] **US-105** (Playwright walkthrough — typed I/O end-to-end; screenshots in `/tmp/wb-phase3-verify/`)

> US-089 → US-091 ship first (`packages/graph-workflow` change); ask Alex to restart Vite — pre-bundle of `@ai-di/graph-workflow` goes stale otherwise. Phase 3 introduces NEW runtime exports (`ARTIFACT_REGISTRY` + `isAssignable`), so the restart is real (not types-only).
>
> Phase 3 (canvas rendering) is independent of Phase 4 (picker dim) and Phase 5 (Kind Select columns); they can land in any order after Phase 1 + Vite restart.
>
> Phase 6's catalog fan-out (US-101 + US-102) gives Phases 3 + 4 real catalog entries to verify against; without it, those phases' tests rely on synthetic fixtures only.
>
> US-105 must be the last story checked off — it verifies the integrated whole.
