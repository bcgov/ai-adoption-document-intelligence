# Step 1: Confusion matrices (reference)

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Section 2  
**Implementation order:** 1 (no dependencies)

---

## Goal

Document and, where applicable, implement ingestion or derivation of confusion-matrix–style data so it can be used for error analysis, correction rules, and benchmarking. Correction tools (Step 2) may consume this data.

**Deliverable scope:** Step 1 SHALL deliver **documentation** of the confusion-matrix concept, format, and intended use. Ingestion or derivation of confusion-matrix data MAY be implemented in Step 1 (e.g. from benchmark/HITL ground truth vs OCR) or deferred to Step 2 when a correction tool (e.g. character-confusion) needs it; if implemented in Step 1, document the data format and API or storage.

## Definition

A **confusion matrix** for OCR records, per character (or token), how often the **true** character was recognized as each **recognized** character. Rows = ground truth, columns = OCR output (or vice versa). Cells = counts or rates.

## Use in this system

- **Error analysis:** Identify which character pairs are most often confused (e.g. `0`/`O`, `1`/`l`, `5`/`S`) to prioritize and tune correction rules.
- **Correction rules:** Feed confusion statistics into rule-based or learned correctors (e.g. `fixCharacterConfusion` in `apps/temporal/src/activities/enrichment-rules.ts`) and into any character-level or word-level correction nodes.
- **Benchmarking:** Compare OCR output vs ground truth (e.g. from HITL corrections) to compute accuracy and per-character error rates; optionally maintain/update confusion matrices from production data. The existing benchmarking system provides runs, evaluators, and metrics; schema-aware or black-box evaluators can emit field-level and character-level metrics as needed.

## Requirements

- The system SHALL support **deriving or ingesting** confusion-matrix–style data (ground truth vs OCR) for analysis and tuning.
- Correction tools MAY use confusion-matrix–derived mappings or weights to apply character-level corrections (aligned with existing `fixCharacterConfusion` and future correction nodes).

## Acceptance criteria

- [ ] Confusion-matrix concept and intended use are documented in `/docs` (e.g. format, derivation from ground truth vs OCR, ingestion path if any).
- [ ] If ingestion or derivation is implemented: data format and API or storage are documented; correction tools (Step 2) can optionally consume it.

## References

- Existing character confusion: `apps/temporal/src/activities/enrichment-rules.ts` (`fixCharacterConfusion`, `CONFUSION_MAP`)
- Benchmarking for metrics: [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md)
