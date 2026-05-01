# Adding OCR Providers

This guide explains how to add a new OCR provider (after Azure + Mistral) without changing core graph engine behavior.

The key design rule is:

- Provider-specific code lives in Temporal activities and mapping helpers.
- Downstream pipeline nodes stay provider-agnostic by consuming canonical `OCRResult`.

References:
- `docs-md/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md`
- `docs-md/graph-workflows/MISTRAL_OCR.md`
- `apps/temporal/src/types.ts`

---

## 1. Architecture contract

Before adding a provider, align on these contracts:

1. **Graph contract**: workflow JSON references activity type strings (for example, `"azureOcr.submit"`, `"mistralOcr.process"`).
2. **Registry contract**: the same activity type must be registered in:
   - worker registry (`apps/temporal/src/activity-registry.ts`)
   - workflow-safe type list (`apps/temporal/src/activity-types.ts`)
   - backend allow-list (`apps/backend-services/src/workflow/activity-registry.ts`)
3. **Data contract**: provider output must be normalized to `OCRResult` so existing nodes (`ocr.cleanup`, `ocr.checkConfidence`, `ocr.storeResults`, optional `ocr.enrich`, HITL) continue to work unchanged.

If you cannot map provider output into `OCRResult` cleanly, resolve that first; otherwise integration cost increases across UI, storage, and enrichment paths.

---

## 2. Choose provider execution model

Pick one of two patterns based on provider API behavior:

### A) Asynchronous provider (submit + poll + extract)

Use this when provider returns an operation ID and requires polling.

- Activities:
  - `<provider>Ocr.submit`
  - `<provider>Ocr.poll` (usually in a `pollUntil` node)
  - `<provider>Ocr.extract` (maps final response to `OCRResult`)
- Example pattern: Azure flow.

### B) Synchronous provider (single process step)

Use this when provider returns OCR in one request.

- Activity:
  - `<provider>Ocr.process` (returns `{ ocrResult: OCRResult }`)
- Example pattern: Mistral flow.

---

## 3. Implementation checklist (end-to-end)

## Step 1 - Add provider module and mapping utilities

Create a provider folder:

- `apps/temporal/src/ocr-providers/<provider>/`

Typical files:

- `<provider>-ocr-types.ts` (provider response/request types)
- `<provider>-to-ocr-result.ts` (normalization to `OCRResult`)
- Optional helpers for field schema mapping or provider-specific annotation.

Keep mapping logic pure and unit-testable; keep network I/O in activity files.

## Step 2 - Implement Temporal activity files

Add activity implementation(s) under:

- `apps/temporal/src/activities/`

Requirements:

- Strongly typed params and return shape.
- Read binary input from existing blob/file references (`PreparedFileData` pattern).
- Provider credentials from env vars.
- Deterministic mock mode (`MOCK_<PROVIDER>_OCR`) for local/CI wiring tests.
- Consistent structured logging and normalized error messages.

Export from:

- `apps/temporal/src/activities.ts`

## Step 3 - Register activity types in all registries

Update:

1. `apps/temporal/src/activity-registry.ts` (runtime function registration)
2. `apps/temporal/src/activity-types.ts` (workflow-safe constant list)
3. `apps/backend-services/src/workflow/activity-registry.ts` (save-time validation allow-list)

If any one is missing, workflows either fail validation or fail at runtime resolution.

## Step 4 - Wire workflow template(s)

Add/update graph template JSON in:

- `docs-md/graph-workflows/templates/`

Use one of the execution patterns in Section 2, then connect to existing generic nodes:

- `file.prepare` -> provider OCR node(s) -> `ocr.cleanup` -> `ocr.checkConfidence` -> HITL switch/gate -> `ocr.storeResults`

Optional:

- add `ocr.enrich` after cleanup when schema-aware normalization is needed.

## Step 5 - Pass provider-specific context safely

Use `initialCtx` keys (from backend OCR request/start path) for provider-specific options such as:

- provider model/version identifier
- optional template/schema identifiers
- provider prompt overrides

Guidelines:

- Keep names explicit (`templateModelId`, `documentAnnotationPrompt`, etc.).
- Prefer optional context keys over global behavior switches.
- Document any fallback behavior (for example, model defaulting).

## Step 6 - Configuration and operational docs

Update:

- `apps/temporal/.env.sample` with required env vars and mock flags.
- provider doc under `docs-md/graph-workflows/` with:
  - API assumptions (sync vs async)
  - mapping details to `OCRResult`
  - confidence behavior and fallbacks
  - latency/cost notes for optional annotation/extraction features
  - retry/idempotency considerations

## Step 7 - Tests

Add and update tests in both Temporal and backend layers:

- Provider mapper unit tests
- Activity tests (including error paths and mock mode)
- Activity registry tests (Temporal + backend)
- Graph validation tests when new type strings are added

Minimum confidence checks before merge:

- New provider activity type accepted by backend graph validation.
- Temporal worker resolves and executes provider activities.
- Result stores correctly via existing `ocr.storeResults`.
- Document viewer and enrichment paths handle resulting fields.

---

## 4. Suggested naming conventions

- Activity types:
  - Sync: `<provider>Ocr.process`
  - Async: `<provider>Ocr.submit`, `<provider>Ocr.poll`, `<provider>Ocr.extract`
- Folder name:
  - `apps/temporal/src/ocr-providers/<provider>/`
- Env vars:
  - `<PROVIDER>_API_KEY`
  - `MOCK_<PROVIDER>_OCR`

Consistent naming makes graph JSON and logs easier to scan across providers.

---

## 5. Common pitfalls

1. Registering activity type in Temporal only (backend save-time validation still rejects graph).
2. Returning provider-native payload instead of `OCRResult` (breaks downstream generic nodes).
3. Missing mock mode (harder CI/local integration testing).
4. Assuming `document.model_id` semantics are identical across providers; define explicit fallback behavior.
5. Embedding provider-specific assumptions in UI/storage code instead of normalizing in provider mapper.

---

## 6. Future scalability notes

If provider count grows significantly, consider introducing a shared provider abstraction in Temporal (for example, common request lifecycle helpers and error normalization). Keep the external graph contract stable (`activityType` + `OCRResult`) so existing workflows and templates remain compatible.
