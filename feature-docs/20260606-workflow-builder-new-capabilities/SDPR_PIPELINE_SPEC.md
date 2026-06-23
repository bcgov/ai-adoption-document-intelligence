# SDPR Pipeline — Wave-1 Design Spec

**Status:** Design — awaiting user review (pre-implementation)
**Owner:** Alex
**Role:** Pipeline #0 of the canonical gauntlet ([COMPREHENSIVE_PLAN.md](./COMPREHENSIVE_PLAN.md) Part 6) and the **forcing function for the Wave-1 primitives**.
**Sources:** `reports/MRA_Phase3_Future_State_Process (2).docx` (authoritative process), `reports/SDPR_OCR_Performance_Report_V2.md` (§§6–7, 10 — data-processing detail).

---

## 1. Design principle (read first)

This spec defines an **SDPR pipeline**, but it introduces **no SDPR-specific node types**. Everything SDPR-specific lives in **config + a library-workflow assembly**. The pipeline is built from **generic, reusable primitives** — the same ones every other gauntlet pipeline uses:

- `http.request` (Wave 1) — outbound call to CDW.
- generic `rule/validation` node (Wave 1) — the gate set, multi-rule + short-circuit.
- `switch` (existing) — form-type + result routing.
- existing extract / recovery / normalize activities.

This honours the `CLAUDE.md` mandate (generic, document-type-agnostic; no per-document-type code) — SDPR is a *template*, not engine code.

## 2. Scope boundary (MRA §2)

Two systems, one clean boundary:

- **OCR/CDW service (this pipeline):** read → profile to a case via CDW → run business-defined gates → produce a **binary** result.
- **ICM (downstream, out of scope):** consumes the success data file and applies eligibility rules. The OCR service does **not** know or implement ICM's rules.

**Outputs:**
- **Success** → structured **data file** (+ scan + attachments) handed to ICM.
- **Failure** → the **scan** routes to a CSW/EAW manual-review folder, exactly as today.

A **failure short-circuits** the remaining gates — once a form is going to a worker, further validation has no value.

**Income is pass-through, not a gate** (MRA §3.1): income values are included in the data file; the change-vs-case comparison happens **in ICM**.

## 3. Variants

Per the MRA's incremental rollout, two **library-workflow templates** are shipped:

- **Variant A — SDPR Core** (MRA "initial scope"): profile → gates → binary branch. No HITL.
- **Variant B — SDPR + HITL** (MRA "introduce once core flow is running"): inserts the HITL repair/verify step before the success/fail emit. Reuses the E09 inline editor.

## 4. Variant A — Core success/fail flow

```
source (scan; batch / upload)
 └─ extract                      neural Azure DI                         [existing: azureOcr.* / neural]
 └─ numeric-zero recovery        flip blank income cells → 0             [existing: ocr.recoverNumericZerosFromCheckboxes]
 └─ normalize fields             SIN, date, currency, name (§6)          [existing: ocr.normalizeFields — configurable]
 └─ form-type switch ─┬─ computer-generated → CDW lookup by case# + SIN
 │                    └─ handwritten        → CDW lookup by SIN + fuzzy name match
 │                       [CDW lookup = http.request ★NEW] [fuzzy name = deterministic fn]
 └─ profile / case-match         matched? spouse-on-file check (§7)      [rule/validation over CDW result]
 └─ GATE SET                     generic rule/validation node ★          [★NEW Wave-1 primitive]
 │    default gates: valid-date · signature-present · completeness(required + checkbox-valid + spouse)
 │    mode: all-must-pass, short-circuit, report-first-failure
 └─ result switch ─┬─ PASS → build data file → emit to ICM (data + scan + attachments)   [emit/export]
                   └─ FAIL → emit scan → manual-review folder (CSW/EAW)                   [emit/export]
```

**Note on "case-match" as a gate.** Case-match is *heterogeneous* from the other gates — it depends on the CDW I/O — so it is its own `http.request` + comparison step, **not** a rule inside the gate-set node. The remaining homogeneous business-rule gates collapse into the single generic `rule/validation` node. (See §8.)

## 5. Variant B — Core + HITL

Inserted between GATE SET and the success/fail emit:

```
 … GATE SET → flagged-fail  OR  carries an important non-cross-validatable field (date / income / signature)?
        ├─ yes → HITL step  [reuses E09 inline editor]
        │          • repair    — fix the failing item so the form can pass (vs routing to ICM manual review)
        │          • verify    — date / income / signature reviewed BY CATEGORY (not by confidence score,
        │                        because the read can look valid while being wrong — MRA §4, §3.1)
        │          → re-gate → PASS / FAIL
        └─ no  → PASS
```

HITL design goals (V2 §7.6): pre-populated fields, field-level focus on flagged items only, side-by-side document view, keyboard-driven. A **verified form is not fully hands-off** (it trades throughput for assurance).

## 6. Data-processing chain (V2 §7.2, §10.1, §10.4.5)

Applied after extraction, before profiling. All rules are **config on `ocr.normalizeFields`**, not new code:

| Field | Normalization (V2 §10.4.5) |
|---|---|
| **SIN** | strip dashes/dots/spaces; verify 9 digits |
| **Date** | parse multiple handwritten formats → normalized representation (e.g. `2026-Mar-16` ≡ `2026-03-16`) |
| **Currency / income** | strip currency symbols (`$200` ≡ `200`) |
| **Name** | case-insensitive; strip extra whitespace; fuzzy-match tolerance (1–2 char) |
| **Signature** | presence-only (no value comparison) |

**Numeric-zero recovery (V2 §10.1, §10.5.6):** the SDPR form's income lines carry hand-written `0` for "no income"; Azure DI sometimes mis-reads the faint `0` glyph as a selection mark and returns blank. `ocr.recoverNumericZerosFromCheckboxes` flips blank income cells back to `0` where the layout cache shows a selection mark overlapping an otherwise-empty cell. **Residual (V2 §10.5.6):** off-centre 0s, undetected-mark cells, and OCR-returned-nothing cells are *not* recovered — the last class needs a second-pass/VLM engine (Wave 2 territory; out of scope here).

## 7. Profiling & CDW match (MRA §2.1)

Match rules differ by form type (the `form-type switch`):

- **Computer-generated** (printed, carries case number): match on **case number + SIN**. Name not part of the match. Easiest — profiles trivially. *First rollout class.*
- **Handwritten**: match on **SIN + first/last name** (fuzzy, per §6).
- **Spouse** (either type): if a spouse is on the case, the spouse must also match. Client reports no spouse but spouse on file → **fail**. *Depends on CDW returning spouse-on-file; if CDW doesn't, this check moves to ICM.*
- **AKA names** (e.g. "Mike"/"Michael"): matched if CDW returns them — **TBC with business + CDW capability**.

**False-match safety (MRA §3.1):** a SIN misread either finds no case (→ review) or finds a *different* case whose name won't match (→ review). An OCR error in the SIN alone cannot produce a silent wrong-case match.

## 8. The gate set (generic `rule/validation` node)

The gate set is **the generic Wave-1 `rule/validation` node**, configured — *not* a bespoke SDPR node.

- **Mode:** all-must-pass · short-circuit on first failure · report which gate failed.
- **Default gate config** (MRA §3 "known gates", business may change without code):
  - `valid-date` — parses, not future-dated, within current reporting period, expected format *(rules business-owned)*.
  - `signature-present` — presence check.
  - `completeness` — required fields non-empty · valid checkbox configuration (no multiple selections in a mutually-exclusive group) · spouse check where applicable.
- **case-match** is evaluated upstream (§4) because it needs CDW I/O; its boolean result feeds the gate decision.
- **income** is **not** a gate (pass-through).

Changing which checks are gates = editing the node's config, so the MRA §5.1 volume estimate **re-runs rather than rebuilds**.

## 9. New primitives this pipeline forces (Wave 1)

SDPR is the demand signal; these are the generic nodes it requires:

| Primitive | Requirement derived from SDPR | Reused by |
|---|---|---|
| **`http.request`** ★ | Outbound call to **CDW** for profiling (per-form-type query params; returns case + spouse-on-file + AKA). Needs: configurable method/URL/headers, env-referenced auth (`CLAUDE.md` secrets), response → ctx, retry/timeout. | every pipeline that reaches a system of record |
| **generic `rule/validation` node** ★ | The gate set: list of rules, all-must-pass, short-circuit, report-first-failure; rule types needed — non-empty, format/regex, range, parses-as-date, in-period, mutually-exclusive-group, cross-field. | invoice (totals), lending, claims |
| **emit / export** (basic) | Two sinks: data file (+scan+attachments) → ICM; scan → manual-review folder. Initially a constrained emit; generalizes toward Wave 7 `export`. | any pipeline with an external sink |

