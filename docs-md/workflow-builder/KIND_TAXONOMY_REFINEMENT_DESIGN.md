# Kind Taxonomy Refinement — Design

**Status:** Implemented (2026-07-18)
**Date:** 2026-07-18
**Predecessor:** [KIND_FIELD_SCHEMAS_DESIGN.md](KIND_FIELD_SCHEMAS_DESIGN.md) (shipped 2026-07-18) — provides the machinery this wave applies: `zodToFields`, `KindSchemaMap` identity references, `resolveKindFields` baseKind merging, and the `z.infer` single-source adoption template proven on `OcrResult`/`OcrPayloadRef`.

## 1. Motivation

Port `kind` tags were designed for wiring plausibility, not typing, so one tag
covers several incompatible runtime shapes. Verified against the Temporal
implementations (every claim below traced to the producing/consuming code):

| Tag | Runtime shapes it currently covers | Ports |
|---|---|---|
| `Document` | blob-key string · `PreparedFileData` object · base64 content string | 13 · 3 · 1 |
| `MultiPageDocument` | blob-key string | 3 |
| `Classification` | bare label string · `Record<label, {confidence, pageRange}[]>` | 1 · 3 |
| `Segment` / `Segment[]` | `DocumentSegment` · `SegmentWithType` · `{pageRange, confidence}` · `{label, pageRange, confidence}` · untyped records | ~8 |

Consequences:

- **Latent miswiring.** The builder auto-wires base64 content into blob-key
  inputs (`blob.read.base64` → any `Document` input) — draws fine, fails at
  run time. Same for label-string → label-map on `Classification`.
- **No field drill-down.** A kind covering multiple shapes cannot carry a
  field schema without lying, which is why v1 field schemas cover `OcrResult`
  only.

**The fix: refine, don't replace.** Family kinds (`Document`,
`Classification`, `Segment`) stay as schema-free ancestors; shape-honest
subkinds are added under them via the existing `baseKind` hierarchy, and
catalog ports are retagged to the accurate subkind. `isAssignable` already
walks `baseKind`, so family-level wiring keeps working while sibling subkinds
stop being interchangeable.

### Principles (carried over from the predecessor spec)

1. **A kind names exactly one runtime shape.** If a value's shape varies, the
   honest tag is the family (or `Artifact`), deliberately.
2. **Honest wildcard beats a lying type.** Ports whose payload embeds
   unconstrained data stay family-tagged.
3. **Schemas are single-source.** Every object-shaped subkind gets a Zod
   schema in `kind-schemas.ts`; the Temporal type becomes `z.infer` of it and
   the registry fields derive via `zodToFields`. No hand-written field lists.

## 2. Tagging rule

- **Outputs always narrow.** A producer emits exactly one shape, so there is
  always one true subkind. No judgment calls.
- **Inputs narrow to what the activity code actually accepts.** Read the
  Temporal implementation: accepts one shape → subkind; genuinely handles
  multiple shapes → keep the family tag, deliberately.

Research verdict for this wave: **no polymorphic inputs exist** among the
Document/Classification/Segment-tagged ports — every input destructures a
single shape (e.g. `azureOcr.submit` reads `fileData.blobKey` from a
`PreparedFileData`, never a bare key). So every port in the retag table
narrows; family tags remain only on the ports listed in §7 (Limitations).

Resulting invariant: **any connection the builder rejects after this wave is
a connection that would have failed at run time.**

## 3. Taxonomy

New subkinds in **bold**. Family colors inherit (Document family blue,
Classification family yellow, Segment family green) — the visual language
does not change.

```
Document                      family — schema-free (unchanged)
├── DocumentRef               blob-key string; no fields (primitive)
│   ├── MultiPageDocument     RE-PARENTED under DocumentRef (was: Document)
│   └── SinglePageDocument    RE-PARENTED under DocumentRef (was: Document)
├── PreparedFile              PreparedFileData object → Zod schema
└── DocumentContent           base64 content string; no fields (primitive)

Classification                family — schema-free (unchanged)
├── ClassificationLabel       bare label string; no fields (primitive)
└── LabeledDocumentMap        Record<label, ClassifiedDocument[]>; schema-free
                              (dynamic-key record — zodToFields correctly
                              refuses records; drill-down does not apply)

Segment                       family — schema-free (unchanged)
├── DocumentSegment           {segmentIndex, pageRange, blobKey, pageCount} → schema
│   └── TypedSegment          DocumentSegment + {segmentType, keywordMatch?,
│                             confidence} → schema (runtime SegmentWithType
│                             literally `extends DocumentSegment`)
├── ClassifiedPageSegment     {pageRange, confidence} → schema
├── LabeledSegment            {label, pageRange, confidence} → schema
└── Segment<Text> … <Header>  existing parameterized subkinds — UNTOUCHED
                              (no catalog port uses them; no shape collision)
```

