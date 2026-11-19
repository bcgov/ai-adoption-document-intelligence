# US-104: `provider-catalog.ts` scaffold + Azure OCR / Mistral OCR seed descriptors

**As a** Phase 5 implementer (segmentation node pack),
**I want** the provider-descriptor type + 2 seed entries to land in Phase 3,
**So that** when Phase 5 adds the dropdown UX I'm not introducing the abstraction at the same time as the consumer.

## Acceptance Criteria

- [x] **Scenario 1**: `ProviderDescriptor` interface declared
    - **Given** `packages/graph-workflow/src/catalog/provider-catalog.ts` (new file)
    - **When** read
    - **Then** it exports `interface ProviderDescriptor { id: string; displayName: string; category: "ocr" | "vlm" | "classifier" | "validator"; acceptsKind: KindRef; returns: KindRef }`
    - **And** the file imports `KindRef` from the package's `types/artifacts` module (US-089)

- [x] **Scenario 2**: `PROVIDER_CATALOG` constant exported with 2 seed entries
    - **Given** the same file
    - **When** read
    - **Then** it exports `const PROVIDER_CATALOG: ProviderDescriptor[]` with exactly two entries:
      - `{ id: "azure-ocr", displayName: "Azure OCR", category: "ocr", acceptsKind: "Document", returns: "OcrResult" }`
      - `{ id: "mistral-ocr", displayName: "Mistral OCR", category: "ocr", acceptsKind: "Document", returns: "OcrResult" }`

- [x] **Scenario 3**: Helpers `getProviderDescriptor` + `listProvidersForKind` exported
    - **Given** the same file
    - **When** read
    - **Then** it exports `getProviderDescriptor(id: string): ProviderDescriptor | undefined`
    - **And** `listProvidersForKind(acceptsKind: KindRef): ProviderDescriptor[]` returning every descriptor whose `acceptsKind` is assignable from the parameter (via `isAssignable` from US-091)
    - **And** unit tests cover both helpers' happy paths + a "no matches" case

- [x] **Scenario 4**: Barrel re-export from package root
    - **Given** `packages/graph-workflow/src/catalog/index.ts` and `packages/graph-workflow/src/index.ts`
    - **When** read
    - **Then** `ProviderDescriptor`, `PROVIDER_CATALOG`, `getProviderDescriptor`, `listProvidersForKind` are re-exported
    - **And** `npm run build` succeeds

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/provider-catalog.ts` — new
- `packages/graph-workflow/src/catalog/provider-catalog.test.ts` — unit tests
- `packages/graph-workflow/src/catalog/index.ts` — re-export
- `packages/graph-workflow/src/index.ts` — re-export through package barrel

## Technical notes

- NO UI is wired up in Phase 3 — the dropdown that consumes this catalog ships in Phase 5 alongside the segmentation activities.
- Two-entry seed (Azure OCR + Mistral OCR) is locked in REQUIREMENTS.md §3.2 D11.
- `category` values are pre-enumerated. Phase 6 (dynamic nodes) may need to register new providers at runtime; that's a follow-up. Don't add a registration API in Phase 3.
- The descriptor explicitly does NOT reference the existing activity `activityType` — providers are a sibling concept layered on top of the activity catalog. An activity with a `provider` parameter consults `PROVIDER_CATALOG` to source its dropdown; the activity itself stays a single catalog entry.
