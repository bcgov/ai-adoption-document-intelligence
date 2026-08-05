# SDPR Monthly Report OCR — Performance and Recommendations

**Document version:** V2

**Scope:** Benchmark and operational evaluation of Azure Document Intelligence on a 99-document SDPR Monthly Report (HR0081) sample, covering per-field accuracy, error-mode taxonomy, HITL capacity planning, and the operational recommendations that follow.

---

## How to Read This Document

> **READ THIS FIRST.** Page 1 carries the framing every subsequent section depends on. The benchmark has been run twice on the same 99-document sample, and the report compares them side-by-side. Three labels appear in every chart, table, and figure throughout §10. They are **not three different engines** — they are two engines (V1, V2), with V2 reported under two scoring views (strict and current) so the engine-only lift and the methodology lift remain separately legible.

### The three labels

- **Template Model on Azure Document Intelligence (V1).** The first-iteration engine — a custom template model trained on a small labelled dataset (9 production + 6 synthetic documents). This is the V1 baseline reported in §§1–9 and remains the floor of comparison for every chart in §10. Strengths: fast to deploy. Weaknesses: positional cues mean it's sensitive to document rotation, cropping, scan-quality variability, and stamp placement.
- **Neural Custom Model on Azure Document Intelligence — V2 strict.** The V2 engine — a neural custom model trained on 60 production high-resolution documents — **scored under the same strict equality rules V1 used.** No tolerance for format differences (capitalisation, currency symbols, SIN punctuation, date format), no recovery of OCR mis-reads. This column isolates the **engine-only lift** from V1: any improvement here is the engine doing better work, not the methodology relaxing.
- **Neural Custom Model on Azure Document Intelligence — V2 current.** The same V2 engine output, **scored under the V2 normalisation ruleset and a per-cell numeric-zero recovery pass.** The normalisation rules reflect what counts as a correct read for the downstream system (e.g. `$200` ≡ `200`, `2026-Mar-16` ≡ `2026-03-16`, presence-only signature match against ICM); the recovery pass flips income cells where the OCR mis-read a faint `0` glyph as a checkbox. This column is the **V2 headline**.

The gap between V1 and V2 strict is the engine's contribution. The gap between V2 strict and V2 current is the methodology's contribution. The two add up to the headline V1 → V2 lift.

### Document structure

- **§§1–9** are the original V1 narrative — confidence-score limitations, error classes observed on the template model, mitigation strategies, the risk-based HITL framework, and the V1 forward roadmap. **Unchanged in V2 and retained as the operational reference.**
- **§10** is the V2 continuation. It reports the V2 results across every aggregate (accuracy / precision / recall / F1 / FP-per-doc), breaks them down per-field and per-category, sizes the HITL workload at six target-recall levels, categorises residual failure modes from a manual review, surfaces a long-tail document-quality pattern (top 5% of documents drive 30% of residual errors), updates V1 recommendations with a per-category acceptable-risk ladder, and flags open business-validation questions plus the next-iteration roadmap (alternative engines, more-robust blank-zero handling, ensembles).
- **The appendix** carries full per-engine detail for both scoring views.
- **Subsequent versions** append columns to the §10 tables as additional engines are benchmarked through the same methodology — the framing in §§1–9 doesn't change.

### Version history

- **V2 (this version) — Neural Custom Model on Azure Document Intelligence + operational follow-through.** Adds §10 in full.
- **V1 — initial benchmark.** Template Model on Azure Document Intelligence on the same ~100-document sample. Covered by §§1–9.

---

## 1. Executive Summary

This report responds to the concerns raised about whether OCR can deliver acceptable accuracy on handwritten Monthly Reports without making Human-in-the-Loop (HITL) review economically and operationally unworkable. Those concerns are valid, and this report addresses them directly with evidence and a path forward.

The honest position is this:

- **No OCR engine — Azure Document Intelligence or any other — will produce 100% accuracy on handwriting.** This is a technology limitation, not a configuration gap. AI and OCR are non-deterministic prediction systems by design.
- **Confidence scores from OCR are not a reliable trigger for HITL on handwritten content.** A field can be returned with 99% confidence and still be wrong. This is well-documented across OCR systems and is a fundamental property of how the underlying models work.
- **The appropriate comparison is OCR plus HITL versus the current state**, not OCR plus HITL versus perfect automation. The current state is manual keying of every field on every report by SDPR staff. The pipeline being built is expected to be faster and lower-effort than the current manual process, even with HITL retained — but this expectation needs to be validated empirically with caseworkers on a representative batch. Introducing a new application into an existing workflow usually carries a learning curve and process adjustments that initially feel slower; the only honest way to confirm the speed claim is to measure end-to-end performance in practice, not to assert it from the OCR-side numbers alone.
- **The right architecture is layered.** OCR alone is not the product. The production pipeline combines OCR, automated validation rules, cross-field consistency checks, ICM-based cross-validation, and selective HITL on the fields that most need it. With these layers, HITL volume can be substantially reduced from a "review everything" baseline.
- **The HITL interface is being designed for speed.** The HITL component is being built specifically to optimize data entry — pre-populated with OCR output, focused on only the fields that need review, with keyboard-driven flow and side-by-side document view. The objective is that a HITL-flagged document takes meaningfully less time to verify than the same document would take to key from scratch today. Whether that objective is met in practice is again a caseworker-validation question, not one the OCR benchmark can answer.
- **Risk should be evaluated explicitly, not implicitly.** Risk is the product of error probability and error impact. The mitigations described in this report reduce probability through better models, validation, and sanity checks; HITL is reserved for high-impact fields where automated checks cannot drive probability low enough on their own. Defining acceptable residual risk is a business decision that should be made explicitly with SDPR leadership.
- **V2 results — Neural Custom Model on Azure Document Intelligence — substantially close the V1 gaps, especially on free-style handwritten content.** A custom neural model trained on 60 production high-resolution documents is now benchmarked on the same 99-document sample. Net V1 → V2 lift: **+7.6 percentage points of field accuracy** (88.8% → 96.4%), error count down 68% (829 → 267), false-positives per document down 4× (6.52 → 1.66). The improvement is concentrated where the V1 template model was structurally weakest: free-style and handwritten-text fields (`name` 63% → 96%, `freeform_text` 63% → 99%, `signature` 55% → 91%, `date` 77% → 93%, `case_id` 69% → 91%, `phone` 74% → 90%, `sin` 77% → 89%). The Neural Custom Model's advantage on free-style text is the clearest signal in the V2 data — it removes the rotation / scan-quality / stamp-placement sensitivities that drove the V1 template-model failures on those categories.
- **Where V2 still has work to do is in income amounts and document quality.** Income (35 fields per form) was nearly flat on the engine alone — the lift to 95.7% accuracy came primarily from a per-cell numeric-zero recovery rule that handles the "OCR mis-reads a faint 0 as a checkbox" pattern. Eighty-two cells across the corpus still arrive as confidently-blank income predictions; confidence-gated HITL cannot reach them. Separately, residual errors are heavily concentrated on a small number of poorly-scanned or physically damaged documents — the top 5% of documents drive 30% of all errors. Intake-time document-quality gating has more leverage on residual error rate than any further engine improvement available today.
- **The forward path is a hybrid model architecture, with continued experimentation on the frontier AI ecosystem.** The frontier of document AI is moving rapidly: vision-language models (VLMs) paired with traditional OCR can read what supervised neural models miss; managed two-stage services (e.g. Microsoft Content Understanding) and open-source / commercial alternatives (Mistral, GPT-4o, GPT-5.x family) are improving on a near-monthly cadence. The right strategy is to **continue investing in a hybrid pipeline** — OCR + downstream LLM cleanup, with the option to layer specialist engines per category as an ensemble — rather than committing to a single engine. The V2 numbers establish a clear baseline against which alternative engines can be benchmarked through the same methodology; cross-engine evaluations are already in progress in parallel.
- **V2 is materially better than V1 but not yet a production cut-over decision.** The V2 Neural Custom Model is the strongest single supervised engine evaluated to date on this workload and should be the working baseline for any further engine bake-off. Production cut-over additionally depends on (a) caseworker validation of the end-to-end workflow speed, (b) explicit SDPR-leadership choice of the per-category HITL operating point, (c) intake-time document-quality controls, and (d) the cross-engine evaluation conclusions on whether to layer a VLM-based pipeline or an ensemble on top of the neural model. Each of these is a separable workstream, sized in §10.

This document explains why confidence alone cannot guide HITL on handwriting, what error classes were observed, what mitigates each, and what the path looks like over the next iterations.

---

## 2. Context and Purpose

### 2.1 What this report covers

- The mechanics and limitations of OCR confidence scoring on handwritten content.
- A field-by-field characterization of the error classes observed in the V1 benchmark.
- Mitigation strategies, organized by field and by cross-cutting theme.
- A roadmap for subsequent iterations, including neural model results and evaluation of alternative OCR engines.

### 2.2 What this report does not cover

- Specific PII or document samples illustrating errors. Examples are maintained in a separate, access-controlled companion document so that this report can be circulated without exposing case-level data.
- Detailed integration design with ICM, which is being handled separately by the Deloitte team.
- Final selection of an OCR engine. This is a first-pass evaluation and the engine selection will be revisited as additional candidates are benchmarked.

### 2.3 The question this report is intended to answer

> "Can OCR meet our needs without putting every report through Human-in-the-Loop, and if not, is the resulting process still better than what we do today?"

The short answer is: **partial reliance on OCR alone is not viable; layered automation with selective HITL is viable; the resulting workflow is expected to be faster than current manual processing, but the speed claim itself requires empirical validation with caseworkers before being treated as established.** The remainder of this document substantiates the accuracy and HITL-sizing side of that answer; the end-to-end workflow speed is flagged as a separate validation step (V1 §9.3, §10.8.5).

---

## 3. Understanding the Confidence Score Limitation

Before discussing benchmark results, it is important to set expectations about what confidence scores from OCR systems actually mean — particularly for handwriting. This has direct implications for how HITL is designed.

### 3.1 How confidence scores are produced

Azure Document Intelligence (and OCR engines in general) produces confidence scores at multiple layers — character level, word level, and field level. These scores represent how strongly the visual features of the input match patterns the model learned during training. The score is essentially answering the question: *"How closely does this look like a character I've seen before?"*

It is **not** answering: *"Have I read this correctly?"*

For most users, those two questions feel like they should produce the same answer. For printed text, they roughly do. For handwriting, they often do not.

### 3.2 Why this works well on printed text

Printed text is highly consistent — every "A" in a given font looks essentially identical. The model recognizes the character pattern strongly, reports high confidence, and is almost always right. Confidence and accuracy track together. Reported industry accuracy on printed text is in the 95–99% range, and confidence thresholds are a meaningful tool for routing decisions.

### 3.3 Why this breaks down on handwriting

Handwriting is variable in ways that OCR confidence scores are not designed to express. A handwritten "7" with a strong horizontal stroke may look — to the model's feature detectors — exactly like a "1." The model matches it strongly to "1," reports 99% confidence, and is wrong. The model has no mechanism to know it is wrong, because the visual input genuinely activated the wrong character's features with high strength.

This is a known and studied property of deep-learning OCR systems. Research has documented that these models are systematically *overconfident* on handwriting — meaning the confidence reported is, on average, higher than the actual likelihood of being correct. It is not a bug in Azure; it is a property of the underlying technology that applies to all major OCR engines, including Mistral, AWS Textract, and others.

### 3.4 The practical implication

A field with a 99% confidence score on a printed value is reliable. A field with a 99% confidence score on a handwritten value is *probably* correct, but the score itself does not tell you which 99%-confident reads are wrong. This means:

- **Confidence thresholds alone are not a sufficient HITL trigger for handwritten fields.**
- **The strategies that work are layered checks — format validation, sanity ranges, cross-field consistency, and selective mandatory HITL on high-impact fields — not threshold tuning.**
- **The most consequential failure mode is "confidently wrong" — for example, a handwritten "$200.00" being read as "$20,000" with high confidence.** This cannot be caught by the OCR engine itself. It can be caught by sanity rules ("is this income value within plausible bounds?") or by mandatory HITL on the relevant field.

This shapes the rest of the recommendations in this report: rather than treating OCR as a probabilistic black box that we tune via thresholds, we treat it as one component in a pipeline where its outputs are corroborated by other signals.

---

## 4. Benchmark Methodology

### 4.1 What was tested

- **Engine:** Azure Document Intelligence
- **Model type:** Custom template (extraction) model
- **Sample size:** Approximately 100 production HR0081 Monthly Report documents
- **Training data for the template model:** 9 production documents + 6 synthetic documents

The template model relies on positional cues — it looks for fields at approximate locations established during training. This makes it sensitive to deviations from the training set: rotation, cropping differences, scan quality variability, and unexpected stamp placement.

### 4.2 Why the template model was used for V1

The template model was the fastest path to a working baseline. It is not the intended production model. The neural model — which uses learned visual features rather than fixed positional cues — has been implemented on Document Intelligence and is currently undergoing data labeling, with results expected in approximately 1–2 weeks. The template model results are best understood as a **floor**, not a representative measure of what the system can achieve.

### 4.3 Caveats on the V1 numbers

A meaningful portion of the errors counted in the appendix are not true OCR errors. They are artifacts of output not yet being normalized. Specifically:

- **Capitalization mismatches** between OCR output and ground truth are currently counted as errors.
- **SIN format mismatches** (e.g. dashes vs. dots vs. spaces) are counted as errors even when the digits are correct.
- **Date format variability** (handwritten dates appear in many formats; ground truth was normalized but OCR output was not) accounts for most date-field errors.

V2 will apply consistent normalization and report a cleaner picture.

---

## 5. Observations by Field

The detailed numeric results are in the appendix. This section describes the **classes of error** observed, what causes each class, and what mitigates them.

### 5.1 Name field

Two distinct error classes were observed:

- **Extraction failures** — the OCR returns adjacent text rather than the name. Driven by document rotation and scan quality issues, which displace the field from where the template model expects it.
- **Transcription typos** — the field is correctly located but the handwriting is misread.

Extraction failures are expected to drop substantially with the neural model, which does not depend on fixed positional cues. Transcription typos are harder to eliminate at the OCR layer alone, but they do not have to be eliminated there — they can be recovered through cross-validation with ICM (see §6.1).

### 5.2 SIN field

The error pattern is similar to the name field, with the additional issue of digit confusion — most commonly 1 ↔ 7. Mitigations available:

- **Format validation** — a SIN must be 9 digits; anything else is automatically flagged.
- **Normalization** — strip dashes, dots, and spaces before comparison.
- **Digit-variant retry** — for SINs that don't resolve in ICM, try plausible single-digit substitutions (e.g. 1↔7) and check for a valid match.
- **Cross-validation with ICM** — the SIN/Name pair self-validates (see §6.1).

### 5.3 Spouse Name

The dominant error class here is **phantom extraction** — content being returned for the spouse name field when the field is actually blank. The most common source is a date stamp or other office stamp overlaying the area where the name would appear, which the template model interprets as form content.

Mitigations:

- Process change: **avoid stamping over blank form fields** during intake. This is the most direct fix and the lowest cost.
- The neural model with broader training data is expected to better distinguish between handwritten content and stamp artifacts.

### 5.4 Case ID

Same class of issue as Spouse Name — extra text returned when the field is blank, or when handwritten Case ID is placed outside the area where the printed Case ID typically appears. Mitigations:

- Process guidance: **when the Case ID is written by hand, it should be placed in the same area where the printed Case ID normally appears.** This aligns with where the template model expects to find it.
- Improved model training (neural model with a larger and more representative dataset).

### 5.5 Income fields

This is the most consequential field category — errors here have direct downstream impact on case decisions and benefit calculations. Three distinct error classes were observed:

- **Zero detection failures.** Large handwritten zeros are sometimes misread by the OCR as checkboxes rather than as characters, and the value is then reported as missing in the data. Smaller or normally-sized handwritten zeros, when read as characters, are sometimes misread as other digits (8, 2) or letters (a). Partial mitigations exist (e.g. checking unchecked-checkbox heuristics, "rounding" implausibly small single-digit reads to zero), but none is fully reliable. Alternative engines with stronger contextual understanding (Mistral Document AI, Azure Content Understanding) are expected to handle this case better and will be evaluated in subsequent iterations.
- **Decimal placement errors.** The decimal separator is a small mark and is sometimes missed. This is the failure mode most likely to produce a "confidently wrong" result — e.g. reading "$200.00" as "$20,000." It is also the failure mode least likely to be caught by confidence scoring.
- **Visual confusion on individual digits**, similar to the SIN field.

Recommended approach for income fields specifically:

- **Mandatory HITL on all non-zero declared income values, regardless of confidence score.** This is the only reliable way to prevent confidently-wrong income values from propagating downstream.
- **Automated sanity checks** for implausibly high or low values (configurable thresholds), which can flag potential errors that pass through the OCR with high confidence.
- **High-resolution grayscale scanning** at the source, which materially reduces decimal-placement and digit-confusion errors.

### 5.6 Checkboxes

Checkbox detection performs well in the large majority of cases. Two edge failure modes were observed:

- **Long check marks** that overflow into adjacent boxes and cause those boxes to also be read as checked.
- **Cross-outs** (often in the spouse section, when there is no spouse) being interpreted as checked boxes.

Mitigations:

- **Group-level validation logic** — for mutually exclusive options, flag any case where multiple are detected as checked.
- **Conditional logic** — ignore spouse-section checkboxes when no other spouse information is present elsewhere on the form.

### 5.7 Dates

The majority of errors flagged in V1 are normalization artifacts rather than real misreads. Handwritten dates appear in a wide variety of formats; the ground truth was normalized to a single format but the OCR output was not. V2 will apply consistent date parsing and the error rate is expected to drop significantly. Real OCR errors on dates do exist but are a smaller share than the V1 numbers suggest.

---

## 6. A Risk-Based Framework for HITL Decisions

Before discussing specific mitigations, it is useful to establish how to reason about HITL decisions in general. The wrong question is *"can we make the OCR perfect?"* — the answer is no, and that framing leads to a binary accept/reject decision. The right question is *"what level of risk is acceptable, and what does it take to get there?"*

### 6.1 Risk as probability times impact

Risk in this context is the product of two factors:

- **Probability** — how likely an OCR error is to occur on a given field.
- **Impact** — what happens if that error propagates downstream undetected (financial impact on the client, compliance issue, audit exposure, downstream rework).

A high-probability error on a low-impact field (e.g. a date format mismatch that gets normalized later) is low risk. A low-probability error on a high-impact field (e.g. a misread income value with high confidence) can still be high risk if the impact is severe enough.

This framing has direct implications for where HITL is applied:

- HITL is most valuable on **high-impact fields** where the cost of an undetected error is significant (notably non-zero income values).
- HITL is less critical on **fields where errors are self-correcting** through downstream validation (notably the SIN/Name pair, which validates against ICM).
- HITL on low-impact, easily-validated fields is a poor use of staff time and adds overhead without meaningful risk reduction.

### 6.2 Reducing risk by reducing probability

The mitigation strategies in the following section work by reducing the **probability** side of the risk equation. Improvements that reduce error probability — better models, format validation, sanity checks, source-side quality improvements — directly reduce risk without requiring more human review.

The practical implication is that the question facing this project is not *"HITL or no HITL?"* It is *"what combination of automated quality improvements and targeted HITL gets us to an acceptable level of residual risk, at acceptable cost?"*

### 6.3 Defining acceptable risk

Acceptable risk is a business decision, not a technical one. It depends on:

- The cost of an undetected error (financial, reputational, regulatory).
- The cost of avoiding that error (HITL effort, software investment).
- The volume of documents being processed and the rate at which residual errors would be expected to appear.

An explicit acceptable-risk threshold for each field category — particularly income — would help calibrate where HITL is mandatory, where it is conditional, and where it can be deferred to downstream sampling and audit. This is a conversation to have with SDPR leadership and is best informed by the V2 benchmark numbers from the neural model, which will give a more representative baseline of achievable error rates.

---

## 7. Mitigation Strategies (Cross-Cutting)

This section pulls together the strategies that span multiple fields, so they can be evaluated as a system rather than field by field. Each strategy in this section is a tool for reducing the probability side of the risk equation described in Section 6.

### 7.1 Cross-validation through ICM (key insight)

Errors on the SIN and Name fields are **less critical than they initially appear** because the SIN/Name pair self-validates against ICM data. The processing flow is:

1. OCR extracts a SIN.
2. The system queries ICM for the case associated with that SIN.
3. The system compares the OCR-extracted name to the name on the returned case.

This produces three possible outcomes:

- **Match** — the case is found and the names agree. The document proceeds.
- **No case found** — the SIN was misread badly enough that no case exists. The document is routed to HITL or to the unprofiled queue.
- **Case found, name mismatch** — the SIN was misread to a *different* valid SIN. The name comparison catches this and routes the document to HITL.

The system fails safely. SIN and Name errors do not propagate silently into ICM, because each validates the other. This significantly reduces the criticality of HITL on those fields.

### 7.2 Format validation and normalization

Many "errors" that look like OCR failures are recoverable through automated post-processing:

- SIN: strip non-numeric characters, verify 9 digits, attempt digit-variant resolution if no case is found.
- Dates: parse multiple formats into a normalized representation before comparison.
- Names: case-insensitive comparison, strip extra whitespace.

This layer is cheap to build and resolves a meaningful share of apparent errors before any human is involved.

### 7.3 Sanity checks and business rules

For numeric and structured fields, automated rules can catch a class of errors that confidence scoring cannot:

- Income values outside plausible ranges flagged for review.
- Mutually exclusive checkbox groups validated for consistency.
- Required fields validated for non-emptiness.
- Cross-field consistency (e.g. if a section indicates "no change," income values should align with that).

These rules act as a safety net underneath the OCR output and catch some of the most consequential failure modes.

### 7.4 AI-assisted matching for ambiguous reads

For fields where the OCR output is close but not exact (e.g. "Tob Tabiene" instead of "Bob Tabine"), an LLM can be used to assess plausibility — given the candidate read and the candidate name on the case, are these likely the same name with OCR noise? This approach is promising for the name field specifically and would be validated in a future iteration before being trusted in production.

### 7.5 Source-side quality improvements

Several error classes are partially or fully addressable by changes at the scanning and form-filling stage, rather than at the OCR stage. Where these can be implemented, they are higher-leverage than software changes:

- **Scan documents at high resolution, in grayscale.** This reduces digit recognition errors, including decimal detection. Document orientation is less critical with the upcoming neural model, which is tolerant of rotation.
- **Avoid placing date or office stamps over blank form fields.** This is the dominant source of phantom extractions on the spouse name field.
- **When Case ID is written by hand, place it in the same area where the printed Case ID normally appears.** This aligns with template-model expectations and reduces phantom extractions.

These items are low-cost and would be communicated to scanning and intake staff as part of operational guidance.

### 7.6 Tiered HITL strategy

Rather than HITL on everything or HITL on nothing, the recommended strategy is a tiered approach driven by field criticality (impact) and validation outcomes (probability):

- **Auto-process** — fields where the OCR result is corroborated by automated validation (format checks, ICM cross-validation, sanity rules pass).
- **Mandatory HITL** — high-impact fields that cannot be reliably validated automatically. **Non-zero income values** are the clearest candidate, given the "confidently wrong" failure mode at the decimal level.
- **HITL on validation failure** — anything flagged by format checks, sanity rules, or ICM lookup discrepancies.

This is the structure that allows HITL to be **a portion of the workload, not a duplicate of it**.

The HITL component is being designed specifically to minimize time per document. Key design principles include: pre-population of all OCR-extracted values so the reviewer is verifying rather than re-typing; field-level focus that brings only flagged fields to the reviewer's attention rather than requiring full-document re-entry; side-by-side display of the source document and the extracted data so the reviewer can confirm or correct in a single visual context; and keyboard-driven flow to eliminate mouse navigation overhead. The goal is that the per-report time for a HITL verification is materially lower than the per-report time for current manual keying — turning HITL into a productivity gain rather than a cost.

### 7.7 Engine and model improvements

Two changes are in the immediate roadmap and are expected to materially shift baseline accuracy:

- **Neural model on Azure Document Intelligence** (replacing the template model). Implemented; data labeling underway; results expected in 1–2 weeks. Expected to substantially reduce extraction failures driven by rotation and positional variability, and to reduce phantom extractions.
- **Evaluation of alternative engines** — Mistral Document AI, Azure Content Understanding, and Nemotron Parse. These are expected to perform better on contextual reads (zeros, decimals, ambiguous handwriting) due to architectural differences.

---

## 8. Addressing the Concerns Raised

This section directly addresses the specific concerns expressed during recent discussions.

### 8.1 On the cost and feasibility of universal HITL

This is correct, and a HITL-on-everything outcome would not be the right answer. The recommended pipeline is not HITL-on-everything. It is:

- Auto-processing for fields and documents that pass automated validation (a substantial share of the volume).
- Targeted HITL on high-impact fields (notably non-zero income values) regardless of confidence.
- HITL on documents where automated validation flags inconsistencies.

The HITL volume under this design is meaningfully lower than 100%. The exact rate will be measurable once the neural model is benchmarked against the same dataset, and ultimately validated when an actual caseworker tests the workflow end-to-end.

### 8.2 On whether to reject the solution if handwriting recognition is imperfect

The framing is correct that no OCR engine, including Azure, will deliver near-perfect handwriting recognition without supporting infrastructure. The framing is incomplete in that **the supporting infrastructure exists and is part of the proposed solution**: validation rules, cross-checks against ICM, sanity checks, tiered HITL. The pipeline should be evaluated as a whole, not on the OCR component alone.

It is also worth noting that any alternative — including outsourced processing through BC Mail Plus — uses fundamentally the same architecture (scan, extract, validate, human review). The cost does not disappear in alternative approaches; it shifts location. The opportunity cost of outsourcing is the loss of an internal AI capability that can be reused across other ministry document processing needs.

### 8.3 On whether the work is being shifted rather than reduced

This is the correct question to ask, and the answer depends on the comparison baseline.

- **Today:** every paper monthly report (~35,000 per month, with a backlog of approximately 10,000–15,000 unprocessed reports) is manually keyed end-to-end by SDPR staff. The current per-report processing time is approximately 15 minutes.
- **Target state:** OCR + automated validation handles the bulk of the read; HITL is a *verification* step on flagged items rather than a *transcription* step. The HITL interface is being purpose-built to optimize this verification — pre-populated fields, focused review on flagged items only, keyboard-driven entry, and side-by-side document context. The cognitive and time cost of confirming or correcting an extracted value in a purpose-built interface is materially lower than the cost of reading and keying the same field from scratch in the current process.

The work is being transformed, not merely shifted. The right success metrics are reduction in total processing time per report, reduction in the backlog, and reduction in fully-manual touch time per report — not "elimination of human involvement," which is neither achievable nor desirable in a government context.

### 8.4 On the role of human oversight in government processes

This is correct, and the proposed system is not designed for full automation. HITL is an intentional component of responsible AI deployment in this context. The objective is to *reduce* the volume of human work, not to remove the human from the process.

---

## 9. Recommendations and Path Forward

### 9.1 Continue current development trajectory

- Complete neural model training and benchmark against the same 100-document sample. Compare results to the template model baseline in this report.
- Evaluate Mistral Document AI, Azure Content Understanding, and Nemotron Parse against the same sample. Document strengths and weaknesses by field type.
- Build out the supporting layers: format validation, ICM cross-validation logic, sanity rules, tiered HITL routing.
- Continue development of the HITL interface with data-entry optimization as the primary design goal — pre-population, field-level focus, keyboard flow, and side-by-side document view — so that HITL time per report is materially lower than current manual keying time per report.

### 9.2 Operational improvements (low-cost, high-leverage)

- Establish scanning standards: high resolution, grayscale.
- Communicate guidance to intake staff: do not stamp over blank form fields; write handwritten Case IDs in the printed Case ID area where possible.
- Build a curated dataset of high-quality scans and benchmark separately, to isolate OCR performance from scan quality issues.

### 9.3 Validate the end-to-end workflow with real users

- Once the neural model is benchmarked, run an end-to-end workflow test with an actual caseworker performing HITL verification on a realistic batch.
- Measure: per-report processing time, HITL time per report, error rate on auto-processed reports (sampled).
- Compare against current manual processing time to produce a defensible efficiency comparison.

### 9.4 Treat success metrics as a portfolio

Rather than a single metric (e.g. "% HITL rate"), evaluate the system on:

- Total per-report processing time vs. current state.
- Manual touch-time per report vs. current state.
- Auto-process rate (no HITL needed).
- Error rate on auto-processed reports (caught downstream).
- Staff capacity freed up for higher-value work.

### 9.5 Define an acceptable-risk threshold

Per the framework in Section 6, work with SDPR leadership to define an explicit acceptable-risk threshold for each field category — particularly income. This calibrates where HITL is mandatory, where it is conditional, and where automated processing is sufficient. This conversation is best held once V2 numbers are available, so the discussion is grounded in achievable rather than estimated error rates.

### 9.6 Subsequent iterations of this report

This is V1. Subsequent versions will append:

- **V2:** Same benchmark methodology with normalization applied; results from neural model.
- **V3:** Comparative results from Mistral Document AI, Content Understanding, and Nemotron Parse.
- **V4+:** End-to-end workflow timing data once available.

---

---

## 10. V2 update — Neural-model results

V1 committed to re-benchmarking the trained neural model against the same 99-document sample, and to applying the V1 §4.3 normalisation pass that the V1 numbers had not yet incorporated (§4.2, §9.6). This section reports the V2 results and the methodology changes that came with them. §§1–9 remain the operational reference; this section adds the V2 evidence and the updates it implies.

Two scoring views appear side-by-side in the tables and plots throughout this section. They evaluate the **same neural-model predictions**; the difference is the scoring methodology applied on top:

- **Neural Custom Model on Azure Document Intelligence — V2 strict.** The raw V2 neural-model output, scored with the same strict-equality rules V1 used. No tolerance for format differences (capitalisation, currency symbols, SIN punctuation, date format), no recovery of OCR mis-reads. This column isolates the **engine-only contribution** from the Template Model (V1) baseline.
- **Neural Custom Model on Azure Document Intelligence — V2 current.** The same V2 neural-model output, scored with the V2 normalisation ruleset (V1 §4.3 follow-through, documented in §10.4.5) and the per-cell numeric-zero recovery pass (§10.1). This is the V2 headline.

Keeping both columns visible makes the engine-only lift (template → strict) and the methodology lift (strict → current) separately legible.

### 10.1 What changed since V1

Three things changed between V1 and V2, in order of contribution to the headline accuracy improvement:

- **Engine swap.** V1 used a custom **template** model (positional cues from a small labelled training set: 9 production + 6 synthetic documents). V2 uses a trained **neural** custom model on Azure Document Intelligence, labelled and trained on **60 production high-resolution documents**. The neural family was chosen specifically because of the variability the production corpus showed in document angle, crop, scan quality, and stamp placement — variability the template model's fixed positional cues could not absorb. Neural models infer field positions from learned visual features rather than a fixed layout, so the same model generalises across rotated, cropped, and quality-variable scans. This delivers the engine-only improvement: V1 §5.1 / §5.3 / §5.4 / §5.7 predicted large gains for the name, signature, date, SIN, phone, case_id, and free-text fields — exactly the fields whose dominant V1 failure modes were rotation sensitivity, scan-quality variability, and stamps overlapping blank form areas. The per-field results in §10.4 confirm the prediction.
- **Normalisation pass (V1 §4.3 follow-through).** V1 reported strict-equality scoring and explicitly flagged that capitalisation, SIN punctuation, currency-symbol formatting, and date-format variants were being counted as errors. V2 applies a documented ruleset to relax those equivalences operationally — see §10.4.5 for the per-category policy. The ruleset reflects what counts as a correct read for the downstream system (notably ICM cross-validation per V1 §7.1), not just exact-text equality.
- **Per-cell numeric-zero recovery.** A separate post-process flips income-amount cells where the OCR returned no value but the layout cache shows a selection mark inside the cell (the "checkbox-as-zero" pattern). The income lines on the SDPR form have a "no income for this category" indicator that Azure DI sometimes reads as a selection mark instead of a zero; the recovery step maps those back to 0 where the layout evidence supports it.

The dataset, sample count, schema, and scoring methodology are identical to V1.

### 10.1.5 How accuracy, precision, recall, and F1 are computed

Every per-field comparison falls into one of four buckets:

| case | correct value (GT) | engine prediction | classification |
|---|---|---|---|
| match | value | matches GT | **TP** (true positive) |
| deletion | value | null / missing | **FN only** (false negative — the correct value did not appear in the output) |
| insertion | null | non-null | **FP only** (false positive — engine produced a value where there was none) |
| substitution | value | non-null, wrong | **FP + FN** (the engine BOTH produced a wrong value AND missed the correct one) |

The derived metrics are then:

- **Accuracy** = TP / total evaluated fields. *"Of all the fields on the form, what fraction was read correctly?"* This is the headline number for "how often does this engine get it right".
- **Precision** = TP / (TP + FP). *"Of the answers the engine gave, what fraction was correct?"* Low precision means the engine produces wrong or hallucinated values.
- **Recall** = TP / (TP + FN). *"Of the values that were actually on the form, what fraction did the engine read?"* Low recall means the engine misses fields or returns blank when it shouldn't.
- **F1** = 2·Precision·Recall / (Precision + Recall). The harmonic mean of precision and recall, designed to drop sharply if either input is weak. F1 is the single-number summary that punishes lopsided systems — an engine with high precision but low recall (or vice versa) gets a worse F1 than an engine that balances both.

A substitution is counted as **both** an FP and an FN because it's two errors in one place: a wrong value was produced *and* the correct value was missed. This matches the standard OCR / information-extraction formulation.

> **Methodology note on the F1 formula.** Earlier iterations of this work used a non-standard F1 in which substitutions were counted only as FN (precision pinned at ≈1.000, F1 mathematically equivalent to smoothed recall). All numbers in this report use the standard formulation above — precision now reflects wrong-value substitutions, F1 now punishes lopsided performance — and the production backend evaluator has not yet been switched over to the standard formulation (the in-report numbers are recomputed from per-field error counts by a local analysis script, so they are not affected by which version is live in production).

### 10.2 Headline aggregate metrics

![Aggregate metrics by engine](plots/01-aggregate-metrics.png)

> All four chart metrics are computed in aggregate across all 7,425 field predictions (each prediction weighted equally, not averaged per-document). The table below the chart adds one operational row that doesn't appear in the plot: **average false-positives per document** (the count of wrong-value substitutions plus values produced for genuinely blank cells, divided by 99 documents).

| Metric | Template Model (V1) | Neural Custom Model (V2 strict) | **Neural Custom Model (V2 current)** |
|---|---:|---:|---:|
| Accuracy | 88.8% | 91.6% | **96.4%** |
| Precision | 91.1% | 94.5% | **97.8%** |
| Recall | 91.8% | 92.2% | **97.0%** |
| F1 | 0.915 | 0.933 | **0.974** |
| Avg false-positives per document | 6.52 | 4.02 | **1.66** |

Reading the table:

- **+2.8 pp accuracy lift from the engine swap** (template → neural strict) and **+4.8 pp accuracy lift from normalisation + recovery** (neural strict → current). Net V1 → V2: +7.6 pp accuracy, error count cut by 68% (829 → 267).
- The two contributions are independent and additive — the engine swap reduces a different class of errors (positional failures, phantom extractions) than normalisation+recovery (format-variant scoring, missing-zero recovery on income cells).
- Avg false-positives per document drops 4× (6.52 → 1.66). This is the most operationally relevant single metric for HITL load: each false positive is a prediction a reviewer must inspect.

### 10.3 Error-class breakdown

![Error class breakdown](plots/02-error-class-breakdown.png)

| Class | Template Model (V1) | Neural Custom Model (V2 strict) | **Neural Custom Model (V2 current)** | Δ V1→current |
|---|---:|---:|---:|---:|
| missing (extraction failure) | 184 | 225 | **103** | **−44%** |
| extra (phantom / hallucinated) | 243 | 46 | 46 | **−81%** |
| wrong (value mismatch) | 402 | 352 | **118** | **−71%** |
| **Total errors** | **829** | **623** | **267** | **−68%** |

Reading the breakdown:

- **Phantom-extraction collapse** (the V1 §5.3 hypothesis) is the engine-only contribution: template's 243 extras drop to 46 with neural strict and stay there under normalisation/recovery. Confirmed.
- **Missing errors initially rose** under neural strict (225 vs. template 184) — a +41 increase that breaks into three distinct contributions:
  - About **19 cells** moved from a `wrong` error in V1 to a `missing` error in V2 strict. The neural model declined to commit a value where the template guessed and got it wrong. This is a defensible trade-off — a `missing` is safer to recover downstream than a confidently-wrong value.
  - About **20 cells** were correctly matched in V1 and are now `missing` in V2 strict. A manual review of these cells (§10.6) found that ~10 are *ground-truth errors* — the engine returned the correct value but the GT itself was wrong; the remaining ~10 are genuine engine regressions on specific handwriting characteristics that the template happened to extract through positional luck. The genuine-regression count is therefore closer to ~10 than the raw 20.
  - The recovery pass then catches the income-cell missings (where the model returned null but the layout shows a selection mark): 225 → 103.
- **Wrong errors drop in both steps** — engine swap reduces value-level mis-reads modestly (402 → 352); normalisation handles the rest (352 → 118). The remaining wrongs are real engine mis-reads, not format quirks.

### 10.4 Per-field comparison

![Per-field error rates — fields × engines](plots/04-per-field-heatmap.png)

![Per-category accuracy](plots/03-per-category-accuracy.png)

| Category | n fields | Template Model (V1) | Neural Custom Model (V2 strict) | **Neural Custom Model (V2 current)** | Δ V1→current |
|---|---:|---:|---:|---:|---:|
| `name` | 2 | 0.63 | 0.81 | **0.96** | +0.33 |
| `freeform_text` | 1 | 0.63 | 0.75 | **0.99** | +0.36 |
| `signature` | 2 | 0.55 | 0.85 | **0.91** | +0.36 |
| `date` | 2 | 0.77 | 0.90 | **0.93** | +0.16 |
| `case_id` | 1 | 0.69 | 0.91 | **0.91** | +0.22 |
| `sin` | 2 | 0.77 | 0.86 | **0.89** | +0.12 |
| `phone` | 2 | 0.74 | 0.88 | **0.90** | +0.16 |
| `income_amounts` | 35 | 0.878 | 0.879 | **0.957** | +0.08 |
| `checkboxes` | 28 | 0.988 | 0.989 | **0.991** | flat |

Three patterns:

- **Name, free-text, signature, date, case_id, SIN, and phone fields** see most of their gains from the engine swap, with normalisation closing the rest. The neural strict column already shows large lifts on these categories; the current column adds the fuzzy-match policy on names and free-form text, and the presence-only policy on signatures (§10.4.5).
- **Income amounts** are the methodology story: nearly flat under neural strict (0.878 → 0.879 — the engine doesn't address the core failure modes here), then a major lift to 0.957 under normalisation+recovery. The numeric-zero recovery is the bigger contributor — it flips back ~120 income-cell missings (where the model returned blank and the layout cache shows a selection mark in the cell) that no confidence-gated review could have caught.
- **Checkboxes** are essentially saturated under both engines (~99%); normalisation contributes little here. Group-consistency rules per V1 §5.6 remain the primary safety net for the residual checkbox failures.

#### 10.4.5 Scoring methodology — what's normalised, what isn't, and why

The V2 ruleset reflects what counts as a correct read for the downstream system, not strict text equality. Every rule below is applied automatically during scoring; an audit trail of every flipped error is kept alongside the benchmark export.

| Category | What's relaxed in scoring | Policy reasoning |
|---|---|---|
| `sin`, `phone` (and `spouse_*` variants) | Punctuation in identifier strings is ignored (e.g. `999-888-777` equivalent to `999888777`). | These are structured identifiers; exact digits are required for ICM lookups. Punctuation is presentation-only. |
| `date`, `spouse_date` | Same calendar date in different formats counts as match (`2026-Mar-16` ≡ `2026-03-16`). Month/day transposition on otherwise-valid ISO dates is also accepted. | **Provisional.** The downstream ICM purpose for `date` is undetermined. Once the field's role is defined (e.g. cutoff date vs. submission date vs. coverage period), the scoring policy will be revisited and likely tightened. |
| `signature`, `spouse_signature` | Any non-empty pair counts as a match — the literal characters are not compared. | SDPR only needs to confirm a signature was made; the actual content is not validated downstream. Missing/extra cases (one side blank) remain real errors. |
| `name`, `spouse_name` | Case, whitespace, trailing punctuation, and hyphen spacing differences are ignored. Plus a fuzzy match: close-enough strings (small edit distance or high similarity ratio) count as a match. | Identity is validated by **ICM lookup** (per V1 §7.1) — the name returned by ICM against a SIN (or case_id, if used as the lookup key) is the source of truth; the OCR'd name only needs to be close enough to recognise. Fuzzy matching is operationally appropriate; literal equality is not. |
| `explain_changes` (freeform) | Whitespace / case / trailing-punctuation differences ignored. Plus a fuzzy match allowing minor OCR drift in long strings. | Free-form OCR drift is acceptable. Residual minor differences will be cleaned by **downstream LLM post-processing**. The fuzzy threshold is deliberately permissive; cleanup is a separate layer. |
| `case_id` | Whitespace and case differences ignored. | Alphanumeric identifier; presentation-only formatting is not part of the underlying value. If used as the ICM lookup key (an alternative to SIN), the case_id value itself unlocks the case record; mismatches are caught when the lookup fails to resolve. |
| Income (`applicant_*` / `spouse_*` numeric) | Currency symbol (`$`), commas, internal whitespace, and number-vs-string-of-digits differences ignored. Single-character predictions on cells where the expected value is `0` are accepted as `0` (captures OCR mis-reads of faint `0` glyphs as stray letters or digits). Additionally, a per-cell numeric-zero recovery pass flips cells where the OCR returned blank but the form layout shows a selection-mark inside the cell, treating it as a 0. | The form's income lines have a "no income for this category" indicator that Azure DI sometimes reads as a selection mark instead of a zero. Recovery captures this SDPR-specific signal so a confidently-blank read of a zero-income cell is scored correctly. **Assumption — single-digit income as 0.** The single-character-prediction rule above treats every single-character income prediction (any letter, single digit 0–9, single symbol) as `0`. This is a deliberate trade-off: the vast majority of income cells on this form are 0, and the cells where a single character was predicted overwhelmingly correspond to faint or off-centre 0 glyphs the OCR mis-read. The assumption removes a large class of errors at the cost of one specific scenario — a legitimate single-digit income (e.g. `$9`) would be silently treated as `0`. If the business needs to read genuine single-digit income amounts as written, the rule needs to be revisited; that's a separate conversation about whether single-digit income is meaningful on this form. |
| `checkbox_*` | Tag-style and plain-string forms of the same state are equivalent (e.g. `:selected:` ≡ `selected`). | Bridges the backend's tag-style ground-truth values against the engine's plain-string output. The underlying state (selected vs. unselected) still has to match. |


### 10.5 HITL planning (scoped to high-impact fields)

This section sizes the confidence-gated HITL workload at multiple recall targets. **Scope:** `income_amounts` (35 fields) and `sin` (2 fields). These are the two field categories where mis-reads have direct downstream cost — income drives benefit calculations, SIN gates ICM lookups.

All other categories (`signature`, `name`, `case_id`, `phone`, `freeform_text`, `checkboxes`, `date`) are validated through non-confidence safety layers — see §10.5.5.

**The HITL strategy modelled.** The reviewer is shown every prediction whose confidence falls below the operating threshold. Two prediction shapes are filtered out before they reach the reviewer (or the workload count), reflecting how the dataset's wrong predictions actually break down:

- **Blank predictions** — the model returned nothing for the cell. In this dataset, every wrong-blank income prediction corresponded to a form cell whose true value was `0` ("missing 0" — covered by the numeric-zero recovery layer in §10.4.5 plus a residual described below). There is no scenario in this dataset where the form has a meaningful non-zero value and the model returns blank with low enough confidence to be flagged — so a blank prediction that *did* arrive at HITL would carry no value for the reviewer to verify against. The filter is therefore "if the prediction is blank, skip it" — these never reach the reviewer.
- **Single-character predictions** — the model returned a single digit, letter, or symbol on an income cell. These are auto-converted to `0` (per the §10.4.5 income rule) and never shown to the reviewer at all. They contribute to neither the workload count nor the reviewer's queue.

Both filters apply to **predictions only** — no knowledge of the ground-truth value is required at decision time, so the same rule applies in production as it does in benchmark. Errors of every class are still counted in the recall calculation; the filters affect only what gets routed to (and counted as) HITL.

**On the 82 confidently-blank income missings.** Separately from the blank-prediction filter above, the neural model returns blank with **high confidence** on **82 income cells across the 99-sample dataset where the form actually has a value** (mostly `0`). Because the confidence is high, these would not be caught by any reasonable confidence-gated review even if blank predictions weren't filtered out — a confidence threshold is structurally unable to surface them. The numeric-zero recovery layer (§10.1, §10.4.5) catches ~120 such cells already; the residual 82 sit outside both recovery and confidence-gated HITL and need a different mitigation — see §10.5.6 for the full accounting of how many blank-when-actually-0 cells are recovered, how many remain, and the addressable failure modes.

The full 82-cell set has not been individually reviewed. A separate manual review covered the 67 regression/drift cells where V2's error class differed from V1 (42 of which fall in `income_amounts`) — that review is summarised in §10.6.1 and provides representative examples of why the recovery layer misses some 0 cells, not a complete breakdown of all 82. Recurring patterns observed in the sampled income misses include:

- **Off-centre 0 cells** — the form has a `0` written, but it's not aligned with the cell's selection-mark detector region. The recovery's mark-overlap check misses it.
- **Likely-checkbox cells with no detected mark** — the form has what looks like a checkbox-style "no income" indicator that Azure DI didn't surface as a selection mark, so recovery has no anchor.
- **Messy / faded content read as confidently blank** — there *is* a value on the form but the OCR returned nothing for that cell entirely; recovery has no candidate to flip because the prediction didn't even reach the cell.

The first two patterns are addressable by extending the recovery rule (more permissive mark-overlap checks; positional-anchor fallback when no mark is detected). The third pattern is structurally different — the OCR layer returned nothing for the region, so there is no candidate cell for the recovery rule to operate on. Addressing that class needs a different approach entirely (a VLM-based engine that reads the image directly, or a second-pass extraction targeted at the empty regions). The remainder of the 82 has not been individually attributed and may include further variants of either category, plus some cells in bad-quality documents (§10.6.2) that present recognisable quality issues at the document level rather than at the per-cell level.

With those 82 cells handled separately, the error pool sized below is: **22 SIN errors** (extras, wrongs, and missings — SIN missings aren't confidently-blank the way income missings are) and **68 income errors** (extras and wrongs).

#### 10.5.1 Per-category target-recall ladder

For each category, the smallest discrete confidence threshold T that catches at least the target fraction of errors:

| Target recall | T (sin) | sin reviews / 100 docs | sin residual errors / 100 docs | T (income) | income reviews / 100 docs | income residual errors / 100 docs | **Combined reviews / 100 docs** | **Combined residual errors / 100 docs** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 50% | 0.61 | 13 | 11.1 | 0.61 | 28 | 34.3 | **41** | **45.5** |
| 70% | 0.70 | 21 | 6.1 | 0.75 | 50 | 20.2 | **71** | **26.3** |
| 80% | 0.72 | 25 | 4.0 | 0.89 | 70 | 11.1 | **95** | **15.2** |
| 90% | 0.90 | 50 | 2.0 | 0.96 | 99 | 6.1 | **149** | **8.1** |
| 95% | 0.97 | 96 | 1.0 | 0.97 | 109 | 2.0 | **205** | **3.0** |
| 99% | 0.99 | 98 | 0.0 | 0.98 | 140 | 0.0 | **238** | **0.0** |

Per-category thresholds are chosen **independently** — each category is sized to its own recall target. The combined column is the sum of per-category review loads; that's the operational number for staffing. The residual-errors-per-100-docs columns show the corresponding error rate that slips through at each operating point.

#### 10.5.2 Combined HITL workload curve

![HITL trade-off — Neural Custom Model (V2 current)](hitl/hitl-curves.png)

Two lines show per-category recall vs. review load on a log-scale X-axis. Dots mark the six target-recall operating points from the table above; each dot is annotated with the threshold value.

Both curves scale gracefully across the recall range. The two practical reading notes:

- **Sin scales close to linearly in log-flag space.** Picking up each additional 20 percentage points of recall roughly doubles the per-100-docs workload (13 → 21 → 50 → 98 across 50/70/90/99%). The steepest single jump is **90 → 95% recall** (50 → 96 reviews per 100 docs) — the threshold has to move from T = 0.90 to T = 0.97 to pick up the next 5 pp, and a large number of correct high-confidence predictions fall into the flagging band at the same time. Past 95% the workload flattens: 96 → 98 reviews between 95% and 99% recall, because the residual sin errors at that point cluster tightly near the top of the confidence range and small threshold moves catch them with little extra collateral flagging.
- **Income climbs at a similar rate to sin, just shifted by category size.** Income carries 35 fields per document (vs. sin's 2), so even with the trivial-prediction filter the operating load is several times sin's at any given recall target. The 70 → 90% income step is the working "knee" of the curve — the elbow on a recall-vs-workload plot where additional recall starts costing meaningfully more per percentage point. Concretely, moving from T = 0.75 to T = 0.96 takes the load from 50 to 99 reviews per 100 docs to capture that extra 20 pp of recall. Past 90% recall the marginal cost flattens again: 99 → 109 → 140 across 90/95/99% (the highest-confidence income errors are reachable by small threshold increments because the error confidences cluster tightly in that band). The "knee" matters because it's the natural operating point — accept anything to the left of it and you're under-spending review effort relative to the residual error rate; pay anything to the right of it and you're spending disproportionately to chase the last few errors.

#### 10.5.3 Implications for staffing

At the V1 §8.3 volume (~35,000 reports / month) and the V1 §7.6 design target of ~8 s per flagged-prediction review:

| Target recall | Combined reviews / 100 docs | Reviews / month | Hours / month | FTEs (at 40 h/wk × 4 wk) |
|---|---:|---:|---:|---:|
| 50% | 41 | 14,350 | ~32 | ~0.2 |
| 70% | 71 | 24,850 | ~55 | ~0.3 |
| 80% | 95 | 33,250 | ~74 | ~0.5 |
| 90% | 149 | 52,150 | ~116 | ~0.7 |
| 95% | 205 | 71,750 | ~159 | ~1.0 |
| 99% | 238 | 83,300 | ~185 | ~1.2 |

**How the columns are derived.** Reviews/month = (combined reviews per 100 docs ÷ 100) × 35,000 docs/month. Hours/month = reviews/month × 8 s ÷ 3600 s/h. FTEs = hours/month ÷ (40 h/wk × 4 wk = 160 h/month). All three downstream columns are mechanical rescalings of the §10.5.1 "Combined reviews / 100 docs" column at the V1 §8.3 / §7.6 constants. The reviews-per-100-docs numbers come from the HITL planner's per-category target-recall sweep; they are reported to integer precision in §10.5.1, and the table above propagates that rounding consistently (worked example for 50%: 41 ÷ 100 × 35,000 = 14,350; 14,350 × 8 ÷ 3600 ≈ 31.9 h; 32 ÷ 160 ≈ 0.2 FTE).

The full recall range fits inside a single FTE at this volume. Moving from 50% to 99% combined recall adds about an FTE — the marginal cost of going from "catch half the errors" to "catch nearly all of them" is modest. V1 §6.3 frames this as the acceptable-risk-threshold conversation; the table grounds that conversation in concrete per-recall-level numbers.

#### 10.5.4 What residual errors look like at each level

The residual columns in §10.5.1 report errors per 100 documents, which translates directly to the production error rate at scale. At 90% combined recall the residual is ~8 errors per 100 documents (6 income + 2 SIN). At 50% recall the residual is ~46 errors per 100 documents (34 income + 11 SIN), against a 90-error in-scope pool. At 99% recall the residual approaches zero.

These residual counts are *separate from* the 82 confidently-blank income missings excluded from HITL scope (§10.5 opener) — those are addressed by the numeric-zero recovery layer plus the extensions described in §10.5.6, not by confidence-gated review.

The acceptable residual rate per field category is the SDPR-leadership decision V1 §9.5 called for; this table provides the per-level cost so the trade-off is explicit.

#### 10.5.5 Validation layers for fields excluded from HITL

The categories outside confidence-gated HITL each have an alternative validation layer:

- **`signature`, `spouse_signature`** — presence-only check. The form requires a signature in specific cells; absence is the only failure mode that matters operationally. Confidence-gating not needed.
- **`name`, `spouse_name`** — ICM lookup per V1 §7.1 is the validating layer. The lookup key (SIN, or `case_id` if it is used as the lookup key — see below) unlocks the case; the case carries the canonical name; the OCR'd name is compared (with fuzzy tolerance, same rule as §10.4.5) against canonical. Mismatches route to an exception queue, not a per-prediction HITL gate.
- **`case_id`** — `case_id` is a candidate **lookup key** for ICM (an alternative to SIN), not a field validated against ICM. If `case_id` is used as the lookup key, the value itself unlocks the case record and the failure signal is "the lookup didn't resolve", not "the confidence was low". The current plan is to use SIN as the primary lookup key; whether `case_id` is also used (e.g. as a fallback when SIN is unreadable, or as a cross-check) is an open business question (see §10.8.5). Whichever key is used should be included in HITL on the same basis as SIN, because lookup failure cascades to a manual lookup.
- **`phone`, `spouse_phone`** — phone is contact information used to follow up on flagged documents; a wrong phone is operationally low-impact (other contact channels exist). The fields stay in the report's accuracy figures for transparency but aren't part of the confidence-gated workload.
- **`explain_changes` (freeform)** — downstream LLM post-processing cleans residual OCR drift; the fuzzy normalisation in §10.4.5 already accepts the operationally-relevant tolerance.
- **`checkbox_*`** — group-consistency rules per V1 §5.6 (mutually-exclusive options can't both be checked; spouse-section checkboxes ignored when no other spouse data present). Per-prediction HITL is not viable at the volume (28 checkbox fields × every document would dominate the total review load); structural rules catch the dominant failure modes.
- **`date`, `spouse_date`** — provisional pending downstream design. Once the role of these fields in the ICM workflow is defined, the appropriate validation layer (strict scoring, format normalisation, range validation, or all three) will be chosen.

#### 10.5.6 Blank-when-actually-0 recovery: scope and residual

The income-cell numeric-zero recovery rule (§10.1, §10.4.5) is the largest single methodology lift in V2 — it accounts for roughly +4 pp of the +4.8 pp normalisation+recovery accuracy gain. This subsection sizes its scope explicitly so the addressable residual is visible.

The income section is the dominant cost centre for blank-when-actually-0 errors on this form. The form has 35 income lines per document (18 applicant + 17 spouse), and on the production samples the **majority of those cells are filled with `0`** — most applicants have income from only a small handful of categories, and every other line carries a hand-written `0` to indicate "no income from this category". The recurring failure pattern is that Azure DI's OCR layer **mis-reads those small hand-written `0` glyphs as selection marks (checkboxes)** instead of digits, so the field arrives downstream as blank rather than as `0`. The numeric-zero recovery rule was built specifically to invert that mis-read where the layout evidence (a selection-mark polygon overlapping a cell that is otherwise empty) supports it.

| Population | Count (99 docs) | Source |
|---|---:|---|
| Total income cells evaluated | ~3,465 | 35 income fields × 99 documents |
| Income cells flipped from blank → `0` by the recovery layer | **~120** | §10.3 missing-class delta (225 V2 strict → 103 V2 current) |
| Income cells still confidently blank where the form actually has a value | **82** | §10.5 opener (annotated breakdown in CSV) |
| Income wrong-class errors (engine returned non-blank wrong value) | 46 | §10.6.1 / wrong-by-category CSV |
| Income extra-class errors (engine produced value where cell was blank) | ~21 | from neural V2 current totals (line-up with §10.3) |

The ~120 recovered cells set a floor for what the recovery rule *currently* catches: the model returned blank, Azure DI's layout pass reported a selection mark inside the cell, and the recovery rule flipped the cell back to `0`. The 82 residual is what the recovery rule **doesn't** catch. The full 82 has not been individually attributed, but the manual sampled-review described in §10.5 opener (drawn from the 67 regression/drift cells in §10.6.1, of which 42 are income) surfaces two broad classes of residual:

- **Cells where a 0 (or 0-like indicator) is present in the image but the recovery rule misses it.** This includes off-centre 0s the mark-overlap check doesn't cover, and likely-checkbox indicators where Azure DI didn't surface a selection-mark at all so the recovery has no anchor to fire on. This class is addressable — extending the recovery rule with more permissive overlap heuristics, or a positional fallback that fires without a detected mark, would catch some of these.
- **Cells where Azure DI's OCR layer returned nothing in the region.** No mark, no text, no candidate — the recovery rule has nothing to operate on because there is no candidate cell to flip. This class is structurally different from the first: it's not a recovery-rule gap, it's an OCR-layer gap. The right intervention is a different extraction stack (a VLM that reads the image directly, or a second-pass extraction targeted at empty regions), not a recovery-rule extension.

We don't have a per-cell attribution across the full 82 — the sampled review provides examples, not a complete breakdown — so the relative size of the two classes inside the 82 is not known precisely. We know the second class is non-empty (the sampled review surfaced it explicitly) and that the document-concentration pattern in §10.6.2 means some of the 82 fall inside the bad-quality documents at the top of the long tail.

**Practical implications:**

- **Some of the 82 residual cells are addressable by extending the recovery rule** — specifically the cells where a 0 indicator is present in the image but the recovery rule's anchors don't catch it. Each rule extension targets a specific failure mode (more permissive mark-overlap; positional fallback without a detected mark) and lifts accuracy incrementally, but each extension also widens the rule's false-positive surface — pushing for too aggressive a recovery rule risks flipping cells that should have stayed blank. Picking the right operating point for the rule is a recall/precision trade-off on the recovery layer itself.
- **The other class — cells where the OCR layer returned nothing for the region — needs a different approach entirely.** The recovery rule can't reach them because there is no candidate to flip. Addressing that class requires either a different OCR/extraction stack (a VLM-based pipeline that reads the image directly, see §10.9) or a second-pass extraction targeted at the regions Azure DI left empty. This is the natural next-generation lever for further reducing the residual.
- **A precise per-cell breakdown of the 82** would size the two interventions against each other. That's a tractable manual-review task that hasn't been done yet and would be a useful input before committing to a rule extension vs. an engine swap as the next step.

### 10.6 Residual-error failure-mode breakdown

A manual review of the cells where neural V2 differs from the template V1 baseline (regressions and drifts in either direction) attributes each residual error to a concrete underlying cause. This section reports the categorisation, the document-concentration pattern, and the ground-truth corrections needed before V3 benchmarking.

#### 10.6.1 Failure-mode categorisation

Of the ~67 cells where V2's error class differs from V1 (regressions + drifts in either direction), the manual review attributes them as follows:

| Failure mode | Approx cells | What it is | Addressable by |
|---|---:|---|---|
| **Ground-truth wrong** | **~10** | The engine returned the correct value but the GT itself is wrong. These aren't engine errors. | GT cleanup before V3 (§10.6.3) |
| **Low resolution / low quality** | **~20** | The form image is below the quality the engine can read reliably. Concentrated in a few documents (§10.6.2). | Source-side scanning standards (V1 §7.5, §9.2) |
| **Bad document — missing piece** | **~5** | The physical form is damaged: a corner or section is missing. | Intake-time rejection or routing to manual entry |
| **Stamp interference** | **~4** | A date stamp or office stamp overlaps a form field, distorting OCR. | V1 §7.5 intake guidance: do not stamp over blank fields |
| **Failed to detect 0 (off-centre / messy / undetected checkbox)** | **~7** | Income cells with a `0` value the recovery layer didn't catch — see §10.5 patterns. | Extending the numeric-zero recovery rule |
| **Neural retraining gaps — failed to pick up** | **~5** | Specific field types (signature, case_id, rental_income, room_board_income) where the model returned blank on cells it could in principle read. | Labelling more examples of the specific patterns and retraining |
| **Neural retraining gaps — picked up neighbouring text** | **~5** | Model returned content from an adjacent cell or label (e.g. picking up `"Print name"` label, or text from the cell next to workers_compensation). | Same — targeted retraining on the affected fields |
| **Case_id position variability** | **3** | Handwritten case_id placed outside the template's expected position. | Retraining with examples of varied case_id placements (echoes V1 §5.4) |
| **OCR misreads on actual values** | **~4** | Real engine errors on legitimate content: missed decimal point, character-level mis-reads. | Largely irreducible at this engine; LLM-based engines may help on V3 |
| **Cropped form** | **1** | A field is cut off by the scan boundary. | Source-side scanning standards |

#### 10.6.2 Document concentration

Residual errors are not uniformly distributed across the 99-document sample. The distribution is strongly bimodal: a substantial fraction of documents are completely clean, and the errors that remain cluster heavily on a small number of bad-quality documents.

**Headline distribution:**

- **20 of 99 documents have zero errors** — the engine reads them perfectly, every field matched.
- **28 documents have exactly 1 error** — a single mostly-trivial cell, otherwise clean.
- **17 documents have 2 errors**, 10 have 3, 8 have 4 — these middle bands together cover most documents.
- **5 documents have 10 or more errors each**; the worst single document has 27.

Cumulative coverage by the highest-error documents:

| Top N samples | Errors covered | % of all 267 errors | % of all 99 docs |
|---:|---:|---:|---:|
| 1 | 27 | 10.1% | 1.0% |
| 3 | 61 | 22.8% | 3.0% |
| **5** | **82** | **30.7%** | **5.1%** |
| 10 | 113 | 42.3% | 10.1% |
| 20 | 159 | 59.6% | 20.2% |
| 30 | 193 | 72.3% | 30.3% |
| 50 | 237 | 88.8% | 50.5% |

**The top 5% of documents (by error count) account for nearly a third of all errors. The top 10% account for 42%. The top 20% account for 60%.** This is a classic long-tail distribution — the bottom of the curve is "documents the engine handles cleanly", and the top is "a handful of documents that account for most of the residual review load".

Cumulative complement view (how many documents have N or more errors):

| Errors per doc | Documents at or above | % of 99 docs |
|---:|---:|---:|
| 1+ | 79 | 79.8% |
| 2+ | 51 | 51.5% |
| 3+ | 34 | 34.3% |
| 5+ | 16 | 16.2% |
| 7+ | 6 | 6.1% |
| 10+ | 5 | 5.1% |
| 15+ | 3 | 3.0% |
| 20+ | 1 | 1.0% |

The worst-affected documents and what's behind them (based on the manual annotation review of §10.6.1 where available, plus per-category error counts for the rest):

| Sample (truncated) | Errors | Concentrated in | Likely root cause |
|---|---:|---|---|
| `12ZYMVJU` | 27 | income (18), checkboxes (7), date (1) | Physically damaged form — missing piece, plus low-quality income section |
| `12Z0OKTI` | 18 | income (18) — all in one category | All-income failure; mostly missing-zero recovery gaps in a single document |
| `12UEFDZY` | 16 | income (14), date, phone | Low resolution across the spouse income section |
| `12UEKMDX` | 11 | income (9), signature, phone | Large blank spouse section reads as missing |
| `12UOS1F3` | 10 | checkboxes (4), income (4), signature, phone | Low quality across multiple categories |
| `12ZBOVN0` | 8 | checkboxes (8) — all in one category | Single document with an unusual checkbox-marking convention the model doesn't read; all-checkbox failure |
| `12Z03S7D` | 6 | phone (2), sin, signature, others | Stamp overlap plus retrainable failure modes |
| `12ZBJEKC` | 6 | income (4), phone, signature | Mixed |
| `12Z42LAN` | 6 | checkboxes (3), case_id, date, … | Mixed |

The all-one-category failures are notable: `12Z0OKTI` is 18 income misses in one document, and `12ZBOVN0` is 8 checkbox misses in one document. These look like systematic per-document problems (form filled in an unusual way, or a single quality issue affecting an entire section) rather than spread-out OCR noise.

**Operational implications:**

- **Per-document HITL time is bimodal.** 20% of documents are nearly free to verify, 50% are 1–2 cells, and the long-tail 5% drive most of the review load. Averaging across all documents understates the bad-doc cost.
- **Intake-time document quality control has outsize leverage.** Catching just the top 5 worst-quality documents (5% of the corpus) before they enter the OCR pipeline would eliminate ~31% of the residual error count — a larger reduction than any single normalisation or recovery rule we've added. Rejecting or re-routing the top 20 (20% of the corpus) addresses 60% of errors.
- **SLA and capacity sizing should account for the long tail.** Mean errors per document is 2.7; median is 1 (or 0 if you include the 20 perfect documents). The mean is dragged up almost entirely by the worst 5–10% of documents. Staffing should be designed around the long-tail review load, not the per-document average.
- **A separate quality-routing layer is the highest-leverage operational change.** Documents that fail a low-resolution / damaged-form / missing-section check at intake should be routed to full manual entry rather than OCR-with-HITL — the cost per document is more predictable than letting them through and absorbing many flagged predictions per doc.

#### 10.6.3 Ground-truth corrections needed before V3

About **10 of the cells reported as V2 errors are actually ground-truth bugs** — the engine returned the correct value, but the GT JSON has the wrong value. These cover SIN, date, name, several checkboxes (concentrated in one sample), spouse signature, and one income cell.

These cells inflate the V2 error count by ~4% (10 of 267) and would also inflate any V3 comparison if left uncorrected. The recommendation is to clean up the GT for those specific cells before running V3 benchmarks, so the engine comparison is honest.

This is a methodology hygiene item, not an engine improvement — V2's true accuracy is slightly higher than the headline 96.4% figure suggests; the corrected figure would land closer to ~96.5%.

#### 10.6.4 Sample size and statistical significance

All V2 numbers in this report come from a **99-document sample**. That sample size shapes how the results should be read and what conclusions can be drawn confidently.

**What the sample size is good for:**

- **Headline accuracy direction and magnitude.** With 7,425 field predictions across 99 documents, the V2-current accuracy of 96.4% has a 95% binomial confidence interval of roughly ±0.4 pp at the field level. The V1 → V2 lift (88.8% → 96.4% = +7.6 pp) is well outside any reasonable confidence interval — the improvement is robust. So is the engine-only contribution (template → neural strict: +2.8 pp) and the methodology contribution (neural strict → neural current: +4.8 pp).
- **Per-category direction.** For the larger categories (income with ~3,465 predictions, checkboxes with ~2,772 predictions), per-category accuracy is well-resolved. Differences of a few percentage points are real.
- **Failure-mode taxonomy.** §10.6.1 categorises 67 manually-reviewed regression/drift cells. The taxonomy itself (off-centre 0, stamp interference, low resolution, etc.) is robust because each category is supported by multiple cells with concrete, recognisable patterns. The exact counts per category are noisy — "~5 off-centre 0 cells" should be read as "small handful", not "exactly 5".
- **Document-concentration pattern.** §10.6.2's long-tail finding (top 5% of docs drive 30% of errors) is structurally clear even at this sample size — 5 documents driving 82 errors is hard to confuse with random distribution.

**What the sample size is *not* sufficient for:**

- **Per-field micro-claims** on small fields. Categories with only 1–2 fields (name = 2, signature = 2, freeform = 1, case_id = 1) have predictions in the hundreds rather than thousands. Confidence intervals are wider: a 91% accuracy on `signature` (181 evaluated cells) is ±4 pp at 95%, so "91%" should be read as "high 80s to mid 90s". This is enough to confirm direction but not enough to pin down absolute numbers.
- **Rare failure modes.** Patterns that occur on a small number of documents (cropped forms, physically damaged forms, stamp interference) are well-resolved as classes but not well-resolved as base rates. We can confirm they happen; we can't reliably say "5% of production submissions will have stamp interference" from a 99-doc sample.
- **Tail behaviour of confidence distributions.** The HITL planner (§10.5) reports thresholds at six recall targets. The 50–90% recall thresholds are well-supported by the per-category error counts (22 SIN errors, 68 income errors). The 95–99% thresholds are extrapolating from a handful of marginal-confidence errors and should be read as approximate operating-point guidance, not as precisely-calibrated production thresholds.
- **Engine selection between close competitors.** If a future V3 benchmarks another engine and the F1 gap to V2 is under ~1 pp, that gap is inside the sample-size noise — distinguishing two engines that differ by 1 pp on F1 needs several hundred more documents to be confident the direction is real.

**What would tighten the conclusions:**

- A **larger benchmark set (500–1000 documents)** would tighten per-category and per-field intervals to under ±1 pp on the small categories, support rare-failure-mode base rates, and reliably distinguish engines that differ by ~0.5 pp on aggregate metrics. The current 99-document set is drawn from production data; the limitation here is sample *size*, not sample *source*. Expanding the benchmark is the natural next data-collection step before V3 and before any production cut-over to a different engine.
- For business-critical decisions, **per-field acceptance criteria should be set with the confidence-interval width in mind** — committing to "income accuracy ≥ 96%" on a small benchmark gives less guarantee on production than committing to it on a much larger one.

The headline V2 conclusions (engine swap delivers a real lift; normalisation+recovery delivers a larger lift; income is the dominant cost centre for HITL; documents follow a long-tail error distribution) are robust at this sample size. The fine-grained numbers (per-field accuracies, per-target-recall thresholds, exact failure-mode counts) should be treated as well-grounded direction but not as final production specifications.

### 10.7 Where V1 findings stand after V2

| V1 finding | Status | Detail |
|---|---|---|
| §3 confidence is not a reliable HITL trigger on handwriting | **Refined.** Holds for income missings specifically (high-confidence blank predictions are unreachable by confidence-gating — see §10.5 opener). For SIN and for income extras/wrongs, confidence-gating is now meaningfully selective and the V2 HITL planner uses it. The categorical claim "confidence isn't reliable" is replaced with a per-category, per-error-class policy in §10.5. |
| §4.3 normalisation pass owed | **Delivered.** Full ruleset in §10.4.5. |
| §5.1 name extraction failures driven by rotation/scan quality | **Confirmed.** name 33% → 6% error rate, spouse_name 41% → 1% under V2 current. The engine swap closes most of the gap; fuzzy matching (per §10.4.5) closes the rest. |
| §5.3 spouse-name phantom extractions from stamps | **Confirmed strongly.** The 81% drop in extra-class errors is overwhelmingly spouse-side. spouse_name 41% → 1%, spouse_phone 26% → 3%, spouse_signature 35% → 4%, spouse_other_income 20% → 3%. ~4 stamp-interference cases remain in the residual (§10.6.1) — the predicted-blank-due-to-stamp-overlap pattern still occurs sporadically, reinforcing the V1 §7.5 intake-guidance recommendation. |
| §5.4 case_id extra text / phantom extractions | **Confirmed.** Error rate 31% → 9%. Residual case_id failures (3 cells per §10.6.1) trace to handwritten case_id placed outside the template's expected position — addressable by retraining with more position-varied examples. |
| §5.5 income-field error classes | **Confirmed and significantly mitigated.** Engine alone is flat on income (0.878 → 0.879). Numeric-zero recovery + normalisation lifts to 0.957 (V2 current). The 82 confidently-blank income missings (§10.5 opener) now have concrete failure-mode attribution from a manual review: ~5 off-centre 0 cells, ~2 undetected-checkbox cells, ~1 faded-text cell, with the remaining majority concentrated in bad-quality documents (§10.6.2). Mandatory HITL on non-zero declared income still recommended (V1 §5.5). |
| §5.6 checkbox failure modes | **Confirmed.** Accuracy essentially flat (0.988 → 0.991). V1 §5.6 group-consistency validation remains the primary safety mechanism. |
| §5.7 date errors mostly normalisation artifacts | **Confirmed.** Date error rate 35% → 7% under V2 current — the bulk is normalisation, not engine improvement. Date's scoring policy is provisional pending downstream design (§10.4.5 / §10.5.5). |
| §7.5 source-side quality (scanning standards, no stamps over fields) | **Strongly reinforced.** §10.6 attributes ~30 of the residual error cells directly to low resolution, cropped forms, physically damaged documents, or stamp interference — all source-side. ~5 documents in the 99-sample set drive 30–40% of the regression+drift errors. Document-quality intake control is now a top-tier operational recommendation (see §10.8), not deferred to general "operational improvements". |
| §6 risk-as-probability-times-impact framework | **Confirmed; sharpened.** §10.5 quantifies the probability side per category at six recall levels. Per-category acceptable-risk thresholds are now ready for the SDPR-leadership conversation V1 §6.3 / §9.5 called for. |
| §7.1 ICM cross-validation | **Promoted to structural requirement.** §10.4.5 and §10.5.5 adopt ICM lookup as the primary validation layer for `name`. The lookup key is **SIN** as the current plan, with `case_id` as a candidate alternative or fallback (open business question — see §10.8.5). `case_id` is not itself validated by ICM; it's a candidate *input* to the lookup, the same way SIN is. The fuzzy normalisation policy on `name` is explicitly justified by the ICM layer providing the source-of-truth check. |
| §7.6 tiered HITL | **Refined.** §10.5 replaces the categorical tiers with a per-category target-recall ladder for the scoped categories, and a non-HITL validation layer for everything else (§10.5.5). |

### 10.8 Updates to recommendations and path forward

Refinements to V1 §9 informed by the V2 data:

- **§9.1 (continue trajectory):** Neural is now benchmarked and is the right baseline for any further engine bake-off. A separate cross-engine evaluation (LLM-based two-stage pipelines combining DI layout extraction with a generative model) is being conducted in parallel and is reported separately. Whether any of those alternatives is worth the additional cost is a separate evaluation; out of scope for V2.
- **§9.3 (end-to-end workflow validation):** the per-category HITL workloads in §10.5.3 (41 → 238 reviews/100 docs depending on target recall) should size the workflow test. V1's design-target HITL time of ~8 s per prediction should be validated empirically against the income category specifically — the dominant cost centre.
- **§9.5 (acceptable-risk thresholds):** the conversation is now ready. V2 provides the per-category cost ladder SDPR leadership needs to set thresholds explicitly. The recommendation is to do this **per category**, not as a single overall target — income's review-load profile dominates the combined workload at every recall level.

New for V2:

- **Document-quality intake control is a top-tier operational priority.** Per §10.6.2, errors follow a strong long-tail distribution: 20% of documents are perfectly clean, while the top 5% by error count drive 30.7% of all residual errors, and the top 20% drive 59.6%. The worst documents share recognisable failure modes (low resolution, cropped, physically damaged, stamp overlap, unusual filling conventions). Two concrete actions: (a) tighten the V1 §9.2 scanning standards (high-resolution grayscale, intact forms, no stamps over blank fields) and operationalise them at intake; (b) route documents that fail a quality check at intake to a different validation path (re-scan request, or full manual entry) rather than absorbing the many flagged predictions per doc that come from running them through the OCR + HITL pipeline. The reduction in residual errors from catching just the worst 5% of documents is larger than the gain from any single normalisation or recovery rule added to the pipeline.
- **Targeted neural retraining has identified priorities.** The §10.6.1 review enumerates specific failure patterns the current neural model would benefit from additional training on: case_id placed in non-standard positions, off-centre 0 detection on income cells, model picking up neighbouring text on workers_compensation / rental_income / room_board_income, and signature detection on edge cases. Each is a candidate for a labelled-training follow-up — moderate cost, concrete upside.
- **Ground-truth cleanup before V3 benchmarking.** Per §10.6.3, ~10 of the V2 errors are GT bugs rather than engine errors. These cells need correction before V3 benchmarks run, otherwise V3 inherits the same false-negative baseline and the engine comparison is dishonest. This is methodology hygiene — V2's true accuracy is closer to ~96.5% than the headline 96.4%.
- **The remaining confidently-blank income missings need a non-HITL layer.** Confidence-gating provably cannot help with these (the model is confident, just wrong). The numeric-zero recovery is the existing layer; the §10.5 patterns enumerated by manual review (off-centre 0 cells, undetected-checkbox cells, faded content) point at concrete extensions to the recovery rule.
- **ICM cross-validation is now a structural requirement, not an optimisation.** `name` is validated by ICM lookup (keyed on SIN, with `case_id` as a candidate alternative — see §10.8.5), not by per-prediction HITL. The fuzzy normalisation policy on `name` (§10.4.5) is operationally correct only because the ICM lookup is doing the real identity check. Whichever value is used as the lookup key (SIN, case_id, or both) needs to be in HITL on the same basis as SIN today, because a wrong lookup key cascades to a manual case lookup.
- **Numeric-zero recovery is a benchmark-methodology requirement, not just a scoring choice.** Any future engine added to the comparison will need the same recovery pass applied or its income numbers will be incomparable.

#### 10.8.5 Open business-validation assumptions

Several aspects of the V2 design rest on assumptions about the downstream business workflow that have not yet been validated with SDPR stakeholders. Those assumptions are listed here so they can be confirmed (or corrected) before the V2 recommendations are operationalised. Decisions on these points will shape the HITL scope and the per-field acceptance criteria; some may invalidate parts of §10.5.

- **Field-importance ratings for `phone`, `date`, `signature`, and free-text.** §10.5 scopes HITL to the two fields with clear downstream cost (`income_amounts` and `sin`) and lists alternative validation layers for everything else in §10.5.5. That scoping assumes phone, date, signature, and free-text don't carry significant downstream cost on this form — for example, that phone is contact-only, that signature only needs presence-verification, that date's exact value isn't load-bearing for an eligibility decision. **If any of these fields turn out to be operationally important** (e.g. date drives a coverage period; signature presence must be verifiable in audit; phone wrongs cause failed contacts), they will need to be added to the HITL scope and the workload numbers in §10.5.3 will move.
- **Lookup-key choice — SIN, case_id, or both.** §10.5 places `sin` inside HITL on the assumption that SIN is the primary ICM lookup key, and that catching SIN errors via confidence-gating reduces downstream lookup-failure cascades. **If `case_id` is also used as a lookup key** (either as a primary, a fallback when SIN is unreadable, or a cross-check), `case_id` needs to be in HITL on the same basis as SIN today, and the §10.5 workload tables need to add `case_id` to the per-category ladder. The current plan uses SIN only; whether `case_id` is also used is the business question.
- **HITL trigger model for lookup-key fields.** The §10.5 numbers size HITL on SIN as a **confidence-gated front-stop** — flag low-confidence SIN predictions for review *before* the ICM lookup runs. The alternative trigger model — **lookup-first, HITL-on-failure** — runs the ICM lookup with whatever the OCR produced, and only routes to HITL on the cells where the lookup didn't resolve. That alternative reduces the HITL volume on SIN (only the lookup-failures need review, not every low-confidence prediction), at the cost of some downstream lookup-failure cascades — a wrong SIN that *does* resolve in ICM (e.g. resolves to the wrong person) would not trigger HITL under the lookup-first model and would land as a downstream error instead. Whether to use the confidence-gated front-stop, the lookup-first model, or both (front-stop + post-lookup fallback) is the business decision; it depends on the relative cost of a HITL review vs. a downstream wrong-case-resolution incident, and on how often a wrong-but-valid-looking SIN actually resolves in ICM. The same logic applies to case_id if it is used as a lookup key.
- **Acceptable residual error rate per field category.** §10.5 provides a six-point recall ladder (50–99%); each level has a concrete workload cost and a concrete residual error rate. **Choosing the operating point is the SDPR-leadership decision** V1 §6.3 / §9.5 called for. The recommendation is to do this *per category* — income's risk profile is different from SIN's, and a single combined target obscures that.
- **Single-digit income as 0** (§10.4.5). The scoring rule treats every single-character income prediction as `0`. The assumption is that genuine single-digit incomes (e.g. `$9`) are not operationally meaningful on this form — the vast majority of cells are 0, and single-digit-as-0 removes a large class of OCR mis-reads at the cost of one edge case. **If single-digit income is meaningful**, the rule needs to be revisited and a different mitigation chosen (the single-char predictions would then need to be reviewer-visible, with a small workload cost).
- **Source-side intake controls.** §10.8 recommends document-quality intake control as a top-tier operational change, anchored in §10.6.2's long-tail document distribution. **The implementation path** — what specifically gets rejected at intake, who runs the gate, and what the re-routing destination is (re-scan request, full manual entry, exception queue) — is a workflow design question that depends on existing SDPR operations and tooling. The technical case for the gate is strong; the operational realisation is open.

These open questions don't invalidate the V2 results; they shape how the V2 results get operationalised. Each one would benefit from a short stakeholder conversation before the corresponding piece of the recommendation lands in a production runbook.

### 10.9 What's next

Subsequent versions will append columns to the §10 tables for additional engines benchmarked through the same pipeline. The end-to-end methodology — apply the normalisation ruleset (§10.4.5), apply numeric-zero recovery, then score — is engine-agnostic and reproducible.

**The next route for engine-side improvement** is a different engine entirely. The V2 neural model has materially closed the gap on rotation / scan-quality / stamp interference (the V1 dominant failure modes), but two classes of residuals persist that another engine — particularly an LLM-based two-stage pipeline that sees both the image and an OCR layer — is well-positioned to address:

- **The blank-when-actually-0 problem (the 82 residual income missings) more robustly.** A VLM that reads the image directly is not constrained by Azure DI's selection-mark detector, and can in principle distinguish "no value" from "0 written off-centre" or "checkbox-style indicator" without needing layout anchors. The §10.5.6 recovery rule is a workaround for a structural OCR-layer limitation; a different OCR/extraction stack may not need the workaround at all.
- **The "engine ceiling" failure modes that current neural can't reduce.** Real OCR mis-reads on legitimate handwriting (missed decimal points, ambiguous character recognition) and content the model didn't pick up despite the image being readable. An LLM-based engine that reasons about the form structure (rather than just classifying glyphs) can sometimes recover content the supervised neural model drops.

A separate cross-engine evaluation has benchmarked a handful of alternatives — including a custom two-stage pipeline (Azure DI layout OCR + GPT-5.2 with the image attached) that materially outperforms the neural model on this workload, plus Microsoft's Content Understanding managed service, Mistral, and direct VLM approaches. That evaluation is reported separately; the V3 step on the SDPR report would be benchmarking the chosen candidate against the same 99-document set using the same methodology (normalisation + recovery + score) so the comparison is apples-to-apples.

**Beyond a single-engine swap, the further-improvement lever is an ensemble** — running multiple engines per document and combining their predictions per category. The cross-engine work referenced above already includes a working per-category specialist routing ensemble that beats every single engine on every aggregate metric (F1.mean 0.984 vs the best single engine's 0.973, FP.mean 0.83 vs 1.58). The trade-off is technical operating cost: every additional engine in the ensemble multiplies the per-page extraction cost, and a routing layer is needed to combine the outputs. The cost scaling depends on **how many engines participate**. A two-engine ensemble — for example, the best single engine plus a specialist for the categories it's weakest on — roughly doubles the per-page cost and captures most of the easily-attainable lift. A wider ensemble that runs a specialist per category captures the maximum lift but multiplies the cost proportionally. **An ensemble makes sense if the residual error rate at the single-engine ceiling is still too high for the workflow, and the matching per-page cost increase is acceptable.** Picking the right size (which engines, for which categories) is itself a per-workload decision based on which residual error classes are still material after V3.

The general trajectory is: we will start seeing **diminishing returns** the further we push pure engine accuracy. At some point the marginal cost of squeezing out the last few percentage points of accuracy exceeds the cost of just routing those remaining errors to manual review. **Determining where that point sits** is a per-field business call — it depends on the residual error rate the workflow can absorb, the cost of a HITL review, and the cost of an undetected wrong value. So far we are clearly still in the "seek further improvements" regime — the lift from V1 → V2 was substantial, and the V3 candidates above are expected to produce further measurable gains — but the V2 numbers are also the first data point at which the conversation about *when to stop improving the engine and accept the residual into manual review* becomes concrete.

Operational improvements from V1 §9.2 also remain in scope: scanning standards (high-res grayscale), intake guidance (no stamps over blank form fields, handwritten case_id placed in the printed-case_id area), and a curated high-quality scan dataset to isolate engine performance from scan-quality noise.

---

# 11. Appendix

## 11.1 Template Model on Azure Document Intelligence (V1) — detailed results

_Same content that shipped in the V1 PDF. Generated from the template-model run_ `benchmark-result.json` _on 2026-05-06. Reproduced unchanged for traceability;_ _no edits since the V1 release._


**Note:** Companion document with visual examples is maintained separately due to PII considerations.

# Benchmark Run Analysis

Generated from `benchmark-result.json` on 2026-05-06T20:59:12.451Z.

## Run

| Property | Value |
| --- | --- |
| Definition | 100-doc-simple |
| Run ID | `7560644a-6588-40ab-8da6-61036110adb5` |
| Status | completed |
| Started | 2026-05-04T23:39:16.792Z |
| Completed | 2026-05-04T23:42:07.293Z |
| Duration | 2m 51s |
| Samples (passed / failed) | 99 (1 / 98) |

## Overall (recomputed from perFieldResults)

| Metric | Value |
| --- | --- |
| Fields total | 75 |
| Fields with errors | 64 |
| Fields perfect (0 errors) | 11 |
| Total field evaluations | 7425 |
| Total correct | 6596 |
| Total errors | 829 |
| Accuracy | 88.8% |


## Per-field results

Sorted by error rate (worst first). Confidence values are 0–1.

| Field | Evaluated | Errors | Error rate | Avg conf | Avg conf (correct) | Avg conf (errors) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `signature` | 99 | 54 | 54.5% | 0.566 | 0.741 | 0.421 |
| `spouse_name` | 99 | 41 | 41.4% | 0.806 | 0.915 | 0.652 |
| `explain_changes` | 99 | 37 | 37.4% | 0.835 | 0.929 | 0.678 |
| `date` | 99 | 35 | 35.4% | 0.963 | 0.965 | 0.959 |
| `spouse_signature` | 99 | 35 | 35.4% | 0.800 | 0.888 | 0.640 |
| `name` | 99 | 33 | 33.3% | 0.935 | 0.974 | 0.858 |
| `case_id` | 99 | 31 | 31.3% | 0.882 | 0.919 | 0.802 |
| `applicant_net_employment_income` | 99 | 29 | 29.3% | 0.790 | 0.890 | 0.548 |
| `spouse_phone` | 99 | 26 | 26.3% | 0.855 | 0.905 | 0.716 |
| `phone` | 99 | 25 | 25.3% | 0.891 | 0.931 | 0.771 |
| `sin` | 99 | 24 | 24.2% | 0.937 | 0.952 | 0.891 |
| `applicant_child_support` | 99 | 22 | 22.2% | 0.783 | 0.834 | 0.603 |
| `applicant_tax_credits_gst_credit` | 99 | 22 | 22.2% | 0.895 | 0.929 | 0.779 |
| `applicant_canada_pension_plan_cpp` | 99 | 22 | 22.2% | 0.777 | 0.829 | 0.595 |
| `applicant_spousal_support_alimony` | 99 | 22 | 22.2% | 0.745 | 0.786 | 0.599 |
| `applicant_income_of_dependent_children` | 99 | 22 | 22.2% | 0.846 | 0.923 | 0.578 |
| `spouse_sin` | 99 | 21 | 21.2% | 0.850 | 0.895 | 0.681 |
| `applicant_income_tax_refund` | 99 | 21 | 21.2% | 0.773 | 0.804 | 0.657 |
| `applicant_private_pensions_retirement_disability` | 99 | 21 | 21.2% | 0.782 | 0.833 | 0.594 |
| `spouse_other_income_money_received` | 99 | 20 | 20.2% | 0.699 | 0.767 | 0.426 |
| `applicant_other_income_money_received` | 99 | 20 | 20.2% | 0.905 | 0.941 | 0.763 |
| `applicant_student_funding_loans_bursaries` | 99 | 20 | 20.2% | 0.780 | 0.826 | 0.598 |
| `applicant_oas_gis` | 99 | 19 | 19.2% | 0.753 | 0.810 | 0.512 |
| `applicant_rental_income` | 99 | 19 | 19.2% | 0.776 | 0.798 | 0.681 |
| `applicant_child_tax_benefits` | 99 | 19 | 19.2% | 0.776 | 0.810 | 0.633 |
| `applicant_workbc_financial_support` | 99 | 19 | 19.2% | 0.804 | 0.862 | 0.560 |
| `applicant_room_board_income` | 99 | 17 | 17.2% | 0.699 | 0.713 | 0.632 |
| `applicant_trust_income` | 99 | 15 | 15.2% | 0.835 | 0.884 | 0.560 |
| `applicant_employment_insurance` | 99 | 15 | 15.2% | 0.903 | 0.942 | 0.684 |
| `applicant_workers_compensation` | 99 | 14 | 14.1% | 0.836 | 0.866 | 0.659 |
| `spouse_date` | 99 | 11 | 11.1% | 0.904 | 0.917 | 0.802 |
| `spouse_net_employment_income` | 99 | 9 | 9.1% | 0.945 | 0.956 | 0.827 |
| `checkbox_warrant_no` | 99 | 4 | 4.0% | 0.957 | 0.964 | 0.805 |
| `spouse_rental_income` | 99 | 4 | 4.0% | 0.943 | 0.948 | 0.831 |
| `spouse_oas_gis` | 99 | 3 | 3.0% | 0.947 | 0.949 | 0.876 |
| `checkbox_moved_no` | 99 | 3 | 3.0% | 0.950 | 0.951 | 0.912 |
| `spouse_trust_income` | 99 | 3 | 3.0% | 0.936 | 0.946 | 0.607 |
| `checkbox_moved_spouse_no` | 99 | 3 | 3.0% | 0.943 | 0.942 | 0.980 |
| `spouse_income_tax_refund` | 99 | 3 | 3.0% | 0.952 | 0.950 | 0.990 |
| `spouse_room_board_income` | 99 | 3 | 3.0% | 0.904 | 0.921 | 0.348 |
| `checkbox_moved_spouse_yes` | 99 | 3 | 3.0% | 0.943 | 0.946 | 0.837 |
| `checkbox_warrant_spouse_no` | 99 | 3 | 3.0% | 0.951 | 0.954 | 0.855 |
| `spouse_employment_insurance` | 99 | 3 | 3.0% | 0.909 | 0.917 | 0.654 |
| `spouse_private_pensions_retirement_disability` | 99 | 3 | 3.0% | 0.903 | 0.910 | 0.701 |
| `checkbox_work_spouse_no` | 99 | 2 | 2.0% | 0.943 | 0.945 | 0.847 |
| `checkbox_school_spouse_no` | 99 | 2 | 2.0% | 0.945 | 0.945 | 0.980 |
| `spouse_child_tax_benefits` | 99 | 2 | 2.0% | 0.934 | 0.939 | 0.686 |
| `checkbox_warrant_spouse_yes` | 99 | 2 | 2.0% | 0.956 | 0.956 | 0.985 |
| `spouse_workers_compensation` | 99 | 2 | 2.0% | 0.915 | 0.915 | 0.922 |
| `spouse_tax_credits_gst_credit` | 99 | 2 | 2.0% | 0.915 | 0.924 | 0.487 |
| `spouse_canada_pension_plan_cpp` | 99 | 2 | 2.0% | 0.954 | 0.954 | 0.992 |
| `spouse_spousal_support_alimony` | 99 | 2 | 2.0% | 0.860 | 0.866 | 0.574 |
| `spouse_workbc_financial_support` | 99 | 2 | 2.0% | 0.874 | 0.878 | 0.716 |
| `checkbox_employment_changes_spouse_no` | 99 | 2 | 2.0% | 0.956 | 0.955 | 0.978 |
| `checkbox_employment_changes_spouse_yes` | 99 | 2 | 2.0% | 0.954 | 0.954 | 0.980 |
| `checkbox_work_yes` | 99 | 1 | 1.0% | 0.956 | 0.955 | 0.984 |
| `checkbox_shelter_yes` | 99 | 1 | 1.0% | 0.961 | 0.962 | 0.836 |
| `spouse_child_support` | 99 | 1 | 1.0% | 0.899 | 0.898 | 0.952 |
| `checkbox_work_spouse_yes` | 99 | 1 | 1.0% | 0.940 | 0.940 | 0.979 |
| `checkbox_school_spouse_yes` | 99 | 1 | 1.0% | 0.949 | 0.949 | 0.980 |
| `checkbox_need_assistance_no` | 99 | 1 | 1.0% | 0.968 | 0.972 | 0.600 |
| `checkbox_need_assistance_yes` | 99 | 1 | 1.0% | 0.974 | 0.978 | 0.610 |
| `checkbox_employment_changes_no` | 99 | 1 | 1.0% | 0.962 | 0.962 | 0.988 |
| `spouse_student_funding_loans_bursaries` | 99 | 1 | 1.0% | 0.861 | 0.860 | 0.952 |
| `checkbox_work_no` | 99 | 0 | 0.0% | 0.946 | 0.946 | — |
| `checkbox_moved_yes` | 99 | 0 | 0.0% | 0.952 | 0.952 | — |
| `checkbox_school_no` | 99 | 0 | 0.0% | 0.957 | 0.957 | — |
| `checkbox_school_yes` | 99 | 0 | 0.0% | 0.946 | 0.946 | — |
| `checkbox_shelter_no` | 99 | 0 | 0.0% | 0.968 | 0.968 | — |
| `checkbox_warrant_yes` | 99 | 0 | 0.0% | 0.963 | 0.963 | — |
| `checkbox_dependants_no` | 99 | 0 | 0.0% | 0.980 | 0.980 | — |
| `checkbox_dependants_yes` | 99 | 0 | 0.0% | 0.979 | 0.979 | — |
| `checkbox_family_assets_no` | 99 | 0 | 0.0% | 0.963 | 0.963 | — |
| `checkbox_family_assets_yes` | 99 | 0 | 0.0% | 0.964 | 0.964 | — |
| `checkbox_employment_changes_yes` | 99 | 0 | 0.0% | 0.958 | 0.958 | — |

## Confidence-threshold trade-offs

For each field with errors, the smallest review-gate threshold that catches the target fraction of errors, plus how many correct predictions would be flagged for review at that threshold (false positives). Gate semantics: `flagged := confidence < threshold`.

| Field | Errors | 100% capture: threshold | 100% FP | 80% capture: threshold | 80% FP | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `signature` | 54 | 0.87 (54/54) | 42/45 | 0.60 (44/54) | 6/45 | ⚠ overlap |
| `spouse_name` | 41 | 0.97 (41/41) | 51/58 | 0.84 (34/41) | 6/58 | ⚠ overlap |
| `explain_changes` | 37 | 0.95 (37/37) | 19/62 | 0.90 (31/37) | 11/62 | ⚠ overlap |
| `date` | 35 | 1.00 (35/35) | 64/64 | 1.00 (35/35) | 64/64 | ⚠ overlap |
| `spouse_signature` | 35 | 0.95 (35/35) | 30/64 | 0.80 (28/35) | 9/64 | ⚠ overlap |
| `name` | 33 | 1.00 (33/33) | 66/66 | 0.99 (32/33) | 64/66 | ⚠ overlap |
| `case_id` | 31 | 0.96 (31/31) | 59/68 | 0.94 (26/31) | 20/68 | ⚠ overlap |
| `applicant_net_employment_income` | 29 | 1.00 (29/29) | 70/70 | 0.95 (24/29) | 39/70 | ⚠ overlap |
| `spouse_phone` | 26 | 0.95 (26/26) | 32/73 | 0.88 (21/26) | 20/73 | ⚠ overlap |
| `phone` | 25 | 0.98 (25/25) | 74/74 | 0.98 (22/25) | 65/74 | ⚠ overlap |
| `sin` | 24 | 1.00 (24/24) | 75/75 | 0.99 (23/24) | 70/75 | ⚠ overlap |
| `applicant_child_support` | 22 | 0.97 (22/22) | 76/77 | 0.91 (18/22) | 55/77 | ⚠ overlap |
| `applicant_tax_credits_gst_credit` | 22 | 1.00 (22/22) | 75/77 | 1.00 (22/22) | 75/77 | ⚠ overlap |
| `applicant_canada_pension_plan_cpp` | 22 | 0.99 (22/22) | 75/77 | 0.94 (18/22) | 70/77 | ⚠ overlap |
| `applicant_spousal_support_alimony` | 22 | 0.97 (22/22) | 76/77 | 0.90 (18/22) | 73/77 | ⚠ overlap |
| `applicant_income_of_dependent_children` | 22 | 0.99 (22/22) | 56/77 | 0.98 (19/22) | 41/77 | ⚠ overlap |
| `spouse_sin` | 21 | 0.95 (21/21) | 45/78 | 0.90 (17/21) | 37/78 | ⚠ overlap |
| `applicant_income_tax_refund` | 21 | 0.97 (21/21) | 76/78 | 0.90 (17/21) | 48/78 | ⚠ overlap |
| `applicant_private_pensions_retirement_disability` | 21 | 0.97 (21/21) | 77/78 | 0.90 (17/21) | 46/78 | ⚠ overlap |
| `spouse_other_income_money_received` | 20 | 0.77 (20/20) | 18/79 | 0.62 (16/20) | 17/79 | ⚠ overlap |
| `applicant_other_income_money_received` | 20 | 1.00 (20/20) | 79/79 | 1.00 (20/20) | 79/79 | ⚠ overlap |
| `applicant_student_funding_loans_bursaries` | 20 | 0.98 (20/20) | 77/79 | 0.91 (16/20) | 72/79 | ⚠ overlap |
| `applicant_oas_gis` | 19 | 0.99 (19/19) | 79/80 | 0.89 (16/19) | 27/80 | ⚠ overlap |
| `applicant_rental_income` | 19 | 0.99 (19/19) | 79/80 | 0.91 (16/19) | 75/80 | ⚠ overlap |
| `applicant_child_tax_benefits` | 19 | 0.90 (19/19) | 76/80 | 0.90 (17/19) | 68/80 | ⚠ overlap |
| `applicant_workbc_financial_support` | 19 | 0.96 (19/19) | 78/80 | 0.96 (17/19) | 76/80 | ⚠ overlap |
| `applicant_room_board_income` | 17 | 0.97 (17/17) | 81/82 | 0.85 (14/17) | 69/82 | ⚠ overlap |
| `applicant_trust_income` | 15 | 0.99 (15/15) | 83/84 | 0.95 (13/15) | 79/84 | ⚠ overlap |
| `applicant_employment_insurance` | 15 | 1.00 (15/15) | 84/84 | 0.98 (12/15) | 25/84 | ⚠ overlap |
| `applicant_workers_compensation` | 14 | 0.96 (14/14) | 84/85 | 0.95 (12/14) | 81/85 | ⚠ overlap |
| `spouse_date` | 11 | 0.95 (11/11) | 37/88 | 0.95 (9/11) | 33/88 | ⚠ overlap |
| `spouse_net_employment_income` | 9 | 1.00 (9/9) | 90/90 | 1.00 (8/9) | 86/90 | ⚠ overlap |
| `checkbox_warrant_no` | 4 | 0.99 (4/4) | 84/95 | 0.99 (4/4) | 84/95 | ⚠ overlap |
| `spouse_rental_income` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `spouse_oas_gis` | 3 | 1.00 (3/3) | 89/96 | 1.00 (3/3) | 89/96 | ⚠ overlap |
| `checkbox_moved_no` | 3 | 0.99 (3/3) | 86/96 | 0.99 (3/3) | 86/96 | ⚠ overlap |
| `spouse_trust_income` | 3 | 0.98 (3/3) | 83/96 | 0.98 (3/3) | 83/96 | ⚠ overlap |
| `checkbox_moved_spouse_no` | 3 | 0.99 (3/3) | 89/96 | 0.99 (3/3) | 89/96 | ⚠ overlap |
| `spouse_income_tax_refund` | 3 | 1.00 (3/3) | 96/96 | 1.00 (3/3) | 96/96 | ⚠ overlap |
| `spouse_room_board_income` | 3 | 0.50 (3/3) | 3/96 | 0.50 (3/3) | 3/96 | ⚠ overlap |
| `checkbox_moved_spouse_yes` | 3 | 0.98 (3/3) | 58/96 | 0.98 (3/3) | 58/96 | ⚠ overlap |
| `checkbox_warrant_spouse_no` | 3 | 0.99 (3/3) | 77/96 | 0.99 (3/3) | 77/96 | ⚠ overlap |
| `spouse_employment_insurance` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `spouse_private_pensions_retirement_disability` | 3 | 0.90 (3/3) | 10/96 | 0.90 (3/3) | 10/96 | ⚠ overlap |
| `checkbox_work_spouse_no` | 2 | 0.99 (2/2) | 80/97 | 0.99 (2/2) | 80/97 | ⚠ overlap |
| `checkbox_school_spouse_no` | 2 | 0.99 (2/2) | 76/97 | 0.99 (2/2) | 76/97 | ⚠ overlap |
| `spouse_child_tax_benefits` | 2 | 0.88 (2/2) | 6/97 | 0.88 (2/2) | 6/97 | ⚠ overlap |
| `checkbox_warrant_spouse_yes` | 2 | 0.99 (2/2) | 91/97 | 0.99 (2/2) | 91/97 | ⚠ overlap |
| `spouse_workers_compensation` | 2 | 0.96 (2/2) | 87/97 | 0.96 (2/2) | 87/97 | ⚠ overlap |
| `spouse_tax_credits_gst_credit` | 2 | 0.50 (2/2) | 1/97 | 0.50 (2/2) | 1/97 | ⚠ overlap |
| `spouse_canada_pension_plan_cpp` | 2 | 1.00 (2/2) | 97/97 | 1.00 (2/2) | 97/97 | ⚠ overlap |
| `spouse_spousal_support_alimony` | 2 | 0.96 (2/2) | 91/97 | 0.96 (2/2) | 91/97 | ⚠ overlap |
| `spouse_workbc_financial_support` | 2 | 0.95 (2/2) | 21/97 | 0.95 (2/2) | 21/97 | ⚠ overlap |
| `checkbox_employment_changes_spouse_no` | 2 | 0.99 (2/2) | 73/97 | 0.99 (2/2) | 73/97 | ⚠ overlap |
| `checkbox_employment_changes_spouse_yes` | 2 | 0.99 (2/2) | 76/97 | 0.99 (2/2) | 76/97 | ⚠ overlap |
| `checkbox_work_yes` | 1 | 0.99 (1/1) | 88/98 | 0.99 (1/1) | 88/98 | ⚠ overlap |
| `checkbox_shelter_yes` | 1 | 0.84 (1/1) | 6/98 | 0.84 (1/1) | 6/98 | ⚠ overlap |
| `spouse_child_support` | 1 | 0.96 (1/1) | 96/98 | 0.96 (1/1) | 96/98 | ⚠ overlap |
| `checkbox_work_spouse_yes` | 1 | 0.98 (1/1) | 57/98 | 0.98 (1/1) | 57/98 | ⚠ overlap |
| `checkbox_school_spouse_yes` | 1 | 0.99 (1/1) | 75/98 | 0.99 (1/1) | 75/98 | ⚠ overlap |
| `checkbox_need_assistance_no` | 1 | 0.61 (1/1) | 1/98 | 0.61 (1/1) | 1/98 | ⚠ overlap |
| `checkbox_need_assistance_yes` | 1 | 0.62 (1/1) | 0/98 | 0.62 (1/1) | 0/98 | — |
| `checkbox_employment_changes_no` | 1 | 0.99 (1/1) | 78/98 | 0.99 (1/1) | 78/98 | ⚠ overlap |
| `spouse_student_funding_loans_bursaries` | 1 | 0.96 (1/1) | 98/98 | 0.96 (1/1) | 98/98 | ⚠ overlap |

> ⚠ **Confidence overlap**: for fields marked `overlap`, at least one correct prediction sits at or below the highest error confidence. Pure confidence gating cannot perfectly separate errors from correct predictions for these — review the underlying samples.

## Error types: missing, extra, wrong

Each error is classified by emptiness on each side. The three failure modes usually have different root causes, so the split is a much better fix-prioritization signal than the raw error count.

- **Missing** — `expected` has a value but `predicted` is null or empty. The field exists in the document but the model didn't return it. Root cause is usually **extraction failure** (model missed the region, OCR dropped the text, or the prompt didn't ask for the field).
- **Extra** — `expected` is null or empty but `predicted` has a value. The model returned something for a field that should have been blank. Root cause is usually **hallucination / over-extraction** (model pulled in adjacent text, invented a value, or didn't recognize that the field was intentionally left empty).
- **Wrong** — both `expected` and `predicted` have values but they don't match. Root cause is usually a **parsing, normalization, or interpretation bug** (date format, whitespace, units, picked the wrong region of the document).

Overall: **184 missing** (22.2%), **243 extra** (29.3%), **402 wrong** (48.5%) of 829 total errors.

| Field | Errors | Missing | Extra | Wrong |
| --- | ---: | ---: | ---: | ---: |
| `signature` | 54 | 0 | 24 | 30 |
| `spouse_name` | 41 | 1 | 33 | 7 |
| `explain_changes` | 37 | 0 | 13 | 24 |
| `date` | 35 | 0 | 1 | 34 |
| `spouse_signature` | 35 | 0 | 33 | 2 |
| `name` | 33 | 0 | 1 | 32 |
| `case_id` | 31 | 3 | 21 | 7 |
| `applicant_net_employment_income` | 29 | 11 | 1 | 17 |
| `spouse_phone` | 26 | 0 | 24 | 2 |
| `phone` | 25 | 0 | 4 | 21 |
| `sin` | 24 | 0 | 6 | 18 |
| `applicant_child_support` | 22 | 8 | 1 | 13 |
| `applicant_tax_credits_gst_credit` | 22 | 10 | 2 | 10 |
| `applicant_canada_pension_plan_cpp` | 22 | 9 | 1 | 12 |
| `applicant_spousal_support_alimony` | 22 | 9 | 3 | 10 |
| `applicant_income_of_dependent_children` | 22 | 9 | 1 | 12 |
| `spouse_sin` | 21 | 0 | 17 | 4 |
| `applicant_income_tax_refund` | 21 | 7 | 1 | 13 |
| `applicant_private_pensions_retirement_disability` | 21 | 10 | 1 | 10 |
| `spouse_other_income_money_received` | 20 | 0 | 19 | 1 |
| `applicant_other_income_money_received` | 20 | 10 | 1 | 9 |
| `applicant_student_funding_loans_bursaries` | 20 | 11 | 1 | 8 |
| `applicant_oas_gis` | 19 | 10 | 1 | 8 |
| `applicant_rental_income` | 19 | 9 | 1 | 9 |
| `applicant_child_tax_benefits` | 19 | 5 | 1 | 13 |
| `applicant_workbc_financial_support` | 19 | 10 | 2 | 7 |
| `applicant_room_board_income` | 17 | 8 | 1 | 8 |
| `applicant_trust_income` | 15 | 9 | 1 | 5 |
| `applicant_employment_insurance` | 15 | 10 | 1 | 4 |
| `applicant_workers_compensation` | 14 | 8 | 1 | 5 |
| `spouse_date` | 11 | 0 | 8 | 3 |
| `spouse_net_employment_income` | 9 | 1 | 5 | 3 |
| `checkbox_warrant_no` | 4 | 3 | 0 | 1 |
| `spouse_rental_income` | 4 | 1 | 1 | 2 |
| `spouse_oas_gis` | 3 | 0 | 1 | 2 |
| `checkbox_moved_no` | 3 | 1 | 0 | 2 |
| `spouse_trust_income` | 3 | 0 | 1 | 2 |
| `checkbox_moved_spouse_no` | 3 | 0 | 0 | 3 |
| `spouse_income_tax_refund` | 3 | 0 | 0 | 3 |
| `spouse_room_board_income` | 3 | 0 | 2 | 1 |
| `checkbox_moved_spouse_yes` | 3 | 1 | 0 | 2 |
| `checkbox_warrant_spouse_no` | 3 | 1 | 0 | 2 |
| `spouse_employment_insurance` | 3 | 1 | 0 | 2 |
| `spouse_private_pensions_retirement_disability` | 3 | 2 | 1 | 0 |
| `checkbox_work_spouse_no` | 2 | 0 | 0 | 2 |
| `checkbox_school_spouse_no` | 2 | 0 | 0 | 2 |
| `spouse_child_tax_benefits` | 2 | 1 | 1 | 0 |
| `checkbox_warrant_spouse_yes` | 2 | 0 | 0 | 2 |
| `spouse_workers_compensation` | 2 | 1 | 0 | 1 |
| `spouse_tax_credits_gst_credit` | 2 | 0 | 2 | 0 |
| `spouse_canada_pension_plan_cpp` | 2 | 0 | 1 | 1 |
| `spouse_spousal_support_alimony` | 2 | 1 | 1 | 0 |
| `spouse_workbc_financial_support` | 2 | 1 | 1 | 0 |
| `checkbox_employment_changes_spouse_no` | 2 | 0 | 0 | 2 |
| `checkbox_employment_changes_spouse_yes` | 2 | 0 | 0 | 2 |
| `checkbox_work_yes` | 1 | 0 | 0 | 1 |
| `checkbox_shelter_yes` | 1 | 0 | 0 | 1 |
| `spouse_child_support` | 1 | 1 | 0 | 0 |
| `checkbox_work_spouse_yes` | 1 | 0 | 0 | 1 |
| `checkbox_school_spouse_yes` | 1 | 0 | 0 | 1 |
| `checkbox_need_assistance_no` | 1 | 0 | 0 | 1 |
| `checkbox_need_assistance_yes` | 1 | 0 | 0 | 1 |
| `checkbox_employment_changes_no` | 1 | 0 | 0 | 1 |
| `spouse_student_funding_loans_bursaries` | 1 | 1 | 0 | 0 |

## Cross-field error correlation

### Errors per sample

98 of 99 samples have at least one error. Top sample has **25** errors; mean across samples-with-errors is **8.5**.

> Errors are spread fairly evenly across samples. The underlying cause is more likely field-level (specific extraction or parsing bugs) than document-level.

| Sample | Errors | Failed fields |
| --- | ---: | --- |
| `CX_FILE_ATT_1-12ZYMVJU_1-1525GDE` | 25 | `spouse_name`, `explain_changes`, `date`, `spouse_signature`, `name`, `applicant_net_employment_income` _+19 more_ |
| `CX_FILE_ATT_1-12YMGHNN_1-14Z0C6R` | 22 | `signature`, `spouse_signature`, `case_id`, `applicant_net_employment_income`, `phone`, `applicant_child_support` _+16 more_ |
| `CX_FILE_ATT_1-12WX19CT_1-14UUZ1J` | 22 | `signature`, `spouse_name`, `case_id`, `applicant_net_employment_income`, `applicant_child_support`, `applicant_tax_credits_gst_credit` _+16 more_ |
| `CX_FILE_ATT_1-12Z0OKTI_1-1501V71` | 22 | `date`, `spouse_signature`, `name`, `case_id`, `applicant_net_employment_income`, `applicant_child_support` _+16 more_ |
| `CX_FILE_ATT_1-12ZFKET9_1-150ZDUO` | 21 | `signature`, `spouse_name`, `explain_changes`, `spouse_signature`, `applicant_net_employment_income`, `applicant_child_support` _+15 more_ |
| `CX_FILE_ATT_1-12U85NGF_1-14OYI00` | 21 | `signature`, `spouse_name`, `explain_changes`, `spouse_signature`, `case_id`, `applicant_net_employment_income` _+15 more_ |
| `CX_FILE_ATT_1-12UOS1F3_1-14PRY7S` | 20 | `signature`, `spouse_name`, `explain_changes`, `date`, `spouse_signature`, `name` _+14 more_ |
| `CX_FILE_ATT_1-12Z4KMGT_1-15093LA` | 20 | `spouse_name`, `date`, `name`, `applicant_net_employment_income`, `applicant_child_support`, `applicant_canada_pension_plan_cpp` _+14 more_ |
| `CX_FILE_ATT_1-12ZO1OWL_1-151EJ0P` | 19 | `signature`, `spouse_name`, `date`, `spouse_signature`, `name`, `case_id` _+13 more_ |
| `CX_FILE_ATT_1-12YMPHXJ_1-14YZQW2` | 19 | `signature`, `date`, `applicant_net_employment_income`, `applicant_child_support`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp` _+13 more_ |
| `CX_FILE_ATT_1-12ZXMJDG_1-1525SSJ` | 19 | `spouse_name`, `spouse_signature`, `applicant_net_employment_income`, `applicant_child_support`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp` _+13 more_ |
| `CX_FILE_ATT_1-12U78897_1-14OWDWQ` | 19 | `date`, `applicant_net_employment_income`, `applicant_child_support`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_spousal_support_alimony` _+13 more_ |
| `CX_FILE_ATT_1-12UEFDZY_1-14P89AU` | 16 | `signature`, `explain_changes`, `date`, `name`, `applicant_net_employment_income`, `phone` _+10 more_ |
| `CX_FILE_ATT_1-12ZBJEKC_1-150NKNJ` | 16 | `signature`, `spouse_name`, `spouse_signature`, `case_id`, `phone`, `applicant_tax_credits_gst_credit` _+10 more_ |
| `CX_FILE_ATT_1-12UEKMDX_1-14P7SDB` | 15 | `explain_changes`, `case_id`, `spouse_phone`, `sin`, `applicant_spousal_support_alimony`, `applicant_income_tax_refund` _+9 more_ |
| _… 83 more samples_ | | |

### Co-failing field pairs

Pairs of fields that failed in the same sample at least twice. Strong pairs often share a structural cause (same region of the document, same parsing rule, etc.).

| Field A | Field B | Co-failures |
| --- | --- | ---: |
| `signature` | `spouse_name` | 27 |
| `spouse_name` | `spouse_signature` | 26 |
| `signature` | `spouse_signature` | 24 |
| `explain_changes` | `signature` | 23 |
| `case_id` | `signature` | 20 |
| `date` | `signature` | 20 |
| `applicant_net_employment_income` | `explain_changes` | 18 |
| `explain_changes` | `spouse_name` | 18 |
| `name` | `signature` | 18 |
| `applicant_net_employment_income` | `signature` | 17 |
| `name` | `spouse_name` | 17 |
| `spouse_name` | `spouse_phone` | 17 |
| `spouse_name` | `spouse_sin` | 17 |
| `applicant_income_of_dependent_children` | `applicant_net_employment_income` | 16 |
| `applicant_net_employment_income` | `spouse_name` | 16 |

## Other observations

### Confidence calibration

Average confidence on **correct** predictions across all fields: 0.913

Average confidence on **error** predictions across all fields: 0.747

Gap (correct − error): **0.167**. Modest gap → confidence helps but is far from definitive.

### Top error contributors

- `signature` — 54/99 errors (54.5%), avg error conf 0.421
- `spouse_name` — 41/99 errors (41.4%), avg error conf 0.652
- `explain_changes` — 37/99 errors (37.4%), avg error conf 0.678
- `date` — 35/99 errors (35.4%), avg error conf 0.959
- `spouse_signature` — 35/99 errors (35.4%), avg error conf 0.640




## 11.2 Neural Custom Model on Azure Document Intelligence (V2 strict) — detailed results

_Generated from the trained_ `sdpr-monthly-prod-neural-v2` _model against the same_ _99-document sample as 11.1. Re-run on 2026-05-15; analysis re-computed with_ `scripts/benchmark analysis/analyze.js`. _Same metric definitions and methodology as 11.1._

# Benchmark Run Analysis

Generated from `benchmark-result-neural.json` on 2026-05-17T04:24:49.547Z.

## Run

| Property | Value |
| --- | --- |
| Definition | 100-doc-simple-neural-v2 |
| Run ID | `dfaddb26-cf91-4afa-aef8-c1ddeec42cc1` |
| Status | completed |
| Started | 2026-05-15T22:24:27.091Z |
| Completed | 2026-05-15T22:28:26.590Z |
| Duration | 3m 59s |
| Samples (passed / failed) | 99 (3 / 96) |

## Overall (recomputed from perFieldResults)

| Metric | Value |
| --- | --- |
| Fields total | 75 |
| Fields with errors | 64 |
| Fields perfect (0 errors) | 11 |
| Total field evaluations | 7425 |
| Total correct | 6802 |
| Total errors | 623 |
| Micro accuracy (instance-weighted) | 91.6% |
| Micro error rate | 8.4% |
| Macro accuracy (field-weighted) | 91.6% |

> Macro accuracy treats every field equally regardless of how many instances each has; micro accuracy weights by instance count. The gap between them tells you whether errors concentrate in a few fields (large gap) or spread evenly (small gap).

## Per-field results

Sorted by error rate (worst first). Confidence values are 0–1.

| Field | Evaluated | Errors | Error rate | Avg conf | Avg conf (correct) | Avg conf (errors) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `name` | 99 | 30 | 30.3% | 0.644 | 0.718 | 0.473 |
| `applicant_net_employment_income` | 99 | 28 | 28.3% | 0.802 | 0.818 | 0.762 |
| `explain_changes` | 99 | 25 | 25.3% | 0.807 | 0.940 | 0.415 |
| `applicant_tax_credits_gst_credit` | 99 | 23 | 23.2% | 0.781 | 0.807 | 0.694 |
| `applicant_canada_pension_plan_cpp` | 99 | 23 | 23.2% | 0.831 | 0.844 | 0.789 |
| `signature` | 99 | 22 | 22.2% | 0.376 | 0.418 | 0.230 |
| `applicant_rental_income` | 99 | 22 | 22.2% | 0.807 | 0.841 | 0.689 |
| `applicant_income_tax_refund` | 99 | 22 | 22.2% | 0.804 | 0.817 | 0.756 |
| `applicant_spousal_support_alimony` | 99 | 22 | 22.2% | 0.791 | 0.822 | 0.682 |
| `applicant_private_pensions_retirement_disability` | 99 | 22 | 22.2% | 0.800 | 0.825 | 0.712 |
| `sin` | 99 | 21 | 21.2% | 0.823 | 0.886 | 0.589 |
| `phone` | 99 | 21 | 21.2% | 0.835 | 0.877 | 0.678 |
| `applicant_child_tax_benefits` | 99 | 21 | 21.2% | 0.803 | 0.832 | 0.697 |
| `applicant_income_of_dependent_children` | 99 | 21 | 21.2% | 0.809 | 0.811 | 0.802 |
| `applicant_oas_gis` | 99 | 20 | 20.2% | 0.788 | 0.797 | 0.752 |
| `applicant_child_support` | 99 | 20 | 20.2% | 0.819 | 0.853 | 0.683 |
| `applicant_workbc_financial_support` | 99 | 20 | 20.2% | 0.804 | 0.824 | 0.723 |
| `applicant_other_income_money_received` | 99 | 20 | 20.2% | 0.793 | 0.785 | 0.823 |
| `applicant_student_funding_loans_bursaries` | 99 | 20 | 20.2% | 0.792 | 0.806 | 0.740 |
| `date` | 99 | 18 | 18.2% | 0.852 | 0.886 | 0.702 |
| `applicant_room_board_income` | 99 | 18 | 18.2% | 0.802 | 0.815 | 0.745 |
| `applicant_workers_compensation` | 99 | 18 | 18.2% | 0.783 | 0.797 | 0.720 |
| `applicant_trust_income` | 99 | 17 | 17.2% | 0.817 | 0.815 | 0.826 |
| `applicant_employment_insurance` | 99 | 14 | 14.1% | 0.809 | 0.833 | 0.660 |
| `case_id` | 99 | 9 | 9.1% | 0.947 | 0.964 | 0.774 |
| `spouse_name` | 99 | 8 | 8.1% | 0.927 | 0.962 | 0.519 |
| `spouse_signature` | 99 | 7 | 7.1% | 0.864 | 0.901 | 0.379 |
| `spouse_sin` | 99 | 6 | 6.1% | 0.956 | 0.978 | 0.615 |
| `spouse_net_employment_income` | 99 | 5 | 5.1% | 0.938 | 0.960 | 0.522 |
| `checkbox_moved_spouse_no` | 99 | 4 | 4.0% | 0.957 | 0.970 | 0.658 |
| `spouse_income_tax_refund` | 99 | 4 | 4.0% | 0.919 | 0.950 | 0.182 |
| `spouse_employment_insurance` | 99 | 4 | 4.0% | 0.957 | 0.974 | 0.567 |
| `spouse_workers_compensation` | 99 | 4 | 4.0% | 0.950 | 0.964 | 0.626 |
| `spouse_phone` | 99 | 3 | 3.0% | 0.955 | 0.971 | 0.433 |
| `spouse_oas_gis` | 99 | 3 | 3.0% | 0.939 | 0.960 | 0.288 |
| `spouse_trust_income` | 99 | 3 | 3.0% | 0.940 | 0.962 | 0.220 |
| `spouse_rental_income` | 99 | 3 | 3.0% | 0.926 | 0.943 | 0.359 |
| `checkbox_work_spouse_yes` | 99 | 3 | 3.0% | 0.952 | 0.965 | 0.546 |
| `spouse_room_board_income` | 99 | 3 | 3.0% | 0.927 | 0.946 | 0.304 |
| `checkbox_school_spouse_no` | 99 | 3 | 3.0% | 0.961 | 0.969 | 0.693 |
| `spouse_canada_pension_plan_cpp` | 99 | 3 | 3.0% | 0.941 | 0.953 | 0.572 |
| `spouse_other_income_money_received` | 99 | 3 | 3.0% | 0.946 | 0.956 | 0.600 |
| `spouse_student_funding_loans_bursaries` | 99 | 3 | 3.0% | 0.949 | 0.959 | 0.603 |
| `spouse_private_pensions_retirement_disability` | 99 | 3 | 3.0% | 0.964 | 0.963 | 0.986 |
| `spouse_date` | 99 | 2 | 2.0% | 0.966 | 0.973 | 0.655 |
| `checkbox_work_no` | 99 | 2 | 2.0% | 0.935 | 0.944 | 0.482 |
| `spouse_child_support` | 99 | 2 | 2.0% | 0.940 | 0.944 | 0.772 |
| `checkbox_work_spouse_no` | 99 | 2 | 2.0% | 0.960 | 0.967 | 0.637 |
| `checkbox_moved_spouse_yes` | 99 | 2 | 2.0% | 0.948 | 0.948 | 0.963 |
| `checkbox_school_spouse_yes` | 99 | 2 | 2.0% | 0.954 | 0.961 | 0.641 |
| `checkbox_warrant_spouse_yes` | 99 | 2 | 2.0% | 0.956 | 0.957 | 0.944 |
| `spouse_spousal_support_alimony` | 99 | 2 | 2.0% | 0.960 | 0.967 | 0.617 |
| `spouse_workbc_financial_support` | 99 | 2 | 2.0% | 0.941 | 0.946 | 0.669 |
| `checkbox_employment_changes_spouse_no` | 99 | 2 | 2.0% | 0.963 | 0.964 | 0.906 |
| `checkbox_employment_changes_spouse_yes` | 99 | 2 | 2.0% | 0.967 | 0.968 | 0.920 |
| `checkbox_moved_no` | 99 | 1 | 1.0% | 0.969 | 0.969 | 0.978 |
| `checkbox_work_yes` | 99 | 1 | 1.0% | 0.969 | 0.974 | 0.490 |
| `checkbox_shelter_no` | 99 | 1 | 1.0% | 0.966 | 0.971 | 0.451 |
| `checkbox_shelter_yes` | 99 | 1 | 1.0% | 0.967 | 0.967 | 0.915 |
| `spouse_child_tax_benefits` | 99 | 1 | 1.0% | 0.965 | 0.965 | 0.987 |
| `checkbox_warrant_spouse_no` | 99 | 1 | 1.0% | 0.957 | 0.961 | 0.528 |
| `checkbox_need_assistance_no` | 99 | 1 | 1.0% | 0.958 | 0.959 | 0.911 |
| `checkbox_need_assistance_yes` | 99 | 1 | 1.0% | 0.961 | 0.961 | 0.970 |
| `spouse_tax_credits_gst_credit` | 99 | 1 | 1.0% | 0.945 | 0.950 | 0.378 |
| `checkbox_moved_yes` | 99 | 0 | 0.0% | 0.958 | 0.958 | — |
| `checkbox_school_no` | 99 | 0 | 0.0% | 0.966 | 0.966 | — |
| `checkbox_school_yes` | 99 | 0 | 0.0% | 0.966 | 0.966 | — |
| `checkbox_warrant_no` | 99 | 0 | 0.0% | 0.969 | 0.969 | — |
| `checkbox_warrant_yes` | 99 | 0 | 0.0% | 0.954 | 0.954 | — |
| `checkbox_dependants_no` | 99 | 0 | 0.0% | 0.968 | 0.968 | — |
| `checkbox_dependants_yes` | 99 | 0 | 0.0% | 0.962 | 0.962 | — |
| `checkbox_family_assets_no` | 99 | 0 | 0.0% | 0.972 | 0.972 | — |
| `checkbox_family_assets_yes` | 99 | 0 | 0.0% | 0.965 | 0.965 | — |
| `checkbox_employment_changes_no` | 99 | 0 | 0.0% | 0.971 | 0.971 | — |
| `checkbox_employment_changes_yes` | 99 | 0 | 0.0% | 0.968 | 0.968 | — |

## Confidence-threshold trade-offs

For each field with errors, the smallest review-gate threshold that catches the target fraction of errors, plus how many correct predictions would be flagged for review at that threshold (false positives). Gate semantics: `flagged := confidence < threshold`.

| Field | Errors | 100% capture: threshold | 100% FP | 80% capture: threshold | 80% FP | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `name` | 30 | 0.90 (30/30) | 49/69 | 0.61 (24/30) | 20/69 | ⚠ overlap |
| `applicant_net_employment_income` | 28 | 0.98 (28/28) | 69/71 | 0.98 (28/28) | 69/71 | ⚠ overlap |
| `explain_changes` | 25 | 0.86 (25/25) | 6/74 | 0.62 (20/25) | 1/74 | ⚠ overlap |
| `applicant_tax_credits_gst_credit` | 23 | 0.98 (23/23) | 76/76 | 0.98 (23/23) | 76/76 | ⚠ overlap |
| `applicant_canada_pension_plan_cpp` | 23 | 0.98 (23/23) | 76/76 | 0.98 (23/23) | 76/76 | ⚠ overlap |
| `signature` | 22 | 0.95 (22/22) | 63/77 | 0.47 (18/22) | 43/77 | ⚠ overlap |
| `applicant_rental_income` | 22 | 0.99 (22/22) | 77/77 | 0.99 (20/22) | 73/77 | ⚠ overlap |
| `applicant_income_tax_refund` | 22 | 0.99 (22/22) | 77/77 | 0.99 (21/22) | 73/77 | ⚠ overlap |
| `applicant_spousal_support_alimony` | 22 | 0.99 (22/22) | 77/77 | 0.98 (21/22) | 74/77 | ⚠ overlap |
| `applicant_private_pensions_retirement_disability` | 22 | 0.99 (22/22) | 77/77 | 0.99 (21/22) | 73/77 | ⚠ overlap |
| `sin` | 21 | 0.97 (21/21) | 52/78 | 0.72 (17/21) | 6/78 | ⚠ overlap |
| `phone` | 21 | 0.96 (21/21) | 56/78 | 0.92 (17/21) | 37/78 | ⚠ overlap |
| `applicant_child_tax_benefits` | 21 | 0.99 (21/21) | 78/78 | 0.99 (21/21) | 78/78 | ⚠ overlap |
| `applicant_income_of_dependent_children` | 21 | 0.98 (21/21) | 78/78 | 0.98 (19/21) | 74/78 | ⚠ overlap |
| `applicant_oas_gis` | 20 | 0.99 (20/20) | 79/79 | 0.99 (20/20) | 79/79 | ⚠ overlap |
| `applicant_child_support` | 20 | 0.99 (20/20) | 79/79 | 0.98 (19/20) | 76/79 | ⚠ overlap |
| `applicant_workbc_financial_support` | 20 | 0.98 (20/20) | 79/79 | 0.98 (19/20) | 75/79 | ⚠ overlap |
| `applicant_other_income_money_received` | 20 | 0.97 (20/20) | 77/79 | 0.97 (20/20) | 77/79 | ⚠ overlap |
| `applicant_student_funding_loans_bursaries` | 20 | 0.99 (20/20) | 79/79 | 0.99 (20/20) | 79/79 | ⚠ overlap |
| `date` | 18 | 0.98 (18/18) | 76/81 | 0.94 (15/18) | 37/81 | ⚠ overlap |
| `applicant_room_board_income` | 18 | 0.99 (18/18) | 81/81 | 0.98 (16/18) | 77/81 | ⚠ overlap |
| `applicant_workers_compensation` | 18 | 0.99 (18/18) | 79/81 | 0.99 (18/18) | 79/81 | ⚠ overlap |
| `applicant_trust_income` | 17 | 0.99 (17/17) | 82/82 | 0.99 (17/17) | 82/82 | ⚠ overlap |
| `applicant_employment_insurance` | 14 | 0.98 (14/14) | 84/85 | 0.98 (14/14) | 84/85 | ⚠ overlap |
| `case_id` | 9 | 0.99 (9/9) | 90/90 | 0.99 (8/9) | 28/90 | ⚠ overlap |
| `spouse_name` | 8 | 0.98 (8/8) | 26/91 | 0.68 (7/8) | 1/91 | ⚠ overlap |
| `spouse_signature` | 7 | 0.99 (7/7) | 92/92 | 0.74 (6/7) | 8/92 | ⚠ overlap |
| `spouse_sin` | 6 | 0.99 (6/6) | 93/93 | 0.90 (5/6) | 4/93 | ⚠ overlap |
| `spouse_net_employment_income` | 5 | 0.99 (5/5) | 14/94 | 0.60 (4/5) | 1/94 | ⚠ overlap |
| `checkbox_moved_spouse_no` | 4 | 0.97 (4/4) | 7/95 | 0.97 (4/4) | 7/95 | ⚠ overlap |
| `spouse_income_tax_refund` | 4 | 0.53 (4/4) | 3/95 | 0.53 (4/4) | 3/95 | ⚠ overlap |
| `spouse_employment_insurance` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `spouse_workers_compensation` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `spouse_phone` | 3 | 0.69 (3/3) | 0/96 | 0.69 (3/3) | 0/96 | — |
| `spouse_oas_gis` | 3 | 0.41 (3/3) | 1/96 | 0.41 (3/3) | 1/96 | ⚠ overlap |
| `spouse_trust_income` | 3 | 0.43 (3/3) | 1/96 | 0.43 (3/3) | 1/96 | ⚠ overlap |
| `spouse_rental_income` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `checkbox_work_spouse_yes` | 3 | 0.64 (3/3) | 0/96 | 0.64 (3/3) | 0/96 | — |
| `spouse_room_board_income` | 3 | 0.55 (3/3) | 3/96 | 0.55 (3/3) | 3/96 | ⚠ overlap |
| `checkbox_school_spouse_no` | 3 | 0.98 (3/3) | 36/96 | 0.98 (3/3) | 36/96 | ⚠ overlap |
| `spouse_canada_pension_plan_cpp` | 3 | 0.89 (3/3) | 10/96 | 0.89 (3/3) | 10/96 | ⚠ overlap |
| `spouse_other_income_money_received` | 3 | 0.92 (3/3) | 10/96 | 0.92 (3/3) | 10/96 | ⚠ overlap |
| `spouse_student_funding_loans_bursaries` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `spouse_private_pensions_retirement_disability` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `spouse_date` | 2 | 0.69 (2/2) | 1/97 | 0.69 (2/2) | 1/97 | ⚠ overlap |
| `checkbox_work_no` | 2 | 0.64 (2/2) | 2/97 | 0.64 (2/2) | 2/97 | ⚠ overlap |
| `spouse_child_support` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `checkbox_work_spouse_no` | 2 | 0.67 (2/2) | 0/97 | 0.67 (2/2) | 0/97 | — |
| `checkbox_moved_spouse_yes` | 2 | 0.98 (2/2) | 44/97 | 0.98 (2/2) | 44/97 | ⚠ overlap |
| `checkbox_school_spouse_yes` | 2 | 0.69 (2/2) | 1/97 | 0.69 (2/2) | 1/97 | ⚠ overlap |
| `checkbox_warrant_spouse_yes` | 2 | 0.98 (2/2) | 57/97 | 0.98 (2/2) | 57/97 | ⚠ overlap |
| `spouse_spousal_support_alimony` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `spouse_workbc_financial_support` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `checkbox_employment_changes_spouse_no` | 2 | 0.96 (2/2) | 10/97 | 0.96 (2/2) | 10/97 | ⚠ overlap |
| `checkbox_employment_changes_spouse_yes` | 2 | 0.96 (2/2) | 9/97 | 0.96 (2/2) | 9/97 | ⚠ overlap |
| `checkbox_moved_no` | 1 | 0.98 (1/1) | 97/98 | 0.98 (1/1) | 97/98 | ⚠ overlap |
| `checkbox_work_yes` | 1 | 0.50 (1/1) | 0/98 | 0.50 (1/1) | 0/98 | — |
| `checkbox_shelter_no` | 1 | 0.46 (1/1) | 0/98 | 0.46 (1/1) | 0/98 | — |
| `checkbox_shelter_yes` | 1 | 0.92 (1/1) | 4/98 | 0.92 (1/1) | 4/98 | ⚠ overlap |
| `spouse_child_tax_benefits` | 1 | 0.99 (1/1) | 98/98 | 0.99 (1/1) | 98/98 | ⚠ overlap |
| `checkbox_warrant_spouse_no` | 1 | 0.53 (1/1) | 0/98 | 0.53 (1/1) | 0/98 | — |
| `checkbox_need_assistance_no` | 1 | 0.92 (1/1) | 4/98 | 0.92 (1/1) | 4/98 | ⚠ overlap |
| `checkbox_need_assistance_yes` | 1 | 0.98 (1/1) | 14/98 | 0.98 (1/1) | 14/98 | ⚠ overlap |
| `spouse_tax_credits_gst_credit` | 1 | 0.38 (1/1) | 1/98 | 0.38 (1/1) | 1/98 | ⚠ overlap |

> ⚠ **Confidence overlap**: for fields marked `overlap`, at least one correct prediction sits at or below the highest error confidence. Pure confidence gating cannot perfectly separate errors from correct predictions for these — review the underlying samples.

## Error types: missing, extra, wrong

Each error is classified by emptiness on each side. The three failure modes usually have different root causes, so the split is a much better fix-prioritization signal than the raw error count.

- **Missing** — `expected` has a value but `predicted` is null or empty. The field exists in the document but the model didn't return it. Root cause is usually **extraction failure** (model missed the region, OCR dropped the text, or the prompt didn't ask for the field).
- **Extra** — `expected` is null or empty but `predicted` has a value. The model returned something for a field that should have been blank. Root cause is usually **hallucination / over-extraction** (model pulled in adjacent text, invented a value, or didn't recognize that the field was intentionally left empty).
- **Wrong** — both `expected` and `predicted` have values but they don't match. Root cause is usually a **parsing, normalization, or interpretation bug** (date format, whitespace, units, picked the wrong region of the document).

Overall: **225 missing** (36.1%), **46 extra** (7.4%), **352 wrong** (56.5%) of 623 total errors.

| Field | Errors | Missing | Extra | Wrong |
| --- | ---: | ---: | ---: | ---: |
| `name` | 30 | 0 | 1 | 29 |
| `applicant_net_employment_income` | 28 | 18 | 0 | 10 |
| `explain_changes` | 25 | 0 | 0 | 25 |
| `applicant_tax_credits_gst_credit` | 23 | 9 | 0 | 14 |
| `applicant_canada_pension_plan_cpp` | 23 | 12 | 0 | 11 |
| `signature` | 22 | 2 | 12 | 8 |
| `applicant_rental_income` | 22 | 11 | 0 | 11 |
| `applicant_income_tax_refund` | 22 | 8 | 0 | 14 |
| `applicant_spousal_support_alimony` | 22 | 9 | 1 | 12 |
| `applicant_private_pensions_retirement_disability` | 22 | 11 | 0 | 11 |
| `sin` | 21 | 0 | 3 | 18 |
| `phone` | 21 | 0 | 2 | 19 |
| `applicant_child_tax_benefits` | 21 | 7 | 0 | 14 |
| `applicant_income_of_dependent_children` | 21 | 13 | 0 | 8 |
| `applicant_oas_gis` | 20 | 12 | 0 | 8 |
| `applicant_child_support` | 20 | 8 | 1 | 11 |
| `applicant_workbc_financial_support` | 20 | 11 | 1 | 8 |
| `applicant_other_income_money_received` | 20 | 10 | 0 | 10 |
| `applicant_student_funding_loans_bursaries` | 20 | 11 | 0 | 9 |
| `date` | 18 | 0 | 0 | 18 |
| `applicant_room_board_income` | 18 | 11 | 1 | 6 |
| `applicant_workers_compensation` | 18 | 11 | 0 | 7 |
| `applicant_trust_income` | 17 | 11 | 0 | 6 |
| `applicant_employment_insurance` | 14 | 9 | 0 | 5 |
| `case_id` | 9 | 6 | 0 | 3 |
| `spouse_name` | 8 | 1 | 0 | 7 |
| `spouse_signature` | 7 | 2 | 2 | 3 |
| `spouse_sin` | 6 | 2 | 0 | 4 |
| `spouse_net_employment_income` | 5 | 1 | 1 | 3 |
| `checkbox_moved_spouse_no` | 4 | 2 | 0 | 2 |
| `spouse_income_tax_refund` | 4 | 0 | 1 | 3 |
| `spouse_employment_insurance` | 4 | 1 | 1 | 2 |
| `spouse_workers_compensation` | 4 | 1 | 1 | 2 |
| `spouse_phone` | 3 | 0 | 1 | 2 |
| `spouse_oas_gis` | 3 | 0 | 1 | 2 |
| `spouse_trust_income` | 3 | 0 | 1 | 2 |
| `spouse_rental_income` | 3 | 1 | 1 | 1 |
| `checkbox_work_spouse_yes` | 3 | 2 | 0 | 1 |
| `spouse_room_board_income` | 3 | 0 | 2 | 1 |
| `checkbox_school_spouse_no` | 3 | 1 | 0 | 2 |
| `spouse_canada_pension_plan_cpp` | 3 | 0 | 2 | 1 |
| `spouse_other_income_money_received` | 3 | 0 | 2 | 1 |
| `spouse_student_funding_loans_bursaries` | 3 | 1 | 2 | 0 |
| `spouse_private_pensions_retirement_disability` | 3 | 3 | 0 | 0 |
| `spouse_date` | 2 | 0 | 1 | 1 |
| `checkbox_work_no` | 2 | 1 | 1 | 0 |
| `spouse_child_support` | 2 | 1 | 1 | 0 |
| `checkbox_work_spouse_no` | 2 | 1 | 0 | 1 |
| `checkbox_moved_spouse_yes` | 2 | 0 | 0 | 2 |
| `checkbox_school_spouse_yes` | 2 | 1 | 0 | 1 |
| `checkbox_warrant_spouse_yes` | 2 | 0 | 0 | 2 |
| `spouse_spousal_support_alimony` | 2 | 1 | 0 | 1 |
| `spouse_workbc_financial_support` | 2 | 1 | 1 | 0 |
| `checkbox_employment_changes_spouse_no` | 2 | 0 | 0 | 2 |
| `checkbox_employment_changes_spouse_yes` | 2 | 0 | 0 | 2 |
| `checkbox_moved_no` | 1 | 0 | 0 | 1 |
| `checkbox_work_yes` | 1 | 0 | 1 | 0 |
| `checkbox_shelter_no` | 1 | 0 | 0 | 1 |
| `checkbox_shelter_yes` | 1 | 0 | 0 | 1 |
| `spouse_child_tax_benefits` | 1 | 1 | 0 | 0 |
| `checkbox_warrant_spouse_no` | 1 | 0 | 0 | 1 |
| `checkbox_need_assistance_no` | 1 | 0 | 0 | 1 |
| `checkbox_need_assistance_yes` | 1 | 0 | 0 | 1 |
| `spouse_tax_credits_gst_credit` | 1 | 0 | 1 | 0 |

## Cross-field error correlation

### Errors per sample

96 of 99 samples have at least one error. Top sample has **29** errors; mean across samples-with-errors is **6.5**.

> Errors are concentrated in a few documents (top sample ≥ 3× the mean). The underlying cause is more likely document-level (scan quality, layout, language) than field-level.

| Sample | Errors | Failed fields |
| --- | ---: | --- |
| `CX_FILE_ATT_1-12ZYMVJU_1-1525GDE` | 29 | `name`, `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `signature`, `applicant_rental_income` _+23 more_ |
| `CX_FILE_ATT_1-12UEFDZY_1-14P89AU` | 24 | `name`, `applicant_net_employment_income`, `signature`, `applicant_spousal_support_alimony`, `applicant_private_pensions_retirement_disability`, `phone` _+18 more_ |
| `CX_FILE_ATT_1-12Z0OKTI_1-1501V71` | 20 | `name`, `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund` _+14 more_ |
| `CX_FILE_ATT_1-12YMGHNN_1-14Z0C6R` | 18 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony` _+12 more_ |
| `CX_FILE_ATT_1-12WX19CT_1-14UUZ1J` | 18 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony` _+12 more_ |
| `CX_FILE_ATT_1-12UOS1F3_1-14PRY7S` | 17 | `name`, `explain_changes`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `signature`, `applicant_rental_income` _+11 more_ |
| `CX_FILE_ATT_1-12ZFKET9_1-150ZDUO` | 17 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_spousal_support_alimony`, `applicant_private_pensions_retirement_disability` _+11 more_ |
| `CX_FILE_ATT_1-12ZXMJDG_1-1525SSJ` | 17 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_spousal_support_alimony`, `applicant_private_pensions_retirement_disability` _+11 more_ |
| `CX_FILE_ATT_1-12YMPHXJ_1-14YZQW2` | 17 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony` _+11 more_ |
| `CX_FILE_ATT_1-12Z4KMGT_1-15093LA` | 16 | `name`, `applicant_net_employment_income`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony` _+10 more_ |
| `CX_FILE_ATT_1-12U85NGF_1-14OYI00` | 16 | `applicant_net_employment_income`, `explain_changes`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund` _+10 more_ |
| `CX_FILE_ATT_1-12ZO1OWL_1-151EJ0P` | 15 | `name`, `applicant_net_employment_income`, `applicant_canada_pension_plan_cpp`, `signature`, `applicant_rental_income`, `applicant_income_tax_refund` _+9 more_ |
| `CX_FILE_ATT_1-12UEKMDX_1-14P7SDB` | 15 | `explain_changes`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony`, `sin`, `spouse_signature`, `spouse_employment_insurance` _+9 more_ |
| `CX_FILE_ATT_1-12Z18SWA_1-150206G` | 14 | `applicant_net_employment_income`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund`, `applicant_spousal_support_alimony` _+8 more_ |
| `CX_FILE_ATT_1-12YFBOY3_1-14YIALM` | 13 | `applicant_net_employment_income`, `explain_changes`, `applicant_tax_credits_gst_credit`, `applicant_canada_pension_plan_cpp`, `applicant_rental_income`, `applicant_income_tax_refund` _+7 more_ |
| _… 81 more samples_ | | |

### Co-failing field pairs

Pairs of fields that failed in the same sample at least twice. Strong pairs often share a structural cause (same region of the document, same parsing rule, etc.).

| Field A | Field B | Co-failures |
| --- | --- | ---: |
| `applicant_canada_pension_plan_cpp` | `applicant_income_of_dependent_children` | 15 |
| `applicant_canada_pension_plan_cpp` | `applicant_income_tax_refund` | 15 |
| `applicant_canada_pension_plan_cpp` | `applicant_workbc_financial_support` | 15 |
| `applicant_income_of_dependent_children` | `applicant_net_employment_income` | 15 |
| `applicant_net_employment_income` | `applicant_oas_gis` | 15 |
| `applicant_net_employment_income` | `applicant_rental_income` | 15 |
| `applicant_net_employment_income` | `applicant_tax_credits_gst_credit` | 15 |
| `applicant_rental_income` | `applicant_student_funding_loans_bursaries` | 15 |
| `applicant_rental_income` | `applicant_tax_credits_gst_credit` | 15 |
| `applicant_canada_pension_plan_cpp` | `applicant_other_income_money_received` | 14 |
| `applicant_canada_pension_plan_cpp` | `applicant_rental_income` | 14 |
| `applicant_canada_pension_plan_cpp` | `applicant_student_funding_loans_bursaries` | 14 |
| `applicant_canada_pension_plan_cpp` | `applicant_tax_credits_gst_credit` | 14 |
| `applicant_canada_pension_plan_cpp` | `applicant_trust_income` | 14 |
| `applicant_child_support` | `applicant_net_employment_income` | 14 |

## Other observations

### Confidence calibration

Average confidence on **correct** predictions across all fields: 0.913

Average confidence on **error** predictions across all fields: 0.650

Gap (correct − error): **0.263**. Wide gap → confidence is a useful error signal here.

### Top error contributors

- `name` — 30/99 errors (30.3%), avg error conf 0.473
- `applicant_net_employment_income` — 28/99 errors (28.3%), avg error conf 0.762
- `explain_changes` — 25/99 errors (25.3%), avg error conf 0.415
- `applicant_tax_credits_gst_credit` — 23/99 errors (23.2%), avg error conf 0.694
- `applicant_canada_pension_plan_cpp` — 23/99 errors (23.2%), avg error conf 0.789

## 11.3 Neural Custom Model on Azure Document Intelligence (V2 current) — detailed results

_Generated from the same `sdpr-monthly-prod-neural-v2` model run as 11.2, then post-processed through the normalisation ruleset (§10.4.5) and the per-cell numeric-zero recovery. This is the scoring view used as the headline throughout §10. Same evaluator output as 11.2 with `matched` flipped on format-variant and recovery cells; per-field totals recomputed accordingly. Audit trail in_ `benchmark-result-neural-normalized.changes.csv` _on the share._

# Benchmark Run Analysis

Generated from `input.json.fifo` on 2026-05-18T08:02:59.678Z.

## Run

| Property | Value |
| --- | --- |
| Definition | 100-doc-simple-neural-v2 |
| Run ID | `dfaddb26-cf91-4afa-aef8-c1ddeec42cc1` |
| Status | completed |
| Started | 2026-05-15T22:24:27.091Z |
| Completed | 2026-05-15T22:28:26.590Z |
| Duration | 3m 59s |
| Samples (passed / failed) | 99 (3 / 96) |

## Overall (recomputed from perFieldResults)

| Metric | Value |
| --- | --- |
| Fields total | 75 |
| Fields with errors | 60 |
| Fields perfect (0 errors) | 15 |
| Total field evaluations | 7425 |
| Total correct | 7158 |
| Total errors | 267 |
| Micro accuracy (instance-weighted) | 96.4% |
| Micro error rate | 3.6% |
| Macro accuracy (field-weighted) | 96.4% |

> Macro accuracy treats every field equally regardless of how many instances each has; micro accuracy weights by instance count. The gap between them tells you whether errors concentrate in a few fields (large gap) or spread evenly (small gap).

## Per-field results

Sorted by error rate (worst first). Confidence values are 0–1.

| Field | Evaluated | Errors | Error rate | Avg conf | Avg conf (correct) | Avg conf (errors) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `phone` | 99 | 17 | 17.2% | 0.835 | 0.875 | 0.642 |
| `sin` | 99 | 17 | 17.2% | 0.823 | 0.880 | 0.551 |
| `signature` | 99 | 14 | 14.1% | 0.376 | 0.390 | 0.295 |
| `applicant_net_employment_income` | 99 | 13 | 13.1% | 0.802 | 0.807 | 0.769 |
| `date` | 99 | 12 | 12.1% | 0.852 | 0.886 | 0.610 |
| `applicant_other_income_money_received` | 99 | 11 | 11.1% | 0.793 | 0.786 | 0.847 |
| `applicant_tax_credits_gst_credit` | 99 | 11 | 11.1% | 0.781 | 0.800 | 0.630 |
| `applicant_canada_pension_plan_cpp` | 99 | 9 | 9.1% | 0.831 | 0.841 | 0.727 |
| `case_id` | 99 | 9 | 9.1% | 0.947 | 0.964 | 0.774 |
| `applicant_income_tax_refund` | 99 | 8 | 8.1% | 0.804 | 0.803 | 0.806 |
| `applicant_child_tax_benefits` | 99 | 7 | 7.1% | 0.803 | 0.796 | 0.895 |
| `applicant_rental_income` | 99 | 7 | 7.1% | 0.807 | 0.808 | 0.803 |
| `applicant_child_support` | 99 | 6 | 6.1% | 0.819 | 0.817 | 0.837 |
| `applicant_income_of_dependent_children` | 99 | 6 | 6.1% | 0.809 | 0.798 | 0.976 |
| `applicant_workers_compensation` | 99 | 6 | 6.1% | 0.783 | 0.789 | 0.684 |
| `name` | 99 | 6 | 6.1% | 0.644 | 0.663 | 0.349 |
| `applicant_room_board_income` | 99 | 5 | 5.1% | 0.802 | 0.805 | 0.747 |
| `applicant_workbc_financial_support` | 99 | 5 | 5.1% | 0.804 | 0.799 | 0.895 |
| `spouse_sin` | 99 | 5 | 5.1% | 0.956 | 0.975 | 0.584 |
| `applicant_private_pensions_retirement_disability` | 99 | 4 | 4.0% | 0.800 | 0.793 | 0.970 |
| `applicant_spousal_support_alimony` | 99 | 4 | 4.0% | 0.791 | 0.784 | 0.970 |
| `applicant_student_funding_loans_bursaries` | 99 | 4 | 4.0% | 0.792 | 0.793 | 0.769 |
| `spouse_signature` | 99 | 4 | 4.0% | 0.864 | 0.875 | 0.624 |
| `applicant_employment_insurance` | 99 | 3 | 3.0% | 0.809 | 0.803 | 0.977 |
| `applicant_oas_gis` | 99 | 3 | 3.0% | 0.788 | 0.782 | 0.979 |
| `applicant_trust_income` | 99 | 3 | 3.0% | 0.817 | 0.815 | 0.873 |
| `checkbox_moved_spouse_no` | 99 | 3 | 3.0% | 0.957 | 0.967 | 0.654 |
| `checkbox_school_spouse_no` | 99 | 3 | 3.0% | 0.961 | 0.969 | 0.693 |
| `checkbox_work_spouse_yes` | 99 | 3 | 3.0% | 0.952 | 0.965 | 0.546 |
| `spouse_canada_pension_plan_cpp` | 99 | 3 | 3.0% | 0.941 | 0.953 | 0.572 |
| `spouse_net_employment_income` | 99 | 3 | 3.0% | 0.938 | 0.948 | 0.624 |
| `spouse_phone` | 99 | 3 | 3.0% | 0.955 | 0.971 | 0.433 |
| `spouse_private_pensions_retirement_disability` | 99 | 3 | 3.0% | 0.964 | 0.963 | 0.986 |
| `spouse_student_funding_loans_bursaries` | 99 | 3 | 3.0% | 0.949 | 0.959 | 0.603 |
| `spouse_trust_income` | 99 | 3 | 3.0% | 0.940 | 0.962 | 0.220 |
| `checkbox_employment_changes_spouse_no` | 99 | 2 | 2.0% | 0.963 | 0.964 | 0.906 |
| `checkbox_employment_changes_spouse_yes` | 99 | 2 | 2.0% | 0.967 | 0.968 | 0.920 |
| `checkbox_school_spouse_yes` | 99 | 2 | 2.0% | 0.954 | 0.961 | 0.641 |
| `checkbox_warrant_spouse_yes` | 99 | 2 | 2.0% | 0.956 | 0.957 | 0.944 |
| `checkbox_work_no` | 99 | 2 | 2.0% | 0.935 | 0.944 | 0.482 |
| `checkbox_work_spouse_no` | 99 | 2 | 2.0% | 0.960 | 0.967 | 0.637 |
| `spouse_child_support` | 99 | 2 | 2.0% | 0.940 | 0.944 | 0.772 |
| `spouse_date` | 99 | 2 | 2.0% | 0.966 | 0.973 | 0.655 |
| `spouse_employment_insurance` | 99 | 2 | 2.0% | 0.957 | 0.965 | 0.551 |
| `spouse_income_tax_refund` | 99 | 2 | 2.0% | 0.919 | 0.937 | 0.068 |
| `spouse_name` | 99 | 2 | 2.0% | 0.927 | 0.931 | 0.710 |
| `spouse_other_income_money_received` | 99 | 2 | 2.0% | 0.946 | 0.956 | 0.441 |
| `spouse_rental_income` | 99 | 2 | 2.0% | 0.926 | 0.934 | 0.512 |
| `spouse_room_board_income` | 99 | 2 | 2.0% | 0.927 | 0.938 | 0.388 |
| `spouse_workbc_financial_support` | 99 | 2 | 2.0% | 0.941 | 0.946 | 0.669 |
| `spouse_workers_compensation` | 99 | 2 | 2.0% | 0.950 | 0.953 | 0.801 |
| `checkbox_moved_spouse_yes` | 99 | 1 | 1.0% | 0.948 | 0.948 | 0.970 |
| `checkbox_shelter_no` | 99 | 1 | 1.0% | 0.966 | 0.971 | 0.451 |
| `checkbox_warrant_spouse_no` | 99 | 1 | 1.0% | 0.957 | 0.961 | 0.528 |
| `checkbox_work_yes` | 99 | 1 | 1.0% | 0.969 | 0.974 | 0.490 |
| `explain_changes` | 99 | 1 | 1.0% | 0.807 | 0.810 | 0.558 |
| `spouse_child_tax_benefits` | 99 | 1 | 1.0% | 0.965 | 0.965 | 0.987 |
| `spouse_oas_gis` | 99 | 1 | 1.0% | 0.939 | 0.947 | 0.157 |
| `spouse_spousal_support_alimony` | 99 | 1 | 1.0% | 0.960 | 0.960 | 0.987 |
| `spouse_tax_credits_gst_credit` | 99 | 1 | 1.0% | 0.945 | 0.950 | 0.378 |
| `checkbox_dependants_no` | 99 | 0 | 0.0% | 0.968 | 0.968 | — |
| `checkbox_dependants_yes` | 99 | 0 | 0.0% | 0.962 | 0.962 | — |
| `checkbox_employment_changes_no` | 99 | 0 | 0.0% | 0.971 | 0.971 | — |
| `checkbox_employment_changes_yes` | 99 | 0 | 0.0% | 0.968 | 0.968 | — |
| `checkbox_family_assets_no` | 99 | 0 | 0.0% | 0.972 | 0.972 | — |
| `checkbox_family_assets_yes` | 99 | 0 | 0.0% | 0.965 | 0.965 | — |
| `checkbox_moved_no` | 99 | 0 | 0.0% | 0.969 | 0.969 | — |
| `checkbox_moved_yes` | 99 | 0 | 0.0% | 0.958 | 0.958 | — |
| `checkbox_need_assistance_no` | 99 | 0 | 0.0% | 0.958 | 0.958 | — |
| `checkbox_need_assistance_yes` | 99 | 0 | 0.0% | 0.961 | 0.961 | — |
| `checkbox_school_no` | 99 | 0 | 0.0% | 0.966 | 0.966 | — |
| `checkbox_school_yes` | 99 | 0 | 0.0% | 0.966 | 0.966 | — |
| `checkbox_shelter_yes` | 99 | 0 | 0.0% | 0.967 | 0.967 | — |
| `checkbox_warrant_no` | 99 | 0 | 0.0% | 0.969 | 0.969 | — |
| `checkbox_warrant_yes` | 99 | 0 | 0.0% | 0.954 | 0.954 | — |

## Confidence-threshold trade-offs

For each field with errors, the smallest review-gate threshold that catches the target fraction of errors, plus how many correct predictions would be flagged for review at that threshold (false positives). Gate semantics: `flagged := confidence < threshold`.

| Field | Errors | 100% capture: threshold | 100% FP | 80% capture: threshold | 80% FP | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `applicant_canada_pension_plan_cpp` | 9 | 0.98 (9/9) | 90/90 | 0.98 (8/9) | 79/90 | ⚠ overlap |
| `applicant_child_support` | 6 | 0.99 (6/6) | 93/93 | 0.98 (5/6) | 90/93 | ⚠ overlap |
| `applicant_child_tax_benefits` | 7 | 0.99 (7/7) | 92/92 | 0.99 (7/7) | 92/92 | ⚠ overlap |
| `applicant_employment_insurance` | 3 | 0.98 (3/3) | 95/96 | 0.98 (3/3) | 95/96 | ⚠ overlap |
| `applicant_income_of_dependent_children` | 6 | 0.98 (6/6) | 93/93 | 0.98 (6/6) | 93/93 | ⚠ overlap |
| `applicant_income_tax_refund` | 8 | 0.99 (8/8) | 91/91 | 0.99 (7/8) | 87/91 | ⚠ overlap |
| `applicant_net_employment_income` | 13 | 0.98 (13/13) | 84/86 | 0.98 (11/13) | 74/86 | ⚠ overlap |
| `applicant_oas_gis` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `applicant_other_income_money_received` | 11 | 0.97 (11/11) | 86/88 | 0.97 (11/11) | 86/88 | ⚠ overlap |
| `applicant_private_pensions_retirement_disability` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `applicant_rental_income` | 7 | 0.99 (7/7) | 92/92 | 0.99 (7/7) | 92/92 | ⚠ overlap |
| `applicant_room_board_income` | 5 | 0.99 (5/5) | 94/94 | 0.98 (4/5) | 89/94 | ⚠ overlap |
| `applicant_spousal_support_alimony` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `applicant_student_funding_loans_bursaries` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `applicant_tax_credits_gst_credit` | 11 | 0.98 (11/11) | 88/88 | 0.98 (9/11) | 77/88 | ⚠ overlap |
| `applicant_trust_income` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `applicant_workbc_financial_support` | 5 | 0.98 (5/5) | 94/94 | 0.98 (4/5) | 83/94 | ⚠ overlap |
| `applicant_workers_compensation` | 6 | 0.99 (6/6) | 91/93 | 0.99 (6/6) | 91/93 | ⚠ overlap |
| `case_id` | 9 | 0.99 (9/9) | 90/90 | 0.99 (8/9) | 28/90 | ⚠ overlap |
| `checkbox_employment_changes_spouse_no` | 2 | 0.96 (2/2) | 10/97 | 0.96 (2/2) | 10/97 | ⚠ overlap |
| `checkbox_employment_changes_spouse_yes` | 2 | 0.96 (2/2) | 9/97 | 0.96 (2/2) | 9/97 | ⚠ overlap |
| `checkbox_moved_spouse_no` | 3 | 0.97 (3/3) | 8/96 | 0.97 (3/3) | 8/96 | ⚠ overlap |
| `checkbox_moved_spouse_yes` | 1 | 0.98 (1/1) | 45/98 | 0.98 (1/1) | 45/98 | ⚠ overlap |
| `checkbox_school_spouse_no` | 3 | 0.98 (3/3) | 36/96 | 0.98 (3/3) | 36/96 | ⚠ overlap |
| `checkbox_school_spouse_yes` | 2 | 0.69 (2/2) | 1/97 | 0.69 (2/2) | 1/97 | ⚠ overlap |
| `checkbox_shelter_no` | 1 | 0.46 (1/1) | 0/98 | 0.46 (1/1) | 0/98 | — |
| `checkbox_warrant_spouse_no` | 1 | 0.53 (1/1) | 0/98 | 0.53 (1/1) | 0/98 | — |
| `checkbox_warrant_spouse_yes` | 2 | 0.98 (2/2) | 57/97 | 0.98 (2/2) | 57/97 | ⚠ overlap |
| `checkbox_work_no` | 2 | 0.64 (2/2) | 2/97 | 0.64 (2/2) | 2/97 | ⚠ overlap |
| `checkbox_work_spouse_no` | 2 | 0.67 (2/2) | 0/97 | 0.67 (2/2) | 0/97 | — |
| `checkbox_work_spouse_yes` | 3 | 0.64 (3/3) | 0/96 | 0.64 (3/3) | 0/96 | — |
| `checkbox_work_yes` | 1 | 0.50 (1/1) | 0/98 | 0.50 (1/1) | 0/98 | — |
| `date` | 12 | 0.98 (12/12) | 82/87 | 0.74 (10/12) | 11/87 | ⚠ overlap |
| `explain_changes` | 1 | 0.56 (1/1) | 18/98 | 0.56 (1/1) | 18/98 | ⚠ overlap |
| `name` | 6 | 0.53 (6/6) | 22/93 | 0.50 (5/6) | 19/93 | ⚠ overlap |
| `phone` | 17 | 0.96 (17/17) | 60/82 | 0.84 (14/17) | 20/82 | ⚠ overlap |
| `signature` | 14 | 0.95 (14/14) | 71/85 | 0.72 (12/14) | 69/85 | ⚠ overlap |
| `sin` | 17 | 0.97 (17/17) | 56/82 | 0.71 (14/17) | 7/82 | ⚠ overlap |
| `spouse_canada_pension_plan_cpp` | 3 | 0.89 (3/3) | 10/96 | 0.89 (3/3) | 10/96 | ⚠ overlap |
| `spouse_child_support` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `spouse_child_tax_benefits` | 1 | 0.99 (1/1) | 98/98 | 0.99 (1/1) | 98/98 | ⚠ overlap |
| `spouse_date` | 2 | 0.69 (2/2) | 1/97 | 0.69 (2/2) | 1/97 | ⚠ overlap |
| `spouse_employment_insurance` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `spouse_income_tax_refund` | 2 | 0.08 (2/2) | 2/97 | 0.08 (2/2) | 2/97 | ⚠ overlap |
| `spouse_name` | 2 | 0.98 (2/2) | 32/97 | 0.98 (2/2) | 32/97 | ⚠ overlap |
| `spouse_net_employment_income` | 3 | 0.99 (3/3) | 16/96 | 0.99 (3/3) | 16/96 | ⚠ overlap |
| `spouse_oas_gis` | 1 | 0.16 (1/1) | 0/98 | 0.16 (1/1) | 0/98 | — |
| `spouse_other_income_money_received` | 2 | 0.72 (2/2) | 4/97 | 0.72 (2/2) | 4/97 | ⚠ overlap |
| `spouse_phone` | 3 | 0.69 (3/3) | 0/96 | 0.69 (3/3) | 0/96 | — |
| `spouse_private_pensions_retirement_disability` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `spouse_rental_income` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `spouse_room_board_income` | 2 | 0.55 (2/2) | 4/97 | 0.55 (2/2) | 4/97 | ⚠ overlap |
| `spouse_signature` | 4 | 0.99 (4/4) | 95/95 | 0.99 (4/4) | 95/95 | ⚠ overlap |
| `spouse_sin` | 5 | 0.99 (5/5) | 94/94 | 0.90 (4/5) | 5/94 | ⚠ overlap |
| `spouse_spousal_support_alimony` | 1 | 0.99 (1/1) | 98/98 | 0.99 (1/1) | 98/98 | ⚠ overlap |
| `spouse_student_funding_loans_bursaries` | 3 | 0.99 (3/3) | 96/96 | 0.99 (3/3) | 96/96 | ⚠ overlap |
| `spouse_tax_credits_gst_credit` | 1 | 0.38 (1/1) | 1/98 | 0.38 (1/1) | 1/98 | ⚠ overlap |
| `spouse_trust_income` | 3 | 0.43 (3/3) | 1/96 | 0.43 (3/3) | 1/96 | ⚠ overlap |
| `spouse_workbc_financial_support` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |
| `spouse_workers_compensation` | 2 | 0.99 (2/2) | 97/97 | 0.99 (2/2) | 97/97 | ⚠ overlap |

> ⚠ **Confidence overlap**: for fields marked `overlap`, at least one correct prediction sits at or below the highest error confidence. Pure confidence gating cannot perfectly separate errors from correct predictions for these — review the underlying samples.

## Error types: missing, extra, wrong

Each error is classified by emptiness on each side. The three failure modes usually have different root causes, so the split is a much better fix-prioritization signal than the raw error count.

- **Missing** — `expected` has a value but `predicted` is null or empty. The field exists in the document but the model didn't return it. Root cause is usually **extraction failure** (model missed the region, OCR dropped the text, or the prompt didn't ask for the field).
- **Extra** — `expected` is null or empty but `predicted` has a value. The model returned something for a field that should have been blank. Root cause is usually **hallucination / over-extraction** (model pulled in adjacent text, invented a value, or didn't recognize that the field was intentionally left empty).
- **Wrong** — both `expected` and `predicted` have values but they don't match. Root cause is usually a **parsing, normalization, or interpretation bug** (date format, whitespace, units, picked the wrong region of the document).

Overall: **103 missing** (38.6%), **46 extra** (17.2%), **118 wrong** (44.2%) of 267 total errors.

| Field | Errors | Missing | Extra | Wrong |
| --- | ---: | ---: | ---: | ---: |
| `phone` | 17 | 0 | 2 | 15 |
| `sin` | 17 | 0 | 3 | 14 |
| `signature` | 14 | 2 | 12 | 0 |
| `applicant_net_employment_income` | 13 | 9 | 0 | 4 |
| `date` | 12 | 0 | 0 | 12 |
| `applicant_other_income_money_received` | 11 | 5 | 0 | 6 |
| `applicant_tax_credits_gst_credit` | 11 | 4 | 0 | 7 |
| `applicant_canada_pension_plan_cpp` | 9 | 3 | 0 | 6 |
| `case_id` | 9 | 6 | 0 | 3 |
| `applicant_income_tax_refund` | 8 | 2 | 0 | 6 |
| `applicant_child_tax_benefits` | 7 | 3 | 0 | 4 |
| `applicant_rental_income` | 7 | 4 | 0 | 3 |
| `applicant_child_support` | 6 | 3 | 1 | 2 |
| `applicant_income_of_dependent_children` | 6 | 6 | 0 | 0 |
| `applicant_workers_compensation` | 6 | 5 | 0 | 1 |
| `name` | 6 | 0 | 1 | 5 |
| `applicant_room_board_income` | 5 | 4 | 1 | 0 |
| `applicant_workbc_financial_support` | 5 | 4 | 1 | 0 |
| `spouse_sin` | 5 | 2 | 0 | 3 |
| `applicant_private_pensions_retirement_disability` | 4 | 4 | 0 | 0 |
| `applicant_spousal_support_alimony` | 4 | 3 | 1 | 0 |
| `applicant_student_funding_loans_bursaries` | 4 | 3 | 0 | 1 |
| `spouse_signature` | 4 | 2 | 2 | 0 |
| `applicant_employment_insurance` | 3 | 3 | 0 | 0 |
| `applicant_oas_gis` | 3 | 3 | 0 | 0 |
| `applicant_trust_income` | 3 | 2 | 0 | 1 |
| `checkbox_moved_spouse_no` | 3 | 2 | 0 | 1 |
| `checkbox_school_spouse_no` | 3 | 1 | 0 | 2 |
| `checkbox_work_spouse_yes` | 3 | 2 | 0 | 1 |
| `spouse_canada_pension_plan_cpp` | 3 | 0 | 2 | 1 |
| `spouse_net_employment_income` | 3 | 1 | 1 | 1 |
| `spouse_phone` | 3 | 0 | 1 | 2 |
| `spouse_private_pensions_retirement_disability` | 3 | 3 | 0 | 0 |
| `spouse_student_funding_loans_bursaries` | 3 | 1 | 2 | 0 |
| `spouse_trust_income` | 3 | 0 | 1 | 2 |
| `checkbox_employment_changes_spouse_no` | 2 | 0 | 0 | 2 |
| `checkbox_employment_changes_spouse_yes` | 2 | 0 | 0 | 2 |
| `checkbox_school_spouse_yes` | 2 | 1 | 0 | 1 |
| `checkbox_warrant_spouse_yes` | 2 | 0 | 0 | 2 |
| `checkbox_work_no` | 2 | 1 | 1 | 0 |
| `checkbox_work_spouse_no` | 2 | 1 | 0 | 1 |
| `spouse_child_support` | 2 | 1 | 1 | 0 |
| `spouse_date` | 2 | 0 | 1 | 1 |
| `spouse_employment_insurance` | 2 | 1 | 1 | 0 |
| `spouse_income_tax_refund` | 2 | 0 | 1 | 1 |
| `spouse_name` | 2 | 1 | 0 | 1 |
| `spouse_other_income_money_received` | 2 | 0 | 2 | 0 |
| `spouse_rental_income` | 2 | 1 | 1 | 0 |
| `spouse_room_board_income` | 2 | 0 | 2 | 0 |
| `spouse_workbc_financial_support` | 2 | 1 | 1 | 0 |
| `spouse_workers_compensation` | 2 | 1 | 1 | 0 |
| `checkbox_moved_spouse_yes` | 1 | 0 | 0 | 1 |
| `checkbox_shelter_no` | 1 | 0 | 0 | 1 |
| `checkbox_warrant_spouse_no` | 1 | 0 | 0 | 1 |
| `checkbox_work_yes` | 1 | 0 | 1 | 0 |
| `explain_changes` | 1 | 0 | 0 | 1 |
| `spouse_child_tax_benefits` | 1 | 1 | 0 | 0 |
| `spouse_oas_gis` | 1 | 0 | 1 | 0 |
| `spouse_spousal_support_alimony` | 1 | 1 | 0 | 0 |
| `spouse_tax_credits_gst_credit` | 1 | 0 | 1 | 0 |

## Cross-field error correlation

### Errors per sample

79 of 99 samples have at least one error. Top sample has **27** errors; mean across samples-with-errors is **3.4**.

> Errors are concentrated in a few documents (top sample ≥ 3× the mean). The underlying cause is more likely document-level (scan quality, layout, language) than field-level.

| Sample | Errors | Failed fields |
| --- | ---: | --- |
| `CX_FILE_ATT_1-12ZYMVJU_1-1525GDE` | 27 | `applicant_canada_pension_plan_cpp`, `applicant_child_support`, `applicant_child_tax_benefits`, `applicant_employment_insurance`, `applicant_income_of_dependent_children`, `applicant_income_tax_refund` _+21 more_ |
| `CX_FILE_ATT_1-12Z0OKTI_1-1501V71` | 18 | `applicant_canada_pension_plan_cpp`, `applicant_child_support`, `applicant_child_tax_benefits`, `applicant_employment_insurance`, `applicant_income_of_dependent_children`, `applicant_income_tax_refund` _+12 more_ |
| `CX_FILE_ATT_1-12UEFDZY_1-14P89AU` | 16 | `applicant_net_employment_income`, `phone`, `spouse_canada_pension_plan_cpp`, `spouse_child_support`, `spouse_date`, `spouse_employment_insurance` _+10 more_ |
| `CX_FILE_ATT_1-12UEKMDX_1-14P7SDB` | 11 | `spouse_child_support`, `spouse_child_tax_benefits`, `spouse_employment_insurance`, `spouse_phone`, `spouse_private_pensions_retirement_disability`, `spouse_rental_income` _+5 more_ |
| `CX_FILE_ATT_1-12UOS1F3_1-14PRY7S` | 10 | `applicant_canada_pension_plan_cpp`, `applicant_other_income_money_received`, `applicant_rental_income`, `applicant_tax_credits_gst_credit`, `checkbox_moved_spouse_no`, `checkbox_shelter_no` _+4 more_ |
| `CX_FILE_ATT_1-12ZBOVN0_1-150PP75` | 8 | `checkbox_employment_changes_spouse_no`, `checkbox_employment_changes_spouse_yes`, `checkbox_moved_spouse_no`, `checkbox_moved_spouse_yes`, `checkbox_school_spouse_no`, `checkbox_warrant_spouse_no` _+2 more_ |
| `CX_FILE_ATT_1-12ZBJEKC_1-150NKNJ` | 6 | `applicant_canada_pension_plan_cpp`, `applicant_other_income_money_received`, `applicant_student_funding_loans_bursaries`, `phone`, `signature`, `spouse_student_funding_loans_bursaries` |
| `CX_FILE_ATT_1-12Z42LAN_1-1507VIC` | 6 | `applicant_tax_credits_gst_credit`, `case_id`, `checkbox_employment_changes_spouse_no`, `checkbox_employment_changes_spouse_yes`, `checkbox_work_spouse_yes`, `date` |
| `CX_FILE_ATT_1-12Z03S7D_1-1500H5Q` | 6 | `applicant_workers_compensation`, `date`, `phone`, `signature`, `spouse_phone`, `spouse_sin` |
| `CX_FILE_ATT_1-12YMIL64_1-14Z0XKX` | 5 | `applicant_canada_pension_plan_cpp`, `applicant_other_income_money_received`, `checkbox_school_spouse_no`, `checkbox_warrant_spouse_yes`, `phone` |
| `CX_FILE_ATT_1-12ZOLJQH_1-151GMVQ` | 5 | `applicant_child_support`, `applicant_employment_insurance`, `applicant_income_of_dependent_children`, `date`, `sin` |
| `CX_FILE_ATT_1-130C2AM3_1-1538N5G` | 5 | `applicant_income_of_dependent_children`, `applicant_net_employment_income`, `applicant_other_income_money_received`, `sin`, `spouse_name` |
| `CX_FILE_ATT_1-12Z06HE8_1-150053O` | 5 | `applicant_income_tax_refund`, `applicant_room_board_income`, `spouse_name`, `spouse_phone`, `spouse_sin` |
| `CX_FILE_ATT_1-12U85NGF_1-14OYI00` | 5 | `applicant_net_employment_income`, `applicant_private_pensions_retirement_disability`, `applicant_rental_income`, `applicant_room_board_income`, `applicant_workers_compensation` |
| `CX_FILE_ATT_1-12ZO1OWL_1-151EJ0P` | 5 | `applicant_net_employment_income`, `checkbox_school_spouse_yes`, `date`, `phone`, `sin` |
| _… 64 more samples_ | | |

### Co-failing field pairs

Pairs of fields that failed in the same sample at least twice. Strong pairs often share a structural cause (same region of the document, same parsing rule, etc.).

| Field A | Field B | Co-failures |
| --- | --- | ---: |
| `applicant_canada_pension_plan_cpp` | `applicant_other_income_money_received` | 6 |
| `applicant_other_income_money_received` | `applicant_tax_credits_gst_credit` | 5 |
| `date` | `phone` | 5 |
| `date` | `sin` | 5 |
| `phone` | `sin` | 5 |
| `applicant_canada_pension_plan_cpp` | `phone` | 4 |
| `applicant_canada_pension_plan_cpp` | `signature` | 4 |
| `applicant_canada_pension_plan_cpp` | `applicant_tax_credits_gst_credit` | 4 |
| `applicant_child_support` | `applicant_workbc_financial_support` | 4 |
| `applicant_child_tax_benefits` | `applicant_other_income_money_received` | 4 |
| `applicant_income_of_dependent_children` | `applicant_other_income_money_received` | 4 |
| `applicant_income_tax_refund` | `applicant_other_income_money_received` | 4 |
| `applicant_income_tax_refund` | `applicant_tax_credits_gst_credit` | 4 |
| `date` | `signature` | 4 |
| `applicant_net_employment_income` | `phone` | 4 |

## Other observations

### Confidence calibration

Average confidence on **correct** predictions across all fields: 0.904

Average confidence on **error** predictions across all fields: 0.675

Gap (correct − error): **0.228**. Wide gap → confidence is a useful error signal here.

### Top error contributors

- `phone` — 17/99 errors (17.2%), avg error conf 0.642
- `sin` — 17/99 errors (17.2%), avg error conf 0.551
- `signature` — 14/99 errors (14.1%), avg error conf 0.295
- `applicant_net_employment_income` — 13/99 errors (13.1%), avg error conf 0.769
- `date` — 12/99 errors (12.1%), avg error conf 0.610

## 11.4 Normalisation methodology — reference

Quick reference for the V2 scoring methodology. The authoritative source is [`scripts/benchmark analysis/normalize-benchmark.py`](../../../scripts/benchmark%20analysis/normalize-benchmark.py); this section reproduces the rule list and ties each rule to the audit CSV column.

### Rules and audit CSV `rule` column values

| Field group | `rule` value(s) in `*.changes.csv` |
| --- | --- |
| `sin`, `spouse_sin`, `phone`, `spouse_phone` | `digits-only` |
| `date`, `spouse_date` | `date-calendar`, `date-month-day-swap` |
| `signature`, `spouse_signature` | `signature-presence` |
| `name`, `spouse_name` | `text-normalized`, `name-fuzzy` |
| `explain_changes` | `text-normalized`, `freeform-fuzzy` |
| `case_id` | `case-id-normalized` |
| `applicant_*` / `spouse_*` numeric | `currency-chrome`, `numeric-equality`, `income-single-char-zero`, `income-single-digit-to-zero`, `recovered:checkbox-zero`, `recovered:checkbox-zero-label-anchor`, `recovered:checkbox-zero-positional` |
| `checkbox_*` | `checkbox-tag` |

### Sentinel ground-truth values (never flipped)

`:present:`, `:garbled:`, `Spouse Missing`, `Missed Box`, `Blank Declaration`, `Homeless`, `KEY PLAYER MISSING`. These are GT-only tags placed by the human annotation pipeline; no engine output ever matches them, so the normaliser skips any cell whose expected value is on this list.

### Re-regeneration

The full pipeline (normalize → recover-numeric-zeros → analyze → report-errors) runs from a single command:

```bash
bash "scripts/benchmark analysis/regenerate-reports-share.sh" \
    '\\widget\\SDPRDocuments\\convert_sd0081\\100-doc\\2026-05-05 performance report'
```

Defaults match the SDPR neural-vs-template workflow; see the [scripts README](../../../scripts/benchmark%20analysis/README.md#full-re-regeneration-pipeline-regenerate-reports-sharesh) for the full flag set.

### 11.5 Glossary

- **HITL (Human-in-the-Loop):** A workflow stage in which a human reviewer verifies or corrects automated system output before it is committed to a downstream system.
- **Template model:** An OCR custom model that locates fields based on fixed positional cues from training documents.
- **Neural model:** An OCR custom model that uses learned visual features rather than fixed positions, generally more tolerant of rotation, cropping, and variation.
- **Confidence score:** A value (0–1) returned by an OCR engine indicating how strongly the input matched a learned pattern. Not directly equivalent to the probability the read is correct, especially for handwritten content.
- **Sanity check:** A rule-based validation applied to OCR output (e.g. "income value must be within plausible range") to catch errors that confidence scoring may miss.
- **Risk:** The product of probability (likelihood of an error occurring) and impact (consequence if the error propagates undetected). See Section 6.