Naming notes:

- `TypedSegment` (not "ClassifiedSegment") because the runtime interface
  `ClassifiedSegment` in `flatten-classified-documents.ts` names a *different*
  shape (`{label, pageRange, confidence}`). That runtime interface is renamed
  `LabeledSegment` during its `z.infer` adoption, resolving the collision.
- `OcrFields`/`OcrTable`/`ValidationResult`/`Reference` are out of scope —
  single-shape or single-port, no conflation found.

### Re-parenting MultiPageDocument / SinglePageDocument

These classify by page count — a semantic axis, not a shape axis. All their
ports carry blob-key strings at runtime (verified: `document.split`,
`document.splitAndClassify`, `document.extractPageRange` inputs all
destructure `blobKey: string`). Re-parenting them under `DocumentRef` makes
`MultiPageDocument` mean "a DocumentRef known to be multi-page": page-count
wiring semantics are preserved, and `DocumentRef` outputs remain assignable
into family-level `Document` inputs while `MultiPageDocument`-tagged inputs
still reject plain `DocumentRef` outputs (an un-split-checked ref is not
known to be multi-page — unchanged behavior).

## 4. Schemas and single-source adoptions

All schemas live in `packages/graph-workflow/src/types/kind-schemas.ts`
alongside `OcrResultSchema`, registered in `KIND_SCHEMAS` for identity-based
kind references, and consumed by the registry via `zodToFields`. Each
adoption follows the `OcrPayloadRef` template: the Temporal interface is
replaced by `z.infer` re-exported through the package.

| Kind | Schema (shape verified at file:line) | Temporal adoption |
|---|---|---|
| `PreparedFile` | `{fileName: string, fileType: enum("pdf","image"), contentType: string, blobKey: string, modelId: string, outputFormat?: enum("text","markdown")}` — `apps/temporal/src/types.ts:205-213` | `PreparedFileData` in `types.ts` becomes `z.infer` |
| `DocumentSegment` | `{segmentIndex: number, pageRange: {start: number, end: number}, blobKey: string, pageCount: number}` — `split-document.ts:18-23` | `DocumentSegment` becomes `z.infer` |
| `TypedSegment` | `DocumentSegmentSchema.extend({segmentType: string, keywordMatch?: string, confidence: number})` — `split-and-classify-document.ts:17-20` | `SegmentWithType` becomes `z.infer` |
| `ClassifiedPageSegment` | `{pageRange: {start, end}, confidence: number}` — `select-classified-pages.ts:12-17` | `ClassifiedPageSegment` becomes `z.infer` |
| `LabeledSegment` | `{label: string, pageRange: {start, end}, confidence: number}` — `flatten-classified-documents.ts:15-22` (runtime interface renamed from `ClassifiedSegment`) | renamed interface becomes `z.infer` |

`DocumentRef`, `DocumentContent`, `ClassificationLabel` are string-shaped:
registry entries with no `fields` (nothing to drill into). `LabeledDocumentMap`
is a dynamic-key record: registry entry with no `fields`, deliberately —
its Temporal types (`AzureClassifyPollOutput.labeledDocuments` et al.) keep
their hand-written form since there is no schema to infer from.

### Machinery extension: `zodToFields` learns `z.enum`

`PreparedFileData.fileType` is `"pdf" | "image"`. `zodToFields` currently
throws on `enum`. Extension: `case "enum"` maps to
`{name, type: "string", required}` (zod/v4 enums are string-valued; the def
exposes `entries`). This is the **only** converter change — nested anonymous
objects, arrays, optionals, literals already behave as needed.

### Nested `pageRange` — drill-down stops, by design

