# User Stories — OCR Correction Tools and Benchmark Comparison (Feature 008)

This feature covers confusion matrices, correction tools, AI HITL processing, workflow modification utility, and benchmark integration so you can **run the baseline, make corrections, and have AI review the results**. User stories for **conditional replacement**, the **full feedback loop**, and **AI-generated nodes exploration** are in [Feature 008A](../008A-agentic-sdlc-workflow-replacement/user_stories/).

Requirements: [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) (Sections 1–6, 10). Step-by-step implementation: [feature-docs/008-ocr-correction-agentic-sdlc/](../).

**Operational reference (pipeline API, UI entry points, correction order):** [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../../docs-md/OCR_IMPROVEMENT_PIPELINE.md).

All user story files are in `feature-docs/008-ocr-correction-agentic-sdlc/user_stories/`.

After implementing a user story, check it off in the phase sections below.

---

## Phase 1: Confusion matrices (Step 1)

| File | Title | Done |
|------|-------|------|
| `US-001-confusion-matrix-documentation.md` | Document confusion matrix concept and format | [ ] |
| `US-002-confusion-matrix-ingestion-derivation.md` | Implement confusion-matrix ingestion or derivation (optional) | [ ] |

---

## Phase 2: OCR correction tools and nodes (Step 2)

| File | Title | Done |
|------|-------|------|
| `US-003-spellcheck-correction-activity.md` | Spellcheck correction activity (full OCR shape) | [ ] |
| `US-004-character-confusion-correction-activity.md` | Character-confusion correction activity (full OCR shape) | [ ] |
| `US-005-deterministic-correction-activity.md` | Third deterministic correction activity (e.g. trim/normalize) | [ ] |
| `US-006-correction-tools-registry-and-docs.md` | Register OCR correction tools and document in graph workflow | [ ] |

---

## Phase 3: AI HITL processing and tool selection (Step 3)

| File | Title | Done |
|------|-------|------|
| `US-007-hitl-aggregation-api.md` | HITL aggregation API or query for correction data | [ ] |
| `US-008-tool-manifest-for-ai.md` | Tool manifest or registry extension for AI | [ ] |
| `US-009-ai-hitl-recommendation-pipeline.md` | AI pipeline activity for HITL feedback and tool recommendation | [ ] |

---

## Phase 4: Benchmark integration and workflow modification (Step 4)

| File | Title | Done |
|------|-------|------|
| `US-010-workflow-modification-utility.md` | Workflow modification utility (graph + recommendation → new graph) | [ ] |
| `US-011-persist-workflow-version.md` | Persist new workflow version from workflow modification utility | [ ] |
| `US-012-benchmark-run-workflow-override.md` | Benchmark run start with optional workflow override | [ ] |
| `US-013-candidate-run-and-read-comparison.md` | Automation or activity to run candidate and read baseline comparison | [ ] |
| `US-014-ocr-correction-evaluator.md` | Add or register OCR correction evaluator (if needed) | [ ] |

---

## Suggested implementation order (by dependency)

### Phase 1
- [ ] **US-001** — Confusion matrix documentation (no dependencies)
- [ ] **US-002** — Confusion matrix ingestion/derivation (optional; can follow US-001)

### Phase 2
- [ ] **US-003** — Spellcheck activity
- [ ] **US-004** — Character-confusion activity
- [ ] **US-005** — Third deterministic correction activity
- [ ] **US-006** — Register all three and document (depends on US-003, US-004, US-005)

### Phase 3
- [ ] **US-007** — HITL aggregation API
- [ ] **US-008** — Tool manifest for AI
- [ ] **US-009** — AI recommendation pipeline (depends on US-007, US-008)

### Phase 4
- [ ] **US-010** — Workflow modification utility
- [ ] **US-011** — Persist workflow version (depends on US-010)
- [ ] **US-012** — Benchmark run workflow override (depends on existing benchmarking system)
- [ ] **US-013** — Candidate run and read comparison (depends on US-010, US-011, US-012)
- [ ] **US-014** — OCR correction evaluator (if needed; can be parallel)

---

## Follow-on feature

User stories **US-015** through **US-019** (conditional replacement, feedback loop, AI-generated nodes exploration) are in [Feature 008A user_stories](../008A-agentic-sdlc-workflow-replacement/user_stories/).
