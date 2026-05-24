NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

**Numbering note:** Phase 3 closed at US-105 (Phase 3 typed I/O artifacts). Phase 8 numbering continues from US-106.

## Milestone A — Shared schema + source catalog scaffold (US-106 to US-110) -- HIGH priority

| File | Title |
|---|---|
| [US-106-source-node-type-variant.md](./US-106-source-node-type-variant.md) | `SourceNode` type variant + `NodeType` union extension |
| [US-107-source-catalog-types.md](./US-107-source-catalog-types.md) | `source-types.ts` — `SourceCatalogEntry` / `SourceRuntimePattern` / `FieldDescriptor` |
| [US-108-source-catalog-registry.md](./US-108-source-catalog-registry.md) | `source-catalog.ts` — `SOURCE_CATALOG` + helpers (`getSourceCatalogEntry` / `listSourceTypes` / `createSourceParameterValidator` / `deriveSourceOutputSchema`) |
| [US-109-source-node-structural-validation.md](./US-109-source-node-structural-validation.md) | `SourceNode` structural validation + `source.api` ⇄ `isInput` warning |
| [US-110-binding-walk-source-producers.md](./US-110-binding-walk-source-producers.md) | Binding-walk integration — source nodes as kind-bearing ctx producers |

## Milestone B — Backend API surface (US-111 to US-114) -- HIGH priority

| File | Title |
|---|---|
| [US-111-derive-input-schema-precedence.md](./US-111-derive-input-schema-precedence.md) | `deriveInputSchema()` precedence — source.api > library > isInput > empty |
| [US-112-run-spec-upload-spec.md](./US-112-run-spec-upload-spec.md) | `GET /run-spec` `uploadSpec?` extension for `source.upload` |
| [US-113-runs-body-validation-precedence.md](./US-113-runs-body-validation-precedence.md) | `POST /runs` body-validation precedence |
| [US-114-source-upload-endpoint.md](./US-114-source-upload-endpoint.md) | `POST /api/workflows/:id/sources/:sourceNodeId/upload` — multipart upload endpoint |

## Milestone C — Catalog entries (US-115 to US-116) -- HIGH priority

| File | Title |
|---|---|
| [US-115-source-api-catalog-entry.md](./US-115-source-api-catalog-entry.md) | `source-api.ts` — `source.api` catalog entry |
| [US-116-source-upload-catalog-entry.md](./US-116-source-upload-catalog-entry.md) | `source-upload.ts` — `source.upload` catalog entry |

## Milestone D — Frontend palette + renderer + settings + FieldListEditor (US-117 to US-121) -- HIGH priority

| File | Title |
|---|---|
| [US-117-source-node-renderer.md](./US-117-source-node-renderer.md) | `SourceNodeRenderer` — canvas custom-node for source nodes |
| [US-118-sources-palette-section.md](./US-118-sources-palette-section.md) | "Sources" palette section + `source-catalog-utils` |
| [US-119-source-node-settings-panel.md](./US-119-source-node-settings-panel.md) | `SourceNodeSettings` panel + `NodeSettingsPanel` dispatch |
| [US-120-field-list-editor.md](./US-120-field-list-editor.md) | `FieldListEditor` x-widget — `source.api` `fields[]` editor |
| [US-121-entry-node-autoset.md](./US-121-entry-node-autoset.md) | `entryNodeId` autoset on source-node-first drop |

## Milestone E — Run drawer extensions + source.upload Test Upload (US-122 to US-124) -- HIGH priority

| File | Title |
|---|---|
| [US-122-use-source-upload-hook.md](./US-122-use-source-upload-hook.md) | `useSourceUpload` TanStack mutation hook |
| [US-123-run-drawer-source-sections.md](./US-123-run-drawer-source-sections.md) | `RunWorkflowDrawer` — up-to-two source sections |
| [US-124-source-upload-button-settings.md](./US-124-source-upload-button-settings.md) | `SourceUploadButton` on `source.upload` settings panel |

## Milestone F — End-to-end verification (US-125) -- HIGH priority

| File | Title |
|---|---|
| [US-125-end-to-end-verification.md](./US-125-end-to-end-verification.md) | End-to-end Playwright walkthrough — Phase 8 document sources |

## Suggested Implementation Order (by dependency chain)