`pageRange` is an anonymous nested object, so `zodToFields` emits
`{name: "pageRange", type: "object", required}` with no `kind` — the picker
shows the field but does not enumerate `.start`/`.end`. This matches the
predecessor spec's resolved open question 5 (anonymous nested = drill stops;
authors can still type the deeper path — free entry remains supported).
Registering a `PageRange` artifact kind was rejected: page ranges are not
artifacts, and polluting the wiring taxonomy to gain two picker rows fails
YAGNI. Revisit only if field-level demand shows up (would be an inline
`fields` extension on `FieldDescriptor`, not a kind).

## 5. Retag table

Every kind-tagged port traced to its Temporal implementation
(catalog path prefix `packages/graph-workflow/src/catalog/`, impl prefix
`apps/temporal/src/activities/`). "→" = new tag.

### Document family

| Catalog port | Dir | Was | → Now | Runtime evidence |
|---|---|---|---|---|
| `file.prepare` `blobKey` | in | Document | **DocumentRef** | `PrepareFileDataInput.blobKey: string` |
| `file.prepare` `preparedData` | out | Document | **PreparedFile** | returns `PreparedFileData` object |
| `blob.read` `blobKey` | in | Document | **DocumentRef** | `BlobReadInput.blobKey: string` |
| `blob.read` `base64` | out | Document | **DocumentContent** | `data.toString("base64")` |
| `azureOcr.submit` `fileData` | in | Document | **PreparedFile** | `params.fileData: PreparedFileData` |
| `mistralOcr.process` `fileData` | in | Document | **PreparedFile** | `fileData: PreparedFileData` |
| `azureClassify.submit` `blobKey` | in | Document | **DocumentRef** | `blobKey: string` |
| `azureClassify.submit` `blobKey` | out | Document | **DocumentRef** | forwards input key |
| `azureClassify.poll` `blobKey` | in | Document | **DocumentRef** | destructures `blobKey` |
| `azureClassify.poll` `originalBlobKey` | out | Document | **DocumentRef** | `originalBlobKey: blobKey` |
| `document.split` `blobKey` | in | MultiPageDocument | *(unchanged tag; kind re-parented)* | `blobKey: string` |
| `document.splitAndClassify` `blobKey` | in | MultiPageDocument | *(unchanged; re-parented)* | `blobKey: string` |
| `document.extractPageRange` `blobKey` | in | MultiPageDocument | *(unchanged; re-parented)* | `blobKey: string` |
| `document.extractPageRange` `segmentBlobKey` | out | Document | **DocumentRef** | newly written blob key |
| `document.extractToBase64` `blobKey` | in | Document | **DocumentRef** | `blobKey: string` |
| `document.normalizeOrientation` `blobKey` | in | Document | **DocumentRef** | `blobKey: string` |
| `document.normalizeOrientation` `correctedBlobKey` | out | Document | **DocumentRef** | blob key |
| `source.upload` `outputKind` | out | Document | **DocumentRef** | upload service stores a validated blob key (`source-upload.service.ts:102-116`) |

### Classification family

| Catalog port | Dir | Was | → Now | Runtime evidence |
|---|---|---|---|---|
| `document.classify` `segmentType` | out | Classification | **ClassificationLabel** | `segmentType: string` (rule label or `"unknown"`) |
| `azureClassify.poll` `labeledDocuments` | out | Classification | **LabeledDocumentMap** | `Record<string, ClassifiedDocument[]>` |
| `document.selectClassifiedPages` `labeledDocuments` | in | Classification | **LabeledDocumentMap** | same record type |
| `document.flattenClassifiedDocuments` `labeledDocuments` | in | Classification | **LabeledDocumentMap** | same record type |

### Segment family

| Catalog port | Dir | Was | → Now | Runtime evidence |
|---|---|---|---|---|
| `document.split` `segments` | out | Segment[] | **DocumentSegment[]** | `DocumentSegment[]` |
| `document.splitAndClassify` `segments` | out | Segment[] | **TypedSegment[]** | `SegmentWithType[]` |
| `document.selectClassifiedPages` `segments` | out | Segment[] | **ClassifiedPageSegment[]** | `ClassifiedPageSegment[]` |
| `document.flattenClassifiedDocuments` output | out | Segment[] | **LabeledSegment[]** | `ClassifiedSegment[]` (renamed) |
| `document.classify` `segment` | in | Segment | **DocumentSegment** | `segment: DocumentSegment` (accepts `TypedSegment` via baseKind) |
| `segment.combineResult` `currentSegment` | in | Segment | **TypedSegment** | inline duplicate of `SegmentWithType` shape |
| `segment.combineResult` `combinedSegment` | out | Segment | *(stays `Segment`)* | payload embeds `ocrResult: unknown` — principle 2 |
| `document.validateFields` `processedSegments` | in | Segment[] | *(stays `Segment[]`)* | runtime `Array<Record<string, unknown>>` — untyped, principle 2 |

