# Untyped Ports — Findings (UX walkthrough follow-up, 2026-08-02)

Item 11 of `UX_WALKTHROUGH_FIXES_20260729.md`. Alex's observation in the
2026-07-29 walkthrough: *"it says a request ID, but behind the scenes it's just
a string — anything can be a string"* — untyped ports undermine both the colour
semantics (grey dots everywhere) and every kind-driven feature (auto-wire,
hover-extend filtering both directions, the producer picker).

**This is a findings note, not a change.** Catalog retags need Alex's call
(and ripple into saved workflows' bindings), so nothing is retagged here.

## Inventory

Across `packages/graph-workflow/src/catalog/activities/` a large share of ports
are declared `kind: "Artifact"` (the wildcard). The whole benchmark family is
effectively untyped (`benchmark-evaluate` is 9/9 Artifact), and even core
pipeline activities carry mostly-wildcard port lists (`azure-classify-submit`
7/9, `azure-ocr-extract` 5/6, `file-prepare` 4/6).

Most frequent `Artifact`-typed port names, by count:

| Count | Port name | What it actually is |
|---|---|---|
| 14 | `documentId` | Identifier (DB id of a document) |
| 8 | `groupId` | Identifier |
| 5 | `sampleId` | Identifier (benchmark) |
| 4 | `apimRequestId` | Identifier (Azure APIM correlation) |
| 4 | `ocrResponse` | Structured payload — arguably deserves a real kind |
| 3 | `modelId` / `runId` | Identifiers |
| 2 each | `resultId`, `sourceRunId`, `materializedPath`, `fileName`, `fileType`, `pageRange`, `enrichmentSummary` | Identifiers / scalars / small payloads |

Two distinct populations fall out of this:

1. **Identifier strings** (`documentId`, `groupId`, `runId`, `modelId`,
   `apimRequestId`, …) — the exact case Alex named. These dominate the
   wildcard count.
2. **Structured payloads left untyped** (`ocrResponse`, `predictionData`,
   `enrichmentSummary`) — real objects that could carry a registry kind today.

## Why it matters (what wildcards cost)

- `shouldAutoWirePort` deliberately ignores base-`Artifact` ports, so none of
  these participate in auto-wire, the §9 hover-extend filter, or the new
  input-side (upstream) suggestions — reproducing exactly the discoverability
  dead-end the UX reviewer hit ("which node has the request ID? how do I figure that
  out?").
- On the canvas they all render as grey dots, which is what made the colour
  scheme look arbitrary (item 10) — most dots were grey regardless of meaning.

## Options

- **A. Branded identifier kinds** — add a small `Identifier` family to the
  registry (e.g. `DocumentId`, `RunId`, `GroupId`, `ModelId`, base
  `Identifier`), one shared colour, and retag the identifier ports.
  Auto-wire then distinguishes `documentId → documentId` from
  `documentId → fileName`, and both hover-extend directions can answer
  "which node produces a document ID?". Cost: a registry family + a catalog
  sweep + regression care around `isAssignable` (identifiers must NOT be
  assignable to each other, only to their own kind / base `Identifier`).
- **B. Type only the structured payloads** (`ocrResponse` etc.) and leave
  identifiers untyped. Cheaper, but doesn't touch the case Alex actually
  named.
- **C. Do nothing** — accept grey dots and manual wiring for identifiers.

## Recommendation

Option A, scoped to the 6–8 identifier names in the table (which covers ~40 of
the wildcard ports), plus retagging `ocrResponse` where a real kind already
fits. Do it as its own change with validator coverage — not inside this fix
batch.

Filed as an open question in the work store (Document Intelligence Platform
stream) for Alex's decision.
