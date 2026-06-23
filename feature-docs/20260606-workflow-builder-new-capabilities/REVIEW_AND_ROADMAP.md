# Workflow Builder — System Review & Capability Roadmap

**Status:** Overall plan — shape under review (node-level design not yet started)
**Owner:** Alex
**Companion research:** [idp_processing_research.md](./idp_processing_research.md)
**Reviewed against:** the live engine (`packages/graph-workflow`, `apps/temporal`), the catalog, and the v2 builder UI — **claims verified against source**, not assumed.

---

## 1. Verdict on the current system

The engine is **mature and, in several respects, ahead of the commercial IDP field** in the research:

| Capability | Your system | Commercial field (per research) |
|---|---|---|
| **Typed ports + auto-wire** | Nominal artifact hierarchy + binding-walk validator + auto-wire resolver | Most builders (UiPath, ABBYY) have **untyped wires** |
| **Versioned lineage** | Immutable `WorkflowVersion` snapshots per lineage, version pinning | Research §B.3 lists this as a first-class resource you must build — you have it |
| **User-extensible nodes** | Phase 6 dynamic nodes: user TS in a Deno sandbox, JSDoc→schema, versioned | Research §E: "none of the OSS provides an end-to-end node-based builder — the market gap" |
| **Engine model** | Data-driven interpreter over Temporal; durability/retries/signals for free | Research finding #7 endorses Temporal for IDP |
| **Authoring agent** | Phase 7 chat agent drives the same MCP surface a human uses | Ahead of the field |

**Engine-approach verdict: the foundation is right — keep it.** No rearchitecture. The work below is *additive capability*, sequenced so the most reusable, generic pieces land first.

---

## 2. The strategic lens: scoped to IDP, generic *within* it

**Scope correction.** This is an **IDP system**, not a general-purpose workflow engine. "Generic" in `CLAUDE.md` means **document-type-agnostic** — no invoice/W-2/etc. hardcoding — *not* workload-agnostic. The comparables are ABBYY/UiPath/Rossum, **not** n8n/Zapier.

Within that scope the principle is **reusable base primitives + extensibility (BYO config/services)**: a small set of composable nodes (HTTP, LLM-structured-output, rule/validation, confidence gate) that assemble arbitrary *document* pipelines, plus the dynamic-node / provider escape hatches for the long tail.

**Ordering chosen: build the reusable primitives first** (they compose with every existing node), with the real **SDPR pipeline as the forcing function** — see [COMPREHENSIVE_PLAN.md](./COMPREHENSIVE_PLAN.md) Part 6.

---

## 3. Ground truth — what already exists (do NOT rebuild)

Verified against source during this review:

- **Confidence + spatial provenance — EXISTS.** `KeyValuePair.confidence` + `boundingRegions` ([apps/temporal/src/types.ts:91-109](../../apps/temporal/src/types.ts#L91-L109)), `Segment.confidence/polygon`, gated by `ocr.checkConfidence` and `ocr.enrich`.
- **In-pipeline LLM with structured output — EXISTS but coupled.** `ocr.enrich` + `enableLlmEnrichment` → `callAzureOpenAI` with a JSON schema ([enrichment-llm.ts:155-230](../../apps/temporal/src/activities/enrichment-llm.ts#L155-L230)). It's *welded to OCR enrichment*, not a standalone general node.
- **HITL review + corrections capture — EXISTS but loop open.** `features/annotation/hitl/` UI, `document.storeRejection` with `annotations`. The **feedback loop back to a dataset/retraining is missing** (`useCorrections` is a stub).
- **Engine substrate — EXISTS.** Typed ports, auto-wire, versioned lineage, validator, dynamic nodes, source nodes, Phase 7 authoring agent.

### Verified-genuine gaps
- **Generic outbound I/O — fully missing.** No `http.request`, `notify`, or `export`. Outbound is document-specific and DB-internal only (`ocr.storeResults`, `document.updateStatus`).
- **Standalone general LLM node — partial.** Engine exists inside `ocr.enrich`; not exposed as a decoupled node.
- **Provider abstraction + ensemble — deliberately deferred (not a flaw).** OCR engines are separate activities by a *documented decision* (`docs-md/workflow-builder/EXTRACTION_PROVIDER_ARCHITECTURE.md`): extract a shared interface only if 2 new engines duplicate ≥30 lines of boilerplate. The experiment branches now add 5 engines + an ensemble combiner — i.e. you're at your own revisit trigger. See COMPREHENSIVE_PLAN Wave 2.
- **HITL feedback loop — partial.** Capture built; dataset/retraining loop absent.
- **Generic cross-field rule/validation — partial.** `document.validateFields` exists but is document-branded.

---

## 4. The full plan lives in COMPREHENSIVE_PLAN

This document is the **exec summary + engine verdict**. The total coverage matrix, the **12-wave plan**, the schema-evolution/migration policy, and the canonical-pipeline gauntlet live in [COMPREHENSIVE_PLAN.md](./COMPREHENSIVE_PLAN.md). *(An earlier 5-wave sketch here was superseded by that 12-wave plan and removed to avoid two divergent plans.)*

## 5. Next step

**SDPR is pipeline #0** — the one target with a real client ([reports/SDPR_OCR_Performance_Report_V2.md](./reports/SDPR_OCR_Performance_Report_V2.md) §§6–7, 10). Its pipeline (extract → normalize → ICM cross-validation → business-rule checks → per-field risk gate → tiered HITL) exercises the Wave-1 primitives directly, and the report flags several knobs as **undefined** (risk thresholds, ICM lookup key, date validation, second-pass engine) — which is the concrete case for building them **configurable**. Drafting the SDPR pipeline as the **Wave-1 spec** is the next deliverable.
