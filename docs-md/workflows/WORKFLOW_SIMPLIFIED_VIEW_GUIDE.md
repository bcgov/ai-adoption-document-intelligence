# Workflow Builder — Simplified View Guide

**Audience:** Product, UX, and engineering reviewing workflow-builder UX.

**Purpose:** Team-facing reference for the simplified workflow view. This guide turns the exposure rules in `ACTIVITY_PARAMETERS_AUDIT.md` into concrete palette, grouping, and review decisions.

**Status:** Current-state guide with pending product/UX decisions.

---

## Current branch baseline

The V2 builder already has the foundations this guide assumes:

- palette → canvas → settings editor shell
- simplified canvas mode with group chips
- group settings with editable `exposedParams`
- schema-driven activity parameter forms
- auto-wire-first Inputs section with Override/Revert
- raw port→ctx bindings hidden behind **Show advanced**

The remaining decisions are mostly about **how simplified mode should group, name, and curate nodes**.

---

## Design rules

1. Show business choices, not wiring internals.
2. Prefer UI composition over runtime activity merges.
3. Keep simplified mode focused; detailed mode remains the escape hatch.
4. Never expose `groupId`, `requestId`, API operation IDs, benchmark internals, or raw ctx/port mechanics by default.

---

## Master review table

| Block / node | Category | Current status | Simplified target | Primary settings | Advanced settings | Hidden internals | Decision |
|---|---|---|---|---|---|---|---|
| Extract Text (Azure) | OCR | Partial | Composite | OCR model | Locale, poll timing | request/poll/header internals | ☐ Approve composite |
| Extract Text (Mistral) | OCR | Partial | Composite / preset | Template model | Annotation prompt | provider internals | ☐ Promote preset |
| Classify Document (Azure) | Document Handling | Partial | Composite | Classifier | Poll tuning, if exposed | operation IDs, classifier payload internals | ☐ Approve composite |
| Post-OCR Processing | Post-processing | Partial | Composite | Confidence threshold | Correction options | OCR passthrough wiring | ☐ One block ☐ Split blocks |
| Quality Gate & Review | Flow Control | Partial | Composite or split | Review timeout, threshold if needed | Timeout behavior | switch expression plumbing | ☐ Fixed switch ☐ Editable switch |
| Store Results | Storage | Implemented | Auto-wired terminal | None by default | Completion status, if needed | storage payload wiring | ☐ Keep implicit |
| Enrich OCR Results | OCR Quality | Implemented | Standalone optional | Doc type, LLM toggle, threshold | — | raw binding internals | ☐ Default palette ☐ Optional only |
| Data Transform | Data | Implemented | Standalone | Formats, mapping | XML envelope, data sources | port-binding internals | ☐ Keep standalone |
| Tables Lookup | Data | Implemented | Standalone optional | Table, lookup, args | — | tenant/group plumbing | ☐ Keep standalone |
| Split & Classify | Document Handling | Implemented | Standalone promoted | Keyword patterns | — | segment wiring | ☐ Promote |
| Validate Fields | Validation | Implemented | Standalone | Validation rules | — | primary/attachment indexing mechanics | ☐ Keep standalone |
| Correct Orientation | Document Handling | Implemented | Standalone | OSD threshold | — | orientation internals | ☐ Keep standalone |
| Select Classified Pages | Document Handling | Implemented | Standalone | Target label | — | classifier payload structure | ☐ Keep standalone |
| Flatten Classified Documents | Document Handling | Implemented | Standalone | Filter labels | — | classifier payload structure | ☐ Keep standalone |
| Granular OCR/split/blob set | Advanced | Implemented in detailed editor | Detailed-only | — | — | raw ctx/port mechanics | ☐ Approve demotion |
| Benchmark/system activities | Internal | Implemented runtime | Omit | — | — | entire surface | ☐ Approve omission |

---

## Composite block definitions

### Extract Text (Azure)

Internal chain: `file.prepare` → `azureOcr.submit` → optional `document.updateStatus` → `pollUntil(azureOcr.poll)` → `azureOcr.extract`.

Keep the runtime steps separate for retries, benchmark replay, status updates, and caching. Show one simplified block with OCR model and optional poll/locale settings.

### Extract Text (Mistral)

Internal chain: `file.prepare` → `mistralOcr.process`.

Show as a provider preset parallel to Azure. Primary setting is the template/labeling project; prompt belongs in Advanced.

### Classify Document (Azure)

Internal chain: `azureClassify.submit` → `azureClassify.poll`.

Show as one classifier block. Hide operation IDs and raw classifier payloads.

### Post-OCR Processing

Internal chain: `ocr.cleanup` → optional correction tools → `ocr.checkConfidence`.

Show as one post-processing group unless the team decides cleanup/correction/quality should be separate chips.

### Quality Gate & Review

Internal chain: confidence result → switch → optional human review → store.

Keep switch conditions template-fixed in simplified mode unless the team explicitly chooses to allow switch editing there.

---

## Recommended simplified palette

```text
OCR
  - Extract Text (Azure)
  - Extract Text (Mistral)

Post-processing
  - Post-OCR Processing
  - Quality Gate & Review
  - Enrich Results (optional)

Document Handling
  - Classify Document (Azure)
  - Select Classified Pages
  - Flatten Classified Documents
  - Split & Classify
  - Correct Orientation

Validation
  - Validate Fields

Data
  - Data Transform
  - Tables Lookup

Flow Control
  - Loop
  - Collect
  - Sub-workflow

Storage
  - Store Results
```

---

## Detailed-only recommendations

Demote these from the default simplified palette:

- granular Azure OCR steps: `azureOcr.submit`, `azureOcr.poll`, `azureOcr.extract`
- granular correction steps: `ocr.cleanup`, `ocr.normalizeFields`, `ocr.characterConfusion`, `ocr.spellcheck`
- lower-level document utilities: `document.split`, `document.classify`, `segment.combineResult`
- blob/page utilities: `blob.read`, `document.extractToBase64`
- branch-only storage: `document.storeRejection`

Omit entirely from author palette:

- all `benchmark.*` activities
- `getWorkflowGraphConfig`

---

## Team checklist

### Product/UX decisions

- [ ] Approve composite boundaries.
- [ ] Decide whether switch conditions are editable in simplified mode.
- [ ] Confirm optional standalone nodes in the default palette.
- [ ] Confirm detailed-only demotion list.

### Engineering decisions

- [ ] Build composite-level settings panels over existing node/group infrastructure.
- [ ] Add rich editors where schema forms are too raw.
- [ ] Finalize simplified palette curation.

### Open questions

- [ ] Normalize classifier polling to `pollUntil` or keep current model.
- [ ] Decide how to present multiple `document.updateStatus` nodes.
- [ ] Keep `segment.combineResult` permanently hidden inside loop UX.

---

## Related documents

- `ACTIVITY_PARAMETERS_AUDIT.md`
- `WORKFLOW_NODE_CATALOG.md`
- `WORKFLOW_DESIGN_BRIEF.md`
- `../graph-workflows/GRAPH_TYPES.md`
