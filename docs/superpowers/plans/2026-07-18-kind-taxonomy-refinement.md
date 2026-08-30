# Kind Taxonomy Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the polymorphic `Document`/`Classification`/`Segment` kind tags into shape-honest subkinds via the existing `baseKind` hierarchy, and retag every catalog port to the kind that matches its verified runtime shape.

**Architecture:** Three strictly-ordered, independently-shippable phases (Document → Classification → Segment) per `docs-md/workflow-builder/KIND_TAXONOMY_REFINEMENT_DESIGN.md` §11. Each phase: add kinds to the `ArtifactKind` union + registry (with Zod schemas for object shapes, reusing `zodToFields`/`KIND_SCHEMAS` from the kind-field-schemas wave), adopt `z.infer` in the Temporal types, retag catalog ports, then run the §9 regression-review protocol. No executor/backend/API changes — kinds are builder-side metadata.

**Tech Stack:** TypeScript, Zod v4 (`zod/v4` subpath), Jest (packages/graph-workflow, apps/temporal), Vitest (apps/frontend), Playwright (tier-2 e2e), Biome + lefthook.

**Read first:** `docs-md/workflow-builder/KIND_TAXONOMY_REFINEMENT_DESIGN.md` (the spec — §5 is the retag table with runtime evidence), `docs-md/workflow-builder/KIND_FIELD_SCHEMAS_DESIGN.md` §3.4 (the machinery this reuses).

**House rules that bite here:** run `biome check` (no `--write`) on touched frontend files before committing — `--write` skips unsafe fixes that the lefthook `frontend-lint` hook still fails on. Never run npm/playwright installs. Commit messages end with the Co-Authored-By line shown in each commit step. `cd` into `apps/frontend` before running its biome/vitest commands.

---

## Phase 1 — Document family

### Task 1: `zodToFields` learns `z.enum`

`PreparedFileData.fileType` is `"pdf" | "image"`; the converter currently throws on `enum`. zod/v4 enums expose `def.type === "enum"` (verified: `z.enum(["pdf","image"]).def.type` → `"enum"`).