*Not forced here:* `llm.structured` — the name fuzzy-match is **deterministic** initially (V2 used a deterministic fuzzy method). LLM-assisted matching for ambiguous reads (MRA §7.4 / V2 §7.4) is a **later enhancement**, not initial scope.

## 10. Reuse map (existing + prototyped)

| Stage | Source |
|---|---|
| extract (neural DI) | existing `azureOcr.*` / neural model; engines also prototyped in E01–E08 (#156–165) |
| numeric-zero recovery | existing `ocr.recoverNumericZerosFromCheckboxes` |
| normalize | existing `ocr.normalizeFields` (config) |
| form-type + result routing | existing `switch` + error-policy short-circuit |
| HITL inline editor (Variant B) | prototyped E09 `experiment/09-sdpr-hitl-committed` (#184) |
| dataset seeding + benchmark/eval (testing) | harness `feature/extraction-experiments` (#155) |

## 11. Configurable knobs (the "future-in-mind" surface)

All business-owned and **not yet confirmed** (MRA §5.2 placeholders). All are **config, no code**:

- **Gate set membership** + each gate's pass/fail definition *(the single biggest open input — MRA §5.2)*.
- **Date validation rules** (future-dated? in-period? format).
- **CDW match params** per form-type; whether CDW returns **spouse-on-file** and **AKA names** (determines OCR-side vs ICM-side checks).
- **Income types** ignorable for gating (no-income; possibly child support — TBC).
- **Which non-cross-validatable fields** warrant HITL verification (date/income/signature).
- **Normalization rules** per field.
- **Acceptable-risk thresholds** per field category (SDPR leadership decision — V2 §6.3/§9.5).

## 12. Error handling

- **Gate failure** → short-circuit → scan to manual-review folder (the designed "fail" path, not an exception).
- **CDW lookup failure** (no case / timeout) → treated as case-match fail → manual review. Retry/timeout via `http.request` retry policy.
- **Extraction / activity errors** → existing Temporal retry + error-policy; terminal failure routes the scan to manual review (fail-safe default — never silently drop a report).
- **Fail-safe principle (MRA §3.1):** when in doubt, route to review. The pipeline never produces a success data file it isn't confident in.

## 13. Testing

Reuses the experiment harness (#155):
- **Dataset seeding** — the SDPR 99-document benchmark sample as a seeded dataset.
- **Benchmark/eval** — run the pipeline end-to-end, score against ground truth via the existing `benchmark.*` suite (accuracy/precision/recall/F1, per-field). The pipeline doubles as a **regression fixture** (gauntlet property #3).
- **Per-node tests** for the new primitives (`http.request`, rule/validation node) per `CLAUDE.md` (create/update + run backend tests).
- **Variant A** is the primary test target; **Variant B** adds HITL-path tests once the editor is wired.

## 14. Out of scope

- ICM's eligibility rules and the success/automate determination (MRA §2.2).
- Second-pass / VLM engine for the OCR-returned-nothing residual (Wave 2).
- LLM-assisted ambiguous-name matching (MRA §7.4 — later).
- The two-stream rollout mechanics (MRA §3.2 — operational, not pipeline).
- Provider-interface extraction (Wave 2 revisit-trigger decision; SDPR's second-pass need is met by topology if required).

## 15. Open questions (business-owned — do not assume)

Per `CLAUDE.md` ("if there is a question, stop and clarify"), these block *finalizing* but not *building the configurable mechanism*:

1. The confirmed gate set + each pass/fail definition (MRA §5.2 — biggest input).
2. CDW capabilities: spouse-on-file? AKA names? (determines OCR-side vs ICM-side spouse/name checks).
3. Date validation rule specifics (in-period definition, accepted formats).
4. Which non-cross-validatable fields get HITL verification (Variant B).
5. Acceptable-risk thresholds per field.

The pipeline is built **configurable** precisely so these can be set later without a rebuild.