Exact directions/kinds for the two ports researched at lower depth
(`document.flattenClassifiedDocuments` output port name, `segment.combineResult`
port tags) are re-verified against the catalog files during implementation;
the runtime shapes are confirmed.

## 6. Catalog honesty fixes riding along

1. **`document.extractToBase64` declares an output that does not exist.**
   The catalog lists a `base64` output; the runtime (`extract-pages-base64.ts`)
   returns `{pageBlobPath, pageIndex, byteLength, pageCount}` — a blob path,
   not base64. The catalog entry is corrected to the real contract
   (`pageBlobPath` tagged **DocumentRef**, plus the three number outputs).
   Renaming the misleading activity id itself (`document.extractToBase64`) is
   **out of scope** — it is a persisted identifier in saved workflows.
2. **`source.upload`'s derived output schema says `format: "uri"`** but the
   stored value is a blob key. The `format` annotation is removed. The default
   `ctxKey` name `"documentUrl"` is likewise misleading but is user-visible
   config with seeded-demo usage; renaming it is **out of scope** (noted for
   the demo-fabrication audit).

## 7. What does NOT change

- **Runtime execution.** Kinds are builder-side metadata; the executor never
  reads them. No saved workflow changes behavior at run time. No backend, API,
  or Swagger surface is touched.
- **Wiring/validation code.** `isAssignable`, `resolveKindFields`,
  `resolveProducerKindFor`, the picker, and the condition editor need zero
  changes — this wave is registry data + catalog tags + Zod schemas + the
  one-case `zodToFields` enum extension.
- **Parameterized `Segment<X>` kinds** — untouched, unused by catalog ports.
- **Input-field declarations** (author-defined workflow input contracts, the
  eventual fix for `currentDoc.type`) — explicitly deferred to its own design.

### Limitations (deliberate)

- `pageRange` drill-down stops at the object (see §4).
- `LabeledDocumentMap`, `ClassificationLabel`, `DocumentRef`,
  `DocumentContent` have no fields — wiring honesty only, no drill-down.
- `segment.combineResult` output and `document.validateFields` input stay
  family-tagged (unconstrained payloads).

## 8. Demo seed retags

`scripts/seed-feature-demos.mjs` ctx/kind declarations update in the same
pass wherever they name a family kind that a connected port has narrowed
(e.g. ctx entries feeding `blobKey` inputs → `DocumentRef`). This is
mechanical and keeps the demos exercising the narrowed wiring paths. The
separate demo-fabrication audit runs **after** this wave, on honest tags.

## 9. Regression review protocol (the careful part)

Every narrowed input can change auto-wire/validation outcomes in existing
demos and e2e fixtures. The review is per-narrowed-input:

1. Run the full builder test suites (packages/graph-workflow Jest, frontend
   Vitest, tier-2 e2e) and open each seeded demo in the builder.
2. List every connection that stopped auto-wiring or turned invalid.
3. Verdict each against the §5 evidence table. Expected verdict for all:
   *"was a latent miswire, now correctly rejected"* or *"demo tag updated in
   §8, wiring intact."* Any connection that was legitimate and now rejected
   means the shape assessment in §5 is wrong — **fix the table (and tag),
   not the demo**; this blocks the merge.

Existing saved workflows with now-invalid edges: they keep running (see §7);
the builder's existing validation surfaces the edge as invalid on next edit,
which is the desired honest behavior — no migration, per the no-backwards-
compat project rule.

## 10. Testing

Mirrors the predecessor wave's structure:

- **kind-schemas / registry (Jest):** each new schema round-trips through
  `zodToFields` to the expected `FieldDescriptor[]`; `resolveKindFields`
  merges `TypedSegment` → `DocumentSegment` chain correctly (own-over-
  inherited, base-first order); re-parented `MultiPageDocument` resolves
  through `DocumentRef`; enum extension unit tests (happy + still-throws-on-
  union/record).