**Files:**
- Modify: `packages/graph-workflow/src/types/zod-to-fields.ts`
- Test: `packages/graph-workflow/src/types/zod-to-fields.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `zod-to-fields.test.ts` (inside the existing top-level `describe`):

```ts
it("maps z.enum to a string field", () => {
  const schema = z.object({
    fileType: z.enum(["pdf", "image"]),
    outputFormat: z.enum(["text", "markdown"]).optional(),
  });
  expect(zodToFields(schema, new Map())).toEqual([
    { name: "fileType", type: "string", required: true },
    { name: "outputFormat", type: "string", required: false },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/graph-workflow && npx jest zod-to-fields -t "z.enum"`
Expected: FAIL with `zodToFields: unsupported schema type "enum" for field "fileType"`

- [ ] **Step 3: Implement**

In `zod-to-fields.ts`, add a case to the `switch (def.type)` in `fieldToDescriptor`, after `case "literal"`'s block:

```ts
    case "enum":
      // zod/v4 enums are string-valued (def.entries is a name→value record);
      // the picker only needs the primitive category, not the member list.
      return { name, type: "string", required };
```

Also update the module doc-comment's supported-type list ("accepts string/number/boolean/literal/**enum**/object/array/optional").

- [ ] **Step 4: Run the full converter suite**

Run: `cd packages/graph-workflow && npx jest zod-to-fields`
Expected: PASS, including the existing throws-on-union/record tests (those def types are unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/graph-workflow/src/types/zod-to-fields.ts packages/graph-workflow/src/types/zod-to-fields.test.ts
git commit -m "feat(graph-workflow): zodToFields maps z.enum to string fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2: `PreparedFileSchema` in kind-schemas

**Files:**
- Modify: `packages/graph-workflow/src/types/kind-schemas.ts`
- Modify: `packages/graph-workflow/src/types/index.ts` (barrel — Biome keeps exports alphabetized)
- Test: `packages/graph-workflow/src/types/kind-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `kind-schemas.test.ts`:

```ts
it("PreparedFileSchema derives the six PreparedFileData fields", () => {
  expect(zodToFields(PreparedFileSchema, KIND_SCHEMAS)).toEqual([
    { name: "fileName", type: "string", required: true },
    { name: "fileType", type: "string", required: true },
    { name: "contentType", type: "string", required: true },
    { name: "blobKey", type: "string", required: true },
    { name: "modelId", type: "string", required: true },
    { name: "outputFormat", type: "string", required: false },
  ]);
});

it("KIND_SCHEMAS maps PreparedFileSchema to PreparedFile by identity", () => {
  expect(KIND_SCHEMAS.get(PreparedFileSchema)).toBe("PreparedFile");
});
```

(Import `PreparedFileSchema` alongside the existing imports; `zodToFields` is already imported there.)

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/graph-workflow && npx jest kind-schemas`
Expected: FAIL — `PreparedFileSchema` has no export.

- [ ] **Step 3: Implement**

In `kind-schemas.ts`, after the `OcrPayloadRef` export, add:

```ts
/**
 * The PreparedFile-kind value: file.prepare's output, consumed verbatim by
 * azureOcr.submit and mistralOcr.process. Field set verified against
 * apps/temporal prepare-file-data.ts (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4).
 */
export const PreparedFileSchema = z.object({
  fileName: z.string(),
  fileType: z.enum(["pdf", "image"]),
  contentType: z.string(),
  blobKey: z.string(),
  /** Azure Document Intelligence model ID. */
  modelId: z.string(),
  /** Azure outputContentFormat: "text" (default) or "markdown". */
  outputFormat: z.enum(["text", "markdown"]).optional(),
});

/**
 * Single-source runtime type for PreparedFile-kind values; apps/temporal
 * re-exports this as its `PreparedFileData`.
 */
export type PreparedFileData = z.infer<typeof PreparedFileSchema>;
```

Update `KIND_SCHEMAS`:

```ts
export const KIND_SCHEMAS: KindSchemaMap = new Map<ZodType, KindRef>([
  [OcrResultSchema, "OcrResult"],
  [PreparedFileSchema, "PreparedFile"],
]);
```

Also rewrite the file's header comment: the "Document and Classification are deliberately schema-free" paragraph is now wrong — replace with a pointer to KIND_TAXONOMY_REFINEMENT_DESIGN.md ("families are schema-free ancestors; shape subkinds carry the schemas").

In `types/index.ts`, add `PreparedFileSchema` and `PreparedFileData` to the existing `kind-schemas` export statements (mirror how `OcrResultSchema`/`OcrPayloadRef` are exported).

Note: `"PreparedFile"` is not yet in the `ArtifactKind` union — that lands in Task 3. If `tsc` complains about the `KindRef` cast before Task 3 lands, do Tasks 2+3's implementation steps together but keep the commits separate as written.

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/graph-workflow && npx jest kind-schemas`
Expected: PASS (if the union error bites, finish Task 3 Step 3 first — the tests for both tasks then pass together).

- [ ] **Step 5: Commit**

```bash
git add packages/graph-workflow/src/types/kind-schemas.ts packages/graph-workflow/src/types/kind-schemas.test.ts packages/graph-workflow/src/types/index.ts
git commit -m "feat(graph-workflow): PreparedFileSchema single-source kind schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: Document-family subkinds in union + registry, re-parenting

**Files:**
- Modify: `packages/graph-workflow/src/types/artifacts.ts`
- Modify: `packages/graph-workflow/src/types/artifact-registry.ts`
- Test: `packages/graph-workflow/src/types/subtype-check.test.ts`, `packages/graph-workflow/src/types/artifact-registry.test.ts`

- [ ] **Step 1: Write the failing subtype tests**

Add to `subtype-check.test.ts`:

```ts
describe("shape-honest Document subkinds (KIND_TAXONOMY_REFINEMENT_DESIGN.md §3)", () => {
  it("sibling subkinds are not interchangeable", () => {
    expect(isAssignable("DocumentContent", "DocumentRef")).toBe(false);
    expect(isAssignable("DocumentRef", "DocumentContent")).toBe(false);
    expect(isAssignable("PreparedFile", "DocumentRef")).toBe(false);
    expect(isAssignable("DocumentRef", "PreparedFile")).toBe(false);
    expect(isAssignable("DocumentContent", "PreparedFile")).toBe(false);
  });

  it("every subkind satisfies a family-level Document port", () => {
    expect(isAssignable("DocumentRef", "Document")).toBe(true);
    expect(isAssignable("PreparedFile", "Document")).toBe(true);
    expect(isAssignable("DocumentContent", "Document")).toBe(true);
  });

  it("re-parented page-count kinds chain through DocumentRef", () => {
    expect(isAssignable("MultiPageDocument", "DocumentRef")).toBe(true);
    expect(isAssignable("SinglePageDocument", "DocumentRef")).toBe(true);
    expect(isAssignable("MultiPageDocument", "Document")).toBe(true);
    // A plain ref is not known to be multi-page — unchanged strictness.
    expect(isAssignable("DocumentRef", "MultiPageDocument")).toBe(false);
  });

  it("array cardinality carries through for the new kinds", () => {
    expect(isAssignable("DocumentRef[]", "Document[]")).toBe(true);
    expect(isAssignable("DocumentContent[]", "DocumentRef[]")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/graph-workflow && npx jest subtype-check`
Expected: FAIL — unknown kinds fail closed (`isAssignable("DocumentRef", "Document")` returns `false` because `DocumentRef` isn't in the registry).

- [ ] **Step 3: Implement**

`artifacts.ts` — extend the union (after `"SinglePageDocument"`):

```ts
  | "DocumentRef"
  | "PreparedFile"
  | "DocumentContent"
```

and update the doc-comment taxonomy tree to:

```
 *   Artifact (base)
 *   ├── Document
 *   │   ├── DocumentRef            (blob-key string)
 *   │   │   ├── MultiPageDocument
 *   │   │   └── SinglePageDocument
 *   │   ├── PreparedFile           (PreparedFileData object)
 *   │   └── DocumentContent        (base64 content string)
```

`artifact-registry.ts` — import `PreparedFileSchema` from `./kind-schemas` (extend the existing import), then in the Document-family block:

```ts
  DocumentRef: {
    displayName: "Document ref",
    color: "blue",
    baseKind: "Document",
    isArray: false,
  },
  MultiPageDocument: {
    displayName: "Multi-page document",
    color: "blue",
    baseKind: "DocumentRef",
    isArray: false,
  },
  SinglePageDocument: {
    displayName: "Single-page document",
    color: "blue",
    baseKind: "DocumentRef",
    isArray: false,
  },
  PreparedFile: {
    displayName: "Prepared file",
    color: "blue",
    baseKind: "Document",
    fields: zodToFields(PreparedFileSchema, KIND_SCHEMAS),
    isArray: false,
  },
  DocumentContent: {
    displayName: "Document content",
    color: "blue",
    baseKind: "Document",
    isArray: false,
  },
```

(`MultiPageDocument`/`SinglePageDocument` are the existing entries with only `baseKind` changed. The `satisfies Record<ArtifactKind, ArtifactKindMeta>` clause forces you to add every new union member — a missing entry is a compile error, which is the coverage test.)

- [ ] **Step 4: Run the types suites; update enumerating tests**

Run: `cd packages/graph-workflow && npx jest src/types`
Expected: subtype-check tests PASS. If `artifacts.test.ts` or `artifact-registry.test.ts` enumerate the kind vocabulary (count or name list), extend those lists with exactly `"DocumentRef"`, `"PreparedFile"`, `"DocumentContent"` — nothing else. Also add a registry-fields assertion to `artifact-registry.test.ts`:

```ts
it("PreparedFile carries schema-derived fields; string subkinds carry none", () => {
  expect(getArtifactKindMeta("PreparedFile")?.fields?.map((f) => f.name)).toEqual([
    "fileName", "fileType", "contentType", "blobKey", "modelId", "outputFormat",
  ]);
  expect(getArtifactKindMeta("DocumentRef")?.fields).toBeUndefined();
  expect(getArtifactKindMeta("DocumentContent")?.fields).toBeUndefined();
});
```

- [ ] **Step 5: Run the whole package suite**

Run: `cd packages/graph-workflow && npx jest`
Expected: PASS. (Catalog retags haven't happened yet, so no catalog test should notice the new kinds. Any failure here means an enumerating test was missed in Step 4.)

- [ ] **Step 6: Commit**

```bash
git add packages/graph-workflow/src/types/artifacts.ts packages/graph-workflow/src/types/artifact-registry.ts packages/graph-workflow/src/types/subtype-check.test.ts packages/graph-workflow/src/types/artifact-registry.test.ts packages/graph-workflow/src/types/artifacts.test.ts
git commit -m "feat(graph-workflow): DocumentRef/PreparedFile/DocumentContent subkinds; re-parent page-count kinds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4: Temporal `PreparedFileData` becomes `z.infer`

Same template as the shipped `OcrPayloadRef` adoption (`apps/temporal/src/ocr-payload-ref-types.ts`).

**Files:**
- Modify: `apps/temporal/src/types.ts:205-213`

- [ ] **Step 1: Replace the interface**

In `apps/temporal/src/types.ts`, delete the `PreparedFileData` interface (lines ~205-213) and replace with:

```ts
/**
 * PreparedFileData now derives from the PreparedFile kind's Zod schema in
 * @ai-di/graph-workflow (`z.infer<typeof PreparedFileSchema>`), so the
 * activities constructing it and the builder's field drill-down share one
 * definition (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4).
 */
export type { PreparedFileData } from "@ai-di/graph-workflow";
```

Keep `OcrOutputFormat` where it is — `types.ts:191` (`contentFormat?: OcrOutputFormat`) still uses it. The inferred `outputFormat?: "text" | "markdown"` is structurally identical.

- [ ] **Step 2: Type-check and test temporal**

Run: `cd apps/temporal && npx tsc --noEmit && npx jest`
Expected: clean type-check (the 7 importing files see an identical structural type) and all suites PASS. A type error here means the schema in Task 2 doesn't match the real shape — fix the schema, not the activities.

- [ ] **Step 3: Commit**

```bash
git add apps/temporal/src/types.ts
git commit -m "refactor(temporal): PreparedFileData derives from PreparedFileSchema via z.infer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5: Catalog retags — Document family

Every edit is a one-word `kind:` change on the named port; the design doc §5 table is the authority. All files under `packages/graph-workflow/src/catalog/`.

**Files:**
- Modify (activities/): `file-prepare.ts`, `blob-read.ts`, `azure-ocr-submit.ts`, `mistral-ocr-process.ts`, `azure-classify-submit.ts`, `azure-classify-poll.ts`, `document-extract-page-range.ts`, `document-extract-to-base64.ts`, `document-normalize-orientation.ts`
- Modify: `sources/source-upload.ts`, `provider-catalog.ts`
- Test: `sources/source-upload.test.ts`, `provider-catalog.test.ts`

- [ ] **Step 1: Retag the activity ports**

| File | Port (dir) | `kind:` old → new |
|---|---|---|
| `file-prepare.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `file-prepare.ts` | `preparedData` (out) | `"Document"` → `"PreparedFile"` |
| `blob-read.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `blob-read.ts` | `base64` (out) | `"Document"` → `"DocumentContent"` |
| `azure-ocr-submit.ts` | `fileData` (in) | `"Document"` → `"PreparedFile"` |
| `mistral-ocr-process.ts` | `fileData` (in) | `"Document"` → `"PreparedFile"` |
| `azure-classify-submit.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `azure-classify-submit.ts` | `blobKey` (out) | `"Document"` → `"DocumentRef"` |
| `azure-classify-poll.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `azure-classify-poll.ts` | `originalBlobKey` (out) | `"Document"` → `"DocumentRef"` |
| `document-extract-page-range.ts` | `segmentBlobKey` (out) | `"Document"` → `"DocumentRef"` |
| `document-extract-to-base64.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `document-normalize-orientation.ts` | `blobKey` (in) | `"Document"` → `"DocumentRef"` |
| `document-normalize-orientation.ts` | `correctedBlobKey` (out) | `"Document"` → `"DocumentRef"` |

The three `MultiPageDocument` inputs (`document-split.ts`, `document-split-and-classify.ts`, `document-extract-page-range.ts` `blobKey`) keep their tag — the kind itself was re-parented in Task 3.

- [ ] **Step 2: source.upload honesty fixes**

In `sources/source-upload.ts`:
- `outputKind: "Document"` → `outputKind: "DocumentRef"`.
- In `deriveOutputSchema`, change `{ type: "string", format: "uri" }` → `{ type: "string" }` (the upload service stores a validated blob **key** — `apps/backend-services/src/workflow/source-upload.service.ts:102-116` — not a URI).
- Update the entry `description` "…runs against the resulting blob URL." → "…runs against the resulting stored blob." and the module doc-comment `producer of `kind: "Document"`` → `"DocumentRef"`.

- [ ] **Step 3: provider catalog honesty**

In `provider-catalog.ts`, both seed entries (azure-ocr, mistral-ocr): `acceptsKind: "Document"` → `acceptsKind: "PreparedFile"` (they back `azureOcr.submit`/`mistralOcr.process`, which consume `PreparedFileData`).

- [ ] **Step 4: Run the package suite and fix the enumerated breakages**

Run: `cd packages/graph-workflow && npx jest`
Expected failures, all pre-enumerated (fix exactly these; anything else = investigate before touching):
- `sources/source-upload.test.ts:44,159` — `outputKind` assertions → `"DocumentRef"`.
- `sources/source-upload.test.ts:178-181` — after retag: `isAssignable("Document", outputKind)` is now `false` (family does not narrow to child) and `isAssignable(outputKind, "Document")` stays `true`. Update expectations and the test's doc-comment (line ~12).
- `provider-catalog.test.ts:26,47` — `acceptsKind` → `"PreparedFile"`.
- `provider-catalog.test.ts:67` — `listProvidersForKind("Document")` no longer matches; change the argument to `"PreparedFile"` (still expects both providers).
- `provider-catalog.test.ts:75` — `listProvidersForKind("MultiPageDocument")` now returns `[]` (a blob-key ref is not a PreparedFile); update the expectation and its comment.
- Any auto-wire/validator test that builds a chain from REAL catalog entries (`file.prepare` → `azureOcr.submit`) still wires: `PreparedFile` → `PreparedFile` matches. Synthetic-fixture tests that use `"Document"` as an arbitrary kind (e.g. `resolve-input-port.test.ts`) are unaffected — `Document` remains a valid family kind. Do NOT retag synthetic fixtures.

Re-run until green: `cd packages/graph-workflow && npx jest`

- [ ] **Step 5: Frontend fallout — condition-binding portKind assertions**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder`
Expected failures, pre-enumerated: `graph-widgets/condition-producer-binding.test.ts:95,106,146,154,174` assert `portKind: "Document"` for `file.prepare`'s `preparedData` — update all five to `portKind: "PreparedFile"`. If `ConditionExpressionEditor.test.tsx` asserts a resolved caption containing a kind name for file.prepare, update it identically. Nothing else should fail.

Then: `cd apps/frontend && npx biome check src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`
Expected: no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add packages/graph-workflow/src/catalog apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx
git commit -m "feat(catalog): retag Document-family ports to shape-honest subkinds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6: Fix the stale `document.extractToBase64` catalog contract

The catalog declares a `base64` output; the runtime (`apps/temporal/src/activities/extract-pages-base64.ts:30-39`) returns `{pageBlobPath, pageIndex, byteLength, pageCount}`. Spec §6.1.

**Files:**
- Modify: `packages/graph-workflow/src/catalog/activities/document-extract-to-base64.ts`

- [ ] **Step 1: Correct the entry**

Replace the `outputs` array with:

```ts
  outputs: [
    {
      name: "pageBlobPath",
      label: "Page blob path",
      description: "Blob path of the extracted page-range PDF.",
      required: true,
      kind: "DocumentRef",
    },
    {
      name: "pageIndex",
      label: "Page index",
      description: "First extracted page number (1-based).",
      required: true,
      kind: "Artifact",
    },
    {
      name: "byteLength",
      label: "Byte length",
      description: "Size of the written PDF in bytes.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "pageCount",
      label: "Page count",
      description: "Number of pages in the extracted PDF.",
      required: true,
      kind: "Artifact",
    },
  ],
```

Update `displayName` to `"Extract Page Range"` and `description` to `"Extracts a page range from a PDF blob and writes it to blob storage, returning the new blob path."`. The `activityType: "document.extractToBase64"` id stays — it is a persisted identifier (spec §6.1).

- [ ] **Step 2: Verify no consumer referenced the phantom port**

Run: `grep -rn "extractToBase64" scripts/ tests/e2e/ apps/frontend/src packages/graph-workflow/src --include="*.ts" --include="*.tsx" --include="*.mjs" -l`
Expected: only the catalog file itself (plus catalog barrel/registry files that list entries). If a seed or test binds the `base64` output port, STOP and flag it — the spec says that port never worked at runtime, so any binding to it is a fabricated demo path that needs its own verdict.

Then: `cd packages/graph-workflow && npx jest catalog`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/graph-workflow/src/catalog/activities/document-extract-to-base64.ts
git commit -m "fix(catalog): document.extractToBase64 declares its real runtime outputs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 7: Seed + e2e fixture retags (Document family)

Source-field declarations that feed blob-key ports declare `kind: "Document"` today; after Task 5 those bindings validate against `DocumentRef` inputs, so family-level tags must narrow with them (spec §8).

**Files:**
- Modify: `scripts/seed-feature-demos.mjs:974`
- Modify: `tests/e2e/workflow-builder/specs/tier2-sources.spec.ts:90`, `tests/e2e/workflow-builder/specs/tier2-run-drawer.spec.ts:48`, `tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts:225`
- Modify: `tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts` (stale header comment, lines ~22-31)

- [ ] **Step 1: Retag the source-field declarations**

In each of the four fixture locations, the `source.api`/source field declaring the document key changes `kind: "Document"` → `kind: "DocumentRef"` (in `seed-feature-demos.mjs` it is the `documentUrl` field of the API-source demo, line 974). Leave the library-node JSDoc `@inputs { document: { kind: "Document" … } }` occurrences alone (a library node accepting family-level Document is honest wildcarding).

- [ ] **Step 2: Refresh the tier2-port-wiring header comment**

Update the "Real catalog kinds used" block: `file.prepare out preparedData: PreparedFile`, `azureOcr.submit in fileData: PreparedFile (compatible with prepare)`, and note `document.split in blobKey: MultiPageDocument — PreparedFile is NOT assignable to MultiPageDocument, so prep→split remains the incompatible pair for §6.2`. (The §6.2 test itself keeps passing unchanged — its copy assertion is the kind-agnostic substring `"can't be used here"`.)

- [ ] **Step 3: Reseed and run the builder e2e tier that touches these fixtures**

Prerequisite: backend on :3002 and frontend on :3000 (`npm run dev:backend` / `npm run dev:frontend` from repo root if not already running — check first with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/health || true`).

```bash
node scripts/seed-feature-demos.mjs
npx playwright test tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts tests/e2e/workflow-builder/specs/tier2-sources.spec.ts tests/e2e/workflow-builder/specs/tier2-run-drawer.spec.ts tests/e2e/workflow-builder/specs/tier2-typed-io.spec.ts
```

Expected: PASS. A failure in typed-io/sources render assertions means a fixture asserts an old kind label (e.g. handle tooltip text "Document") — update the assertion to the new display name (`Document ref` / `Prepared file`) only where the port was retagged in Task 5.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-feature-demos.mjs tests/e2e/workflow-builder/specs/tier2-sources.spec.ts tests/e2e/workflow-builder/specs/tier2-run-drawer.spec.ts tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts
git commit -m "test(e2e)+seeds: narrow source document fields to DocumentRef after taxonomy retag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: New e2e — sibling rejection fixes the base64→blob-key miswire

The flagship latent-miswire fix: before this wave, `blob.read.base64` (was `Document`) auto-bound into blob-key inputs. Both endpoints have empty `parametersSchema`s (verified), so minimal node configs work.

**Files:**
- Modify: `tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts` (append inside the existing `test.describe`)

- [ ] **Step 1: Write the test**

Model on the existing §6.2 test (same helpers, same afterEach cleanup via `createdId`):

```ts
test("base64 content is rejected by a blob-key port (taxonomy sibling rejection)", async ({
  page,
  request,
}, testInfo) => {
  const config: GraphConfig = {
    schemaVersion: "1.0",
    metadata: { name: "e2e sibling rejection" },
    entryNodeId: "readBlob",
    ctx: {},
    nodes: {
      readBlob: {
        id: "readBlob",
        type: "activity",
        label: "Read Blob",
        activityType: "blob.read",
        ...pos(80, 120),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract Page Range",
        activityType: "document.extractToBase64",
        ...pos(560, 420),
      },
    },
    edges: [],
  };
  const created = await createWorkflow(request, {
    name: `e2e sibling rejection ${testInfo.testId}`,
    config,
  });
  createdId = created.id;

  const editor = new WorkflowEditorPage(page);
  await editor.openExisting(createdId, 2);

  // readBlob.base64 is DocumentContent; extract.blobKey is DocumentRef.
  // Siblings under Document are not interchangeable — before the taxonomy
  // wave this drop was accepted (both were "Document") and failed at run
  // time; now the builder rejects it at draw time.
  await dragConnectPorts(page, "readBlob", "base64", "extract", "blobKey");

  await expect(edgeLocator(page, "wire:extract:blobKey")).toHaveCount(0);
  await expect(page.getByText("can't be used here")).toBeVisible();

  expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts -g "sibling rejection"`
Expected: PASS (servers still running from Task 7).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts
git commit -m "test(e2e): sibling-kind rejection guards the base64-into-blob-key miswire

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 9: Phase 1 regression review (spec §9)

- [ ] **Step 1: Full suites**

```bash
cd packages/graph-workflow && npx jest
cd ../../apps/temporal && npx tsc --noEmit && npx jest
cd ../frontend && npx vitest run src/features/workflow-builder
```
Expected: all PASS.

- [ ] **Step 2: Demo walkthrough in the browser**

Reseed (`node scripts/seed-feature-demos.mjs`), then use the repo's Playwright auth-bypass pattern (see `.claude/skills/app-browser-auth` — origin-agnostic `page.route("**/api/**")` + `**/api/auth/me` mock; write the throwaway script to the REPO ROOT, e.g. `.verify-taxonomy.mjs`, because `playwright` only resolves from the repo's node_modules; delete it after). For each seeded demo: open `/workflows/<id>/edit`, capture `pageerror` events, and record every edge flagged invalid or connection that no longer auto-wires.

- [ ] **Step 3: Verdict each finding**

Compare each finding against the spec §5 table. Acceptable verdicts: "latent miswire, correctly rejected now" or "fixture retagged in Task 7, wiring intact". If a legitimate connection broke, the shape table is wrong — STOP, fix the spec table and the offending tag (not the demo), and re-run. Record the verdict list in the Task 9 commit message body (or an empty "no findings" note).

- [ ] **Step 4: Commit any resulting fixes**

```bash
git add -A -- packages/graph-workflow scripts tests/e2e
git commit -m "chore(taxonomy): phase 1 regression review — <n> findings, all verdicts recorded

<verdict list>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Skip the commit if the review produced zero changes; note the clean result in the Task 15 docs instead.)

---

## Phase 2 — Classification family

### Task 10: Classification subkinds + retags

Two schema-free subkinds — wiring honesty only, no drill-down (spec §3: a bare string and a dynamic-key record have no enumerable fields).

**Files:**
- Modify: `packages/graph-workflow/src/types/artifacts.ts`, `packages/graph-workflow/src/types/artifact-registry.ts`
- Modify (catalog): `activities/document-classify.ts`, `activities/azure-classify-poll.ts`, `activities/document-select-classified-pages.ts`, `activities/document-flatten-classified-documents.ts`
- Test: `packages/graph-workflow/src/types/subtype-check.test.ts`

- [ ] **Step 1: Failing subtype tests**

```ts
describe("shape-honest Classification subkinds", () => {
  it("label and map are not interchangeable", () => {
    expect(isAssignable("ClassificationLabel", "LabeledDocumentMap")).toBe(false);
    expect(isAssignable("LabeledDocumentMap", "ClassificationLabel")).toBe(false);
  });
  it("both satisfy family-level Classification", () => {
    expect(isAssignable("ClassificationLabel", "Classification")).toBe(true);
    expect(isAssignable("LabeledDocumentMap", "Classification")).toBe(true);
  });
});
```

Run: `cd packages/graph-workflow && npx jest subtype-check` — expected FAIL (unknown kinds fail closed).

- [ ] **Step 2: Implement union + registry**

`artifacts.ts` union, after `"Classification"`:

```ts
  | "ClassificationLabel"
  | "LabeledDocumentMap"
```

(and add both under Classification in the doc tree). `artifact-registry.ts`, after the `Classification` entry:

```ts
  ClassificationLabel: {
    displayName: "Classification label",
    color: "yellow",
    baseKind: "Classification",
    isArray: false,
  },
  LabeledDocumentMap: {
    // Dynamic-key record (label → classified documents) — deliberately
    // schema-free; zodToFields refuses records and drill-down does not
    // apply (KIND_TAXONOMY_REFINEMENT_DESIGN.md §3).
    displayName: "Labeled documents",
    color: "yellow",
    baseKind: "Classification",
    isArray: false,
  },
```

- [ ] **Step 3: Retag the four ports**

| File | Port (dir) | `kind:` old → new |
|---|---|---|
| `document-classify.ts` | `segmentType` (out) | `"Classification"` → `"ClassificationLabel"` |
| `azure-classify-poll.ts` | `labeledDocuments` (out) | `"Classification"` → `"LabeledDocumentMap"` |
| `document-select-classified-pages.ts` | `labeledDocuments` (in) | `"Classification"` → `"LabeledDocumentMap"` |
| `document-flatten-classified-documents.ts` | `labeledDocuments` (in) | `"Classification"` → `"LabeledDocumentMap"` |

- [ ] **Step 4: Run suites, review, commit**

```bash
cd packages/graph-workflow && npx jest
cd ../../apps/frontend && npx vitest run src/features/workflow-builder
```
Expected: PASS — the poll→select/flatten chains retag consistently on both sides, and no test asserts a Classification port kind by name (verified by grep during planning; `provider-catalog.test.ts:92` calls `listProvidersForKind("Classification")` expecting `[]`, which still holds). Update the enumerating vocabulary test(s) from Task 3 Step 4 with the two new names. Then run the phase's regression review exactly as Task 9 Steps 2-3 (the classify demos are the ones to walk).

```bash
git add packages/graph-workflow/src/types packages/graph-workflow/src/catalog
git commit -m "feat(catalog): ClassificationLabel/LabeledDocumentMap subkinds + retags

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Segment family

### Task 11: Segment schemas in kind-schemas

**Files:**
- Modify: `packages/graph-workflow/src/types/kind-schemas.ts`, `packages/graph-workflow/src/types/index.ts`
- Test: `packages/graph-workflow/src/types/kind-schemas.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("DocumentSegmentSchema derives fields; anonymous pageRange stops drill-down", () => {
  expect(zodToFields(DocumentSegmentSchema, KIND_SCHEMAS)).toEqual([
    { name: "segmentIndex", type: "number", required: true },
    { name: "pageRange", type: "object", required: true }, // no kind → no deeper drill
    { name: "blobKey", type: "string", required: true },
    { name: "pageCount", type: "number", required: true },
  ]);
});

it("TypedSegmentSchema extends DocumentSegment with the classification fields", () => {
  expect(zodToFields(TypedSegmentSchema, KIND_SCHEMAS)).toEqual([
    { name: "segmentIndex", type: "number", required: true },
    { name: "pageRange", type: "object", required: true },
    { name: "blobKey", type: "string", required: true },
    { name: "pageCount", type: "number", required: true },
    { name: "segmentType", type: "string", required: true },
    { name: "keywordMatch", type: "string", required: false },
    { name: "confidence", type: "number", required: true },
  ]);
});

it("ClassifiedPageSegment and LabeledSegment schemas derive their fields", () => {
  expect(zodToFields(ClassifiedPageSegmentSchema, KIND_SCHEMAS)).toEqual([
    { name: "pageRange", type: "object", required: true },
    { name: "confidence", type: "number", required: true },
  ]);
  expect(zodToFields(LabeledSegmentSchema, KIND_SCHEMAS)).toEqual([
    { name: "label", type: "string", required: true },
    { name: "pageRange", type: "object", required: true },
    { name: "confidence", type: "number", required: true },
  ]);
});
```

Run: `cd packages/graph-workflow && npx jest kind-schemas` — expected FAIL (no such exports).

- [ ] **Step 2: Implement**

In `kind-schemas.ts` (shapes verified against `apps/temporal/src/activities/` — `split-document.ts:18-23`, `split-and-classify-document.ts:17-20`, `select-classified-pages.ts:12-17`, `flatten-classified-documents.ts:15-22`):

```ts
/** Shared page-range fragment. Deliberately NOT a registered kind: page
 *  ranges are not artifacts, so drill-down stops at the object
 *  (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4). */
const PageRangeSchema = z.object({ start: z.number(), end: z.number() });

/** document.split's per-segment output. */
export const DocumentSegmentSchema = z.object({
  segmentIndex: z.number(),
  pageRange: PageRangeSchema,
  blobKey: z.string(),
  pageCount: z.number(),
});
export type DocumentSegment = z.infer<typeof DocumentSegmentSchema>;

/** document.splitAndClassify's per-segment output — a DocumentSegment plus
 *  classification results (runtime `SegmentWithType extends DocumentSegment`). */
export const TypedSegmentSchema = DocumentSegmentSchema.extend({
  segmentType: z.string(),
  keywordMatch: z.string().optional(),
  confidence: z.number(),
});
export type SegmentWithType = z.infer<typeof TypedSegmentSchema>;

/** document.selectClassifiedPages' per-segment output. */
export const ClassifiedPageSegmentSchema = z.object({
  pageRange: PageRangeSchema,
  confidence: z.number(),
});
export type ClassifiedPageSegment = z.infer<typeof ClassifiedPageSegmentSchema>;

/** document.flattenClassifiedDocuments' per-segment output. */
export const LabeledSegmentSchema = z.object({
  label: z.string(),
  pageRange: PageRangeSchema,
  confidence: z.number(),
});
export type LabeledSegment = z.infer<typeof LabeledSegmentSchema>;
```

Extend `KIND_SCHEMAS`:

```ts
  [DocumentSegmentSchema, "DocumentSegment"],
  [TypedSegmentSchema, "TypedSegment"],
  [ClassifiedPageSegmentSchema, "ClassifiedPageSegment"],
  [LabeledSegmentSchema, "LabeledSegment"],
```

Barrel-export the four schemas + four types from `types/index.ts`.

- [ ] **Step 3: Run, commit**

Run: `cd packages/graph-workflow && npx jest kind-schemas` — PASS (union members land in Task 12; same caveat as Task 2 if tsc complains, implement 11+12 together, commit separately).

```bash
git add packages/graph-workflow/src/types/kind-schemas.ts packages/graph-workflow/src/types/kind-schemas.test.ts packages/graph-workflow/src/types/index.ts
git commit -m "feat(graph-workflow): segment-family kind schemas (DocumentSegment/TypedSegment/ClassifiedPageSegment/LabeledSegment)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 12: Segment subkinds in union + registry

**Files:**
- Modify: `packages/graph-workflow/src/types/artifacts.ts`, `packages/graph-workflow/src/types/artifact-registry.ts`
- Test: `packages/graph-workflow/src/types/subtype-check.test.ts`, `packages/graph-workflow/src/types/kind-fields.test.ts`

- [ ] **Step 1: Failing tests**

`subtype-check.test.ts`:

```ts
describe("shape-honest Segment subkinds", () => {
  it("TypedSegment chains through DocumentSegment to Segment", () => {
    expect(isAssignable("TypedSegment", "DocumentSegment")).toBe(true);
    expect(isAssignable("TypedSegment", "Segment")).toBe(true);
    expect(isAssignable("DocumentSegment", "TypedSegment")).toBe(false);
  });
  it("segment siblings are not interchangeable (array form too)", () => {
    expect(isAssignable("DocumentSegment", "ClassifiedPageSegment")).toBe(false);
    expect(isAssignable("LabeledSegment[]", "DocumentSegment[]")).toBe(false);
    expect(isAssignable("DocumentSegment[]", "Segment[]")).toBe(true);
  });
});
```

`kind-fields.test.ts` (dedupe across the extend-derived chain — `TypedSegment`'s registry `fields` repeat the base four; the resolver's own-over-inherited Map merge must yield each name once, base-chain order):

```ts
it("TypedSegment resolves 7 unique fields through the DocumentSegment chain", () => {
  expect(resolveKindFields("TypedSegment").map((f) => f.name)).toEqual([
    "segmentIndex", "pageRange", "blobKey", "pageCount",
    "segmentType", "keywordMatch", "confidence",
  ]);
});
```

Run: `cd packages/graph-workflow && npx jest subtype-check kind-fields` — expected FAIL.

- [ ] **Step 2: Implement**

`artifacts.ts` union, after `"Segment<Header>"`:

```ts
  | "DocumentSegment"
  | "TypedSegment"
  | "ClassifiedPageSegment"
  | "LabeledSegment"
```

(doc tree: add the four under Segment, `TypedSegment` nested under `DocumentSegment`). `artifact-registry.ts`, in the Segment-family block (import the four schemas):

```ts
  DocumentSegment: {
    displayName: "Document segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(DocumentSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  TypedSegment: {
    // fields from the extend-schema repeat DocumentSegment's four;
    // resolveKindFields dedupes by name, so resolution stays 7 fields.
    displayName: "Typed segment",
    color: "green",
    baseKind: "DocumentSegment",
    fields: zodToFields(TypedSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  ClassifiedPageSegment: {
    displayName: "Classified page segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(ClassifiedPageSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  LabeledSegment: {
    displayName: "Labeled segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(LabeledSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
```

Update the enumerating vocabulary test(s) with the four new names.

- [ ] **Step 3: Run + commit**

Run: `cd packages/graph-workflow && npx jest` — PASS.

```bash
git add packages/graph-workflow/src/types
git commit -m "feat(graph-workflow): segment-family subkinds in union + registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 13: Temporal segment-type adoptions (incl. the LabeledSegment rename)

No external importers of these interfaces exist outside their defining files except `classify-document.ts` and `split-and-classify-document.ts` importing `DocumentSegment` from `./split-document` (verified by grep) — re-exports keep those stable.

**Files:**
- Modify: `apps/temporal/src/activities/split-document.ts:18-23`, `apps/temporal/src/activities/split-and-classify-document.ts:17-20`, `apps/temporal/src/activities/select-classified-pages.ts:12-17`, `apps/temporal/src/activities/flatten-classified-documents.ts:15-27`, `apps/temporal/src/activities/combine-segment-result.ts:11-34`

- [ ] **Step 1: Replace interfaces with re-exports**

- `split-document.ts`: delete `export interface DocumentSegment {…}`; add at the imports: `import type { DocumentSegment } from "@ai-di/graph-workflow";` and `export type { DocumentSegment };`
- `split-and-classify-document.ts`: delete `export interface SegmentWithType extends DocumentSegment {…}`; add `import type { SegmentWithType } from "@ai-di/graph-workflow";` and `export type { SegmentWithType };` (keep the existing `splitDocument` value import; drop the now-unused `type DocumentSegment` import specifier).
- `select-classified-pages.ts`: delete `export interface ClassifiedPageSegment {…}`; add `import type { ClassifiedPageSegment } from "@ai-di/graph-workflow";` and `export type { ClassifiedPageSegment };`
- `flatten-classified-documents.ts`: delete `export interface ClassifiedSegment {…}` entirely (rename, no back-compat alias); add `import type { LabeledSegment } from "@ai-di/graph-workflow";`, `export type { LabeledSegment };`, and change `FlattenClassifiedDocumentsOutput.segments: ClassifiedSegment[]` → `LabeledSegment[]` plus any internal `ClassifiedSegment` annotations in the function body.
- `combine-segment-result.ts`: replace the inline `currentSegment` object type with `SegmentWithType` and the output's inline type with an intersection, so the compiler enforces the shapes:

```ts
import type { SegmentWithType } from "@ai-di/graph-workflow";

export interface CombineSegmentResultInput {
  currentSegment: SegmentWithType;
  segmentOcrResult: unknown;
}

export interface CombineSegmentResultOutput {
  combinedSegment: SegmentWithType & { ocrResult: unknown };
}
```

- [ ] **Step 2: Type-check + test**

Run: `cd apps/temporal && npx tsc --noEmit && npx jest`
Expected: PASS. A type error = the Task 11 schema mis-states a runtime shape; fix the schema.

- [ ] **Step 3: Commit**

```bash
git add apps/temporal/src/activities/split-document.ts apps/temporal/src/activities/split-and-classify-document.ts apps/temporal/src/activities/select-classified-pages.ts apps/temporal/src/activities/flatten-classified-documents.ts apps/temporal/src/activities/combine-segment-result.ts
git commit -m "refactor(temporal): segment types derive from kind schemas via z.infer; ClassifiedSegment → LabeledSegment

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 14: Catalog retags — Segment family + frontend drill-down tests

**Files:**
- Modify (catalog/activities/): `document-split.ts`, `document-split-and-classify.ts`, `document-select-classified-pages.ts`, `document-flatten-classified-documents.ts`, `document-classify.ts`, `segment-combine-result.ts`
- Test: `apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.test.ts`

- [ ] **Step 1: Retag**

| File | Port (dir) | `kind:` old → new |
|---|---|---|
| `document-split.ts` | `segments` (out) | `"Segment[]"` → `"DocumentSegment[]"` |
| `document-split-and-classify.ts` | `segments` (out) | `"Segment[]"` → `"TypedSegment[]"` |
| `document-select-classified-pages.ts` | `segments` (out) | `"Segment[]"` → `"ClassifiedPageSegment[]"` |
| `document-flatten-classified-documents.ts` | `segments` (out) | `"Segment[]"` → `"LabeledSegment[]"` |
| `document-classify.ts` | `segment` (in) | `"Segment"` → `"DocumentSegment"` (a `TypedSegment` producer still wires via baseKind) |
| `segment-combine-result.ts` | `currentSegment` (in) | `"Segment"` → `"TypedSegment"` |

Stays deliberately family-tagged (spec §5 principle 2): `segment-combine-result.ts` `combinedSegment` output (`"Segment"` — payload embeds `ocrResult: unknown`) and `document-validate-fields.ts` `processedSegments` input (`"Segment[]"` — runtime is untyped records). Add a one-line comment on each: `// stays family-level: payload not single-shape (KIND_TAXONOMY_REFINEMENT_DESIGN.md §5)`.

- [ ] **Step 2: Frontend drill-down test (map-item case is the payoff)**

Add to `variable-field-options.test.ts` (same fixture style as the existing `OcrResult` cases — a ctx key tagged with a schema'd kind):

```ts
it("expands TypedSegment ctx keys with the full inherited field chain", () => {
  const segConfig = {
    ctx: { currentSegment: { type: "object", kind: "TypedSegment" } },
    nodes: {},
    edges: [],
  } as unknown as GraphWorkflowConfig;
  const { groups: out, meta } = expandVariableOptions(
    [{ group: "Workflow context", items: ["currentSegment"] }],
    segConfig,
    "",
  );
  expect(out[0]?.items).toEqual([
    "currentSegment",
    "currentSegment.segmentIndex",
    "currentSegment.pageRange",
    "currentSegment.blobKey",
    "currentSegment.pageCount",
    "currentSegment.segmentType",
    "currentSegment.keywordMatch",
    "currentSegment.confidence",
  ]);
  // Anonymous nested object: the field row exists but has no kind, so
  // typing deeper (pageRange.start) stays free-text with no drill rows.
  expect(meta.get("currentSegment.pageRange")).toEqual({
    type: "object",
    required: true,
  });
});
```

(If `expandVariableOptions` returns field rows in a different envelope than `items` strings, mirror the existing OcrResult test's exact assertion shape — it is the template.)

Also add one case to `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx`: copy the existing step-sub-mode field-picker test that uses an `OcrResult`-kinded producer (the one asserting `${testId}-field-input` options) and re-fixture it with a producer port of kind `"TypedSegment"`, asserting the field dropdown offers all 7 names from Task 12's `resolveKindFields` list. The existing OcrResult test in that file is the exact structural template — only the fixture kind and the expected option list change.

- [ ] **Step 3: Run all three suites; fix pre-enumerated fallout**

```bash
cd packages/graph-workflow && npx jest
cd ../../apps/frontend && npx vitest run src/features/workflow-builder && npx biome check src/features/workflow-builder/graph-widgets/variable-field-options.test.ts
```
Expected package fallout: none pre-enumerated — synthetic `"Segment[]"` fixtures (`resolve-input-port.test.ts:45`, `zod-to-fields.test.ts:58`) use the still-valid family kind. If a catalog-chain test wired `document.split → document.classify` via real entries it still wires (`DocumentSegment[]` map-unwraps to `DocumentSegment`). Investigate anything unexpected before changing it.

- [ ] **Step 4: Commit**

```bash
git add packages/graph-workflow/src/catalog apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.test.ts
git commit -m "feat(catalog): retag Segment-family ports; segment drill-down in the picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 15: Final regression review + docs + memory

- [ ] **Step 1: Full-repo suites**

```bash
cd packages/graph-workflow && npx jest
cd ../../apps/temporal && npx tsc --noEmit && npx jest
cd ../frontend && npx vitest run src/features/workflow-builder
cd ../.. && node scripts/seed-feature-demos.mjs
npx playwright test tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts tests/e2e/workflow-builder/specs/tier2-typed-io.spec.ts tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts tests/e2e/workflow-builder/specs/tier2-sources.spec.ts tests/e2e/workflow-builder/specs/tier2-control-flow.spec.ts
```
Expected: all PASS. Then the §9 browser walkthrough (Task 9 Step 2 method) across ALL seeded demos — the split/classify demos exercise the Segment retags; verify the map-body picker shows `currentSegment.segmentType` etc. and zero pageerrors. Verdict any finding per Task 9 Step 3.

- [ ] **Step 2: Docs**

- `docs-md/workflow-builder/KIND_TAXONOMY_REFINEMENT_DESIGN.md`: Status → `Implemented (<date>)`; correct §5 if any regression-review verdict amended the table; note in §5 that the two "re-verified during implementation" ports resolved as planned.
- `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`: extend the field-drill-down check (§4.13) with one line: segment map items drill (`currentSegment.segmentType`) and sibling rejection (base64 → blob-key port shows the rejection notice).
- `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md`: in the drill-down bullet, mention `preparedData`/segment fields now enumerate too.

- [ ] **Step 3: Commit**

```bash
git add docs-md/workflow-builder/KIND_TAXONOMY_REFINEMENT_DESIGN.md docs-md/workflow-builder/MANUAL_TEST_PLAN.md docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md
git commit -m "docs(workflow-builder): kind taxonomy refinement — implemented status + test-plan/demo-guide sync

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Execution notes

- **Dev servers:** e2e tasks (7, 8, 9, 15) need backend :3002 + frontend :3000. After package-level kind changes, the frontend dev server may hold stale pre-bundled `@ai-di/graph-workflow` — if the browser throws `does not provide an export named …`, kill the dev server, delete `apps/frontend/node_modules/.vite`, and relaunch `npm run dev:frontend`. Never run installs.
- **Cut lines:** stop after Task 9 = Document family shipped; after Task 10 = + Classification; Task 15's docs step then trims to what shipped.
- **Any port whose runtime shape disagrees with the spec §5 table during implementation:** stop and fix the spec first — the table is the contract the regression verdicts check against.