Phase 8 has a clear linear backbone (shared package → backend → catalog entries → frontend → Run drawer → verification). Most stories within a milestone can land in parallel; later milestones depend on earlier ones in full. After Milestone A (US-108 introduces `SOURCE_CATALOG` as a runtime export) and Milestone C (catalog entries are runtime exports), **ask Alex to restart Vite** — the package pre-bundle goes stale otherwise.

### Phase 1 — shared package (Milestone A — Vite-restart point after US-108)
- [x] **US-106** (`SourceNode` type + `NodeType` union extension) — foundation; everything below depends on it
- [x] **US-107** (`source-types.ts` — catalog entry types) — depends on US-106 (and Phase 3's `KindRef`)
- [x] **US-108** (`source-catalog.ts` registry + helpers) — depends on US-107 (consumes the types)
- [x] **US-109** (SourceNode structural validation + source.api ⇄ isInput warning) — depends on US-106 + US-108 (uses `getSourceCatalogEntry`)
- [x] **US-110** (binding-walk integration for source-derived ctx producers) — depends on US-108 + Phase 3's binding-walk (US-093); independent of US-109 but shares the validator file

### Phase 2 — backend API surface (Milestone B — depends on Phase 1)
- [x] **US-111** (`deriveInputSchema()` precedence) — depends on US-108 (uses `getSourceCatalogEntry` + `deriveSourceOutputSchema`)
- [x] **US-112** (`GET /run-spec` `uploadSpec?` extension) — depends on US-111
- [x] **US-113** (`POST /runs` body-validation precedence) — depends on US-111
- [x] **US-114** (`POST /sources/:id/upload` multipart endpoint) — independent of US-111/112/113; shares the controller file though

### Phase 3 — catalog entries (Milestone C — Vite-restart point after both stories land)
- [ ] **US-115** (`source-api.ts` catalog entry) — depends on US-108 + US-107
- [ ] **US-116** (`source-upload.ts` catalog entry) — depends on US-108 + US-107; independent of US-115

### Phase 4 — frontend palette + renderer + settings + FieldListEditor (Milestone D — depends on Phase 1 + Phase 3)
- [ ] **US-117** (`SourceNodeRenderer`) — depends on US-115/116 (uses `outputKind`) and Phase 3's handle-colour helper
- [ ] **US-118** ("Sources" palette section + `source-catalog-utils`) — depends on US-115/116 (palette reads `SOURCE_CATALOG`)
- [ ] **US-119** (`SourceNodeSettings` panel + dispatch) — depends on US-115/116 (renders `parametersSchema`); can land in parallel with US-117/118
- [ ] **US-120** (`FieldListEditor` x-widget) — depends on Phase 3's Kind Select helper (US-098) + US-119's panel registering the x-widget
- [ ] **US-121** (`entryNodeId` autoset on source-first drop) — independent of US-117/118/119/120; depends only on US-115/116 for the palette catalog lookup

### Phase 5 — Run drawer + SourceUploadButton (Milestone E — depends on Phase 2 + Phase 4)
- [ ] **US-122** (`useSourceUpload` TanStack hook) — depends on US-114 (the endpoint)
- [ ] **US-123** (`RunWorkflowDrawer` up-to-two sections) — depends on US-112 (new `/run-spec` shape) + US-122 (the upload hook for the Dropzone path)
- [ ] **US-124** (`SourceUploadButton` on source.upload settings panel) — depends on US-119 (the settings panel) + US-122 (the upload hook); can land in parallel with US-123

### Phase 6 — end-to-end verification (Milestone F)
- [ ] **US-125** (Playwright walkthrough — Phase 8 document sources; screenshots in `/tmp/wb-phase8-verify/`)

> US-106 → US-108 ship first (`packages/graph-workflow` change); after merging US-108 ask Alex to restart Vite — pre-bundle of `@ai-di/graph-workflow` goes stale otherwise. Phase 8 introduces NEW runtime exports (`SOURCE_CATALOG` + helpers), so the restart is real (not types-only).
>
> Milestone B (US-111 → US-114) can run in parallel with Milestone C (US-115 → US-116) once Phase 1 is done — both depend only on Milestone A, not on each other. But the frontend work (Milestone D) requires BOTH C (catalog entries) AND the package-build/Vite-restart cycle, so practically the order is A → C-and-B-parallel → D → E → F.
>
> After Milestone C lands, **ask Alex to restart Vite a second time** — the catalog entries themselves are runtime exports. Milestone D's verification surfaces depend on the catalog being live in the bundle.
>
> US-125 must be the last story checked off — it verifies the integrated whole and produces the SESSION_HANDOFF closeout notes.