- **isAssignable (Jest):** sibling rejection matrix (`DocumentContent` ↛
  `DocumentRef`, `ClassificationLabel` ↛ `LabeledDocumentMap`,
  `DocumentSegment` ↛ `ClassifiedPageSegment`), family acceptance
  (`PreparedFile` → `Document`), re-parent chain (`MultiPageDocument` →
  `DocumentRef` → `Document`), array variants.
- **Temporal (Jest):** existing activity tests re-run after each `z.infer`
  adoption — the compiler is the real check; tests confirm no behavior drift.
- **Frontend (Vitest):** picker shows drill-down for `PreparedFile` and
  segment subkinds (e.g. map item `currentSegment.segmentType`); condition
  editor field picker on a `TypedSegment` producer.
- **e2e (tier-2):** one drag-to-bind rejection case for a newly-invalid
  sibling pair; demo smoke over the retagged seeds.

## 11. Sequencing

Three phases, strictly ordered so the wave can be **cut after any phase**
and still ship a consistent taxonomy for the families it covered:

1. **Document family** — subkinds, `PreparedFile` schema + adoption,
   re-parenting, retags, honesty fixes (§6), demo retags, regression review.
2. **Classification family** — two schema-free subkinds, retags, review.
3. **Segment family** — four subkinds with schemas + adoptions (including the
   `LabeledSegment` rename), retags, review. Cuttable if the wave drags.

Each phase ends with the §9 protocol and its own commits.

## 12. Implementation notes (2026-07-18)

- All three phases shipped: Document (`DocumentRef`/`PreparedFile`/`DocumentContent` + re-parented `MultiPageDocument`/`SinglePageDocument`), Classification (`ClassificationLabel`/`LabeledDocumentMap`), Segment (`DocumentSegment`/`TypedSegment`/`ClassifiedPageSegment`/`LabeledSegment`). `PreparedFile` and the four segment object-shapes carry Zod-derived field schemas; the string/record subkinds are schema-free.
- `zodToFields` gained a `z.enum` case (`PreparedFile.fileType`). `PageRange` is deliberately unregistered, so `pageRange` drill-down stops at the object (authors type `.start`/`.end` free-hand).
- Temporal single-source adoptions via `z.infer`: `PreparedFileData` and the four segment types now re-export from `@ai-di/graph-workflow`; the runtime interface `ClassifiedSegment` was hard-renamed to `LabeledSegment` (no alias).
- **Plan gap caught in regression review:** the preview-widget dispatch (`render-kind-value.tsx` / `PreviewWidget.tsx`) matched kinds by exact string, so retagged subkinds rendered no preview (node-card preview + wire-peek). Fixed by resolving each kind to its `baseKind` family root before dispatch (commit dc6529c9). The design's "no frontend changes needed" assumption missed this.
- **Segment drill-down scope:** the variable picker enumerates segment fields (e.g. a `TypedSegment` map-item shows its 7 fields) — covered by a passing test. The **condition editor** does NOT offer segment drill-down: every real Segment producer port is an array kind (`DocumentSegment[]` etc.) and the condition editor's producer resolution doesn't unwrap array producers to element fields (only the variable picker does, via map-item unwrap). This is a real limitation, documented not fixed.
- **Catalog honesty fixes shipped:** `document.extractToBase64`'s stale `base64` output replaced with its real `pageBlobPath` (`DocumentRef`)/`pageIndex`/`byteLength`/`pageCount` outputs; `source.upload` dropped its misleading `format: "uri"` (it stores a blob key) and its `outputKind` is now `DocumentRef`.
- **Verification:** graph-workflow 932 Jest, temporal 1069 Jest + clean tsc, frontend 1369 Vitest all green; e2e sibling-rejection + typed-io + sources + control-flow green; browser walkthrough of the OCR/multi-page demos shows subkinds rendering with zero page errors and zero invalid edges.
- **Pre-existing failures (NOT caused by this wave):** five tier2 e2e checks in the `InputsSection` settings panel fail because they query `⋯`-dropdown menu actions ("Change source"/"Revert to automatic") as directly-visible buttons, plus one canvas badge-click timeout. `InputsSection.tsx` is untouched by this wave (verified via git log). Flagged for separate triage.
