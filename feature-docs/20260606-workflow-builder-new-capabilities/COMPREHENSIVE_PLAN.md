# Workflow Builder — Comprehensive Capability Plan (TOTAL)

**Status:** Total coverage map + full wave plan — shape under review
**Owner:** Alex
**Companion:** [idp_processing_research.md](./idp_processing_research.md) · [REVIEW_AND_ROADMAP.md](./REVIEW_AND_ROADMAP.md) (exec summary)
**Legend:** ✅ have · 🟡 partial / coupled / expressible-but-not-a-node · ❌ missing

This document accounts for **every** node in the research's 11-category taxonomy (§A), the 7 cross-cutting platform resources (§B), and the 12 design patterns (§C) — each marked against the verified current system.

**Scope:** this is an **IDP** system — *document-type-agnostic* (no per-document-type hardcoding), **not** a general-purpose workflow engine. "Generic" throughout means doc-type-agnostic; comparables are ABBYY/UiPath/Rossum, not n8n/Zapier.

---

## Part 1 — Coverage matrix (all 11 research categories)

### 1. Document Ingestion / Intake
| Research node | Status | Your node / note |
|---|---|---|
| HTTP/REST endpoint trigger | ✅ | `source.api` (push) |
| Form/portal upload trigger | ✅ | `source.upload` |
| Webhook receiver | 🟡 | `source.api` is push-style; dedicated webhook semantics not separated |
| Email / IMAP / Exchange inbox | ❌ | planned `source.email` |
| SFTP / FTPS poller | ❌ | |
| Cloud object storage (S3/GCS/Blob) | ❌ | planned `source.s3` |
| SharePoint / OneDrive / GDrive / Box | ❌ | planned `source.sharepoint` |
| Scanner / MFP / mobile capture | ❌ | |
| Fax-server intake | ❌ | niche |
| API pull from RPA / chatbot | ❌ | |
| Web scraping / RPA-driven intake | ❌ | |
| Database BLOB read | ❌ | (migration/backfill) |

### 2. Pre-processing / Digitization
| Research node | Status | Your node / note |
|---|---|---|
| Page splitting / range extraction | ✅ | `document.split`, `document.extractPageRange` |
| Deskew / rotation correction | ✅ | `document.normalizeOrientation` |
| Document assembly (re-stitch pages) | ✅ | `segment.combineResult`, `document.flattenClassifiedDocuments` |
| File-type detection + prepare | 🟡 | `file.prepare` (prepare only, not routing) |
| Document chunking (sub-batches) | 🟡 | via `document.split` range modes |
| MIME/file-type **routing** | ❌ | |
| PDF text-vs-image (born-digital vs scanned) | ❌ | |
| Noise / binarization / despeckle | ❌ | |
| Contrast / brightness normalization | ❌ | |
| Resolution / DPI upscaling | ❌ | |
| PDF password / encryption removal | ❌ | |
| PII / signature / barcode masking pre-OCR | ❌ | |
| Page dedup / hash-based dedupe | ❌ | |

### 3. Classification / Routing
| Research node | Status | Your node / note |
|---|---|---|
| Rule / keyword classifier | ✅ | `document.classify` (pattern match) |
| ML / DL classifier | ✅ | `azureClassify.submit/poll` |
| Document splitter + classify | ✅ | `document.splitAndClassify` |
| Select pages by classification | ✅ | `document.selectClassifiedPages` |
| VLM / multimodal (LLM) classifier | 🟡 | achievable via Wave 1 `llm.structured` |
| Confidence-gated classification routing | 🟡 | `ocr.checkConfidence` + `switch` |
| Intelligent keyword (n-gram) classifier | ❌ | |
| Page-level vs holistic toggle | ❌ | |
| Priority / SLA routing | ❌ | |
| Language detection + routing | ❌ | |

### 4. OCR / Extraction
| Research node | Status | Your node / note |
|---|---|---|
| Layout-aware OCR | ✅ | `azureOcr.*` (Azure DI Layout) |
| Alternative OCR engine | ✅ | `mistralOcr.process` |
| Custom extractor scope (pluggable) | ✅ | **Phase 6 dynamic nodes** (Deno) |
| Table / line-item extractor | 🟡 | `OcrTable` artifact via Azure layout |
| Generative / LLM extractor | 🟡 | inside `ocr.enrich`; Wave 1 decouples it |
| OCR engine **selector** | ❌ | Wave 2 |
| Multi-engine ensemble / router | ❌ | Wave 2 |
| Template / zone / anchor extractor | ❌ | |
| Forms (key-value) extractor | ❌ | |
| Regex / pattern extractor | ❌ | |
| Handwriting recognition | ❌ | |
| Barcode / QR / MICR / OMR / checkbox | ❌ | |
| Identity-document extractor | ❌ | |
| Invoice / receipt / W-2 specialist | ❌ | (intentionally generic per mandate) |
| Full-page transcription (end-to-end) | ❌ | |

### 5. NLP / AI Processing
| Research node | Status | Your node / note |
|---|---|---|
| LLM prompt / structured-output | 🟡 | welded in `ocr.enrich` → Wave 1 `llm.structured` |
| Named entity recognition (NER) | ❌ | Wave 4 |
| Custom / fine-tuned NER | ❌ | |
| PII / PHI detection + redaction | ❌ | Wave 4 |
| Sentiment analysis | ❌ | |
| Summarization | ❌ | Wave 4 |
| Translation | ❌ | Wave 4 |
| Address parser / normalizer | ❌ | |
| RAG / vector-store enrichment | ❌ | Wave 4 |
| Document Q&A / chat-with-doc | ❌ | |

### 6. Validation & Verification
| Research node | Status | Your node / note |
|---|---|---|
| Field-level confidence gate | ✅ | `ocr.checkConfidence` (OCR-coupled) |
| Cross-field business-rule validator | 🟡 | `document.validateFields` (field-match, arithmetic, array-match) |
| External lookup validator | 🟡 | `tables.lookup` |
| Generic schema / data-type / regex validator | ❌ | Wave 1 |
| DMN decision-table node | ❌ | Wave 1 |
| Three-way match (PO↔invoice↔receipt) | ❌ | |
| Duplicate / fraud detection | ❌ | Wave 8 (dedup) |
| Spatial grounding validator | ❌ | (provenance exists; no validator node) |
| Cross-document consistency | ❌ | |
| Compliance / policy checker | ❌ | |

### 7. Human-in-the-Loop
| Research node | Status | Your node / note |
|---|---|---|
| Approval / signoff task | ✅ | `humanGate` |
| Review queue + field-correction UI (bbox) | ✅ | `features/annotation/hitl/` |
| Annotation capture | ✅ | `document.storeRejection` (`annotations`) |
| **Annotation export → training store** | ❌ | Wave 3 (the open loop) |
| Multi-stage review (junior→senior) | ❌ | Wave 3 |
| Document-classification correction UI | 🟡 | Wave 3 |
| Exception handler queue | 🟡 | `document.storeRejection` + `switch` |
| Side-by-side dual-extractor diff UI | ❌ | (pairs with Wave 2 ensemble) |
| Auto-escalation on SLA timeout | ❌ | Wave 3 |

### 8. Data Transformation / Enrichment
| Research node | Status | Your node / note |
|---|---|---|
| Field-mapping / reshape | ✅ | `data.transform` |
| Format normalization (JSON/XML/CSV) | ✅ | `data.transform` |
| Lookup / join with reference table | ✅ | `tables.lookup` |
| Field value normalization | 🟡 | `ocr.normalizeFields` |
| Calculation / derived field | 🟡 | partial via `data.transform` |
| Concatenation / split / templating | 🟡 | partial via `data.transform` |
| Geocoding / address standardization | ❌ | Wave 4 |
| Currency conversion | ❌ | Wave 4 |
| Master-data enrichment | ❌ | |

### 9. Integration / Output
| Research node | Status | Your node / note |
|---|---|---|
| Database write (internal) | 🟡 | `ocr.storeResults`, `document.updateStatus` (app-internal only) |
| REST / GraphQL push (external) | ❌ | **Wave 1 `http.request`** |
| Notification (email/Slack/Teams/SMS) | ❌ | Wave 7 `notify` |
| File export (CSV/XLSX/JSON/XML/EDI/FHIR) | ❌ | Wave 7 `export` (`data.transform` serializes, can't emit) |
| ERP / accounting connector | ❌ | Wave 7 |
| CRM / case-management connector | ❌ | Wave 7 |
| ECM / DMS write | ❌ | Wave 7 |
| Data-lake / warehouse loader | ❌ | Wave 7 |
| Search-index loader | ❌ | Wave 7 |
| Vector-DB loader | ❌ | Wave 7 |
| RPA trigger | ❌ | Wave 7 |
| Audit-log emitter | ❌ | Wave 9 |

### 10. Monitoring, Analytics & Governance
| Research node | Status | Your node / note |
|---|---|---|
| Accuracy / precision metric emitter | ✅ | `benchmark.*` suite (evaluate, aggregate, compare-baseline) |
| Pipeline run logger / OpenTelemetry | 🟡 | runtime status/progress queries exist |
| STP-rate counter | ❌ | Wave 9 |
| Processing-time / SLA timer | ❌ | Wave 9 |
| Per-stage confidence-distribution exporter | ❌ | Wave 9 |
| Cost / token-usage tracker | ❌ | Wave 9 (Phase 7 stores per-message tokens) |
| Audit-trail (field-level lineage) | ❌ | Wave 9 |
| PII access logging | ❌ | Wave 9 |

### 11. Orchestration / Flow-Control
| Research node | Status | Your node / note |
|---|---|---|
| Conditional / IF / exclusive gateway | ✅ | `switch` |
| Parallel split + join / fan-out-in | ✅ | `map` + `join` |
| Loop / iterator | ✅ | `map` |
| Sub-workflow / call-activity | ✅ | `childWorkflow` |
| Error boundary / catch / compensation | ✅ | `errorPolicy` |
| Retry with backoff | ✅ | Temporal `RetryPolicy` |
| Timer / wait-for-event | ✅ | `humanGate`, `pollUntil` |
| Inclusive gateway (multi-path) | 🟡 | multiple `switch` |
| Idempotency / dedup gate | ❌ | Wave 8 |
| Rate-limit / throttle gate | ❌ | Wave 8 |
| Dead-letter / poison queue | ❌ | Wave 8 |
| Session / host-affinity chain | ❌ | Wave 8 |
| Versioned-pipeline canary / A-B router | ❌ | Wave 8 |
| Ad-hoc / agentic sub-process | 🟡 | Phase 7 is build-time; in-pipeline agentic deferred |

---

## Part 1b — Second-pass taxonomy (extended gaps, verified against code)
Source: follow-up research audit (7 gaps + 3 smaller). Each verified against source.

| # | Capability | Status | Your system / wave |
|---|---|---|---|
| G1 | **Document lifecycle / retention / disposition** — retention-policy assigner, legal-hold gate, archive-to-cold-storage, retention-expiry secure-delete, document-vault writer | ❌ | none — **Wave 11 (new)** |
| G2 | **E-signature / digital approval** — DocuSign/Adobe Sign request, signature validation, notarization/timestamp | ❌ | `Segment<Signature>` is OCR *detection*, NOT e-signing — **Wave 7** (connector/template territory) |
| G3 | **Testing / evaluation / benchmarking** | ✅ mostly | `benchmark.*` suite (11 activities): dataset mgmt (`materializeDataset`, `loadDatasetManifest`), accuracy/precision/recall/F1 (`evaluate`), baseline + regression (`compareAgainstBaseline`). **Missing:** A/B-on-live-traffic, shadow-pipeline runner → **Wave 8** |
| G4 | **Batch vs real-time** — batch collector (accumulate N or wait T), batch splitter, batch-mode setting | ❌ | `map`/`join` is fan-out, not accumulation — **Wave 8** |
| G5 | **Industry output formats** — EDI/X12, FHIR, HL7v2, XBRL, ACORD, UBL/Peppol, SWIFT MT/MX | ❌ | ⚠️ **mandate tension** — document/industry-specific; ship as dynamic-nodes / connectors / templates, not generic-engine code — **Wave 7 (as content)** |
| G6 | **Redaction as first-class** — PII/PHI detector (separate), redaction renderer (new redacted PDF), synthetic-data masker, redaction audit logger | ❌ | expands Wave 4's single "PII redaction" line into a suite — **Wave 4** |
| G7 | **Multi-tenancy / workspace isolation** | ✅ | **pervasive** via `groupId` — workflows, lineage, dynamic nodes, HITL, audit, chat — and **enforced at the Temporal activity boundary** (`buildActivityParams`; a MEMBER author cannot forge/override it). No wave needed |
| G8 | **Document comparison / diff** — delta between two document versions | ❌ | distinct from `benchmark.compareAgainstBaseline` (pred-vs-truth) — **Wave 6** |
| G9 | **Outbound webhook / callback** — async reply to a caller-provided callback URL | ❌ | inbound `source.api` only; mechanics covered by Wave 1 `http.request` — **Wave 7** |
| G10 | **Cost / budget estimation gate** — pre-execution token/cost estimate + budget refusal | 🟡 | post-exec token tracking exists (Phase 7 chat, AI-recommendation); pre-flight estimate + gate missing — **Wave 8** |

**Takeaway:** G3 (eval) and G7 (tenancy) are already strong; G10 partial. The rest are genuine gaps, and **G1 is a whole new category** (lifecycle/retention) absent from the first research pass.

## Part 2 — Cross-cutting platform resources (research §B)
| Resource | Status | Note |
|---|---|---|
| Pipeline / Workflow version | ✅ | immutable `WorkflowVersion` + lineage |
| Model / Template registry | 🟡 | versioning exists for workflows + dynamic nodes; not for ML models |
| Taxonomy / Schema | 🟡 | `ctx` declarations + typed `kind`s; no dedicated editor |
| Dataset / Document Manager | 🟡 | **benchmark dataset machinery exists** (`materializeDataset`, `loadDatasetManifest`, ground-truth eval); HITL-correction capture missing → **Wave 3** unifies them |
| Connector / Credential vault | ❌ | env-only today → **Wave 1 touches this** (secret-ref), Wave 10 formalizes |
| Review-queue configuration | 🟡 | HITL exists; no assignment/escalation/SLA config |
| Audit / lineage store | 🟡 | `audit.service` persists group-scoped events; field-level lineage + PII-access logging missing → Wave 9 |
| Multi-tenancy / workspace isolation | ✅ | pervasive `groupId` scoping, enforced at the Temporal activity boundary (second-pass G7) |

## Part 2a — Schema evolution & migration (engine policy)

Not a node wave — a cross-cutting **engine policy + validator** concern. The scariest case is already solved: in-flight runs snapshot their config (`configHash`) at start and Temporal replays the frozen graph, so editing a definition never corrupts running instances. Four thin spots remain:

| Risk | Policy / mechanism | Lands in |
|---|---|---|
| **Artifact-kind vocabulary change** (frozen v1 registry + live dynamic map) — removing/repurposing a kind breaks binding-walk on old graphs | **Append-only + deprecate-not-delete** (API-evolution discipline); optional lazy `old→new` kind-rewrite on workflow load | Wave 0 engine policy + validator |
| **Library / dynamic-node signature change on *upgrade*** (pinned refs already safe) | Classify each new version **additive (compatible)** vs **breaking (port removed/retyped)**; validator surfaces "safe upgrade" vs "re-map needed" | Validator (Wave 2/10) |
| **Interpreter semantic change** (`runnerVersion`) | Policy: changes must be **backward-compatible or Temporal-patched** | Wave 0 engine policy |
| **Extraction-schema / dataset evolution** | **Versioned datasets** + schema-version stamp on each correction example | Wave 3 |

## Part 3a — Standards & interop (research §D)
| Item | Status | Note / wave |
|---|---|---|
| JSON Schema (extraction schemas) | ✅ | already used for node params + dynamic-node signatures |
| DMN 1.x decision tables | 🟡 | Wave 1 ships a DMN-lite rule node; full DMN engine optional |
| BPMN 2.0 export / import | ❌ | optional interop — **Wave 10 (deferred)**; ship a Camunda-flavoured extension namespace if pursued |
| CMMN (case-style flows) | ❌ | optional; relevant only if case-management exception flows are needed |
| PDF/A archival output | ❌ | optional; an `export` variant in Wave 7 if archival compliance is required |
| XMP metadata embedding | ❌ | optional; pairs with PDF/A export |
| AsyncAPI (event-driven pipeline contracts) | ❌ | optional; documents the Wave 5 event-source surface |

## Part 3 — Design patterns (research §C)
| Pattern | Status | Note |
|---|---|---|
| Document as first-class variable | ✅ | typed artifacts |
| LLM as enrichment, not pipeline | ✅ | philosophy already followed |
| Parent-orchestrator + child workflow | ✅ | `childWorkflow` |
| Confidence-gated routing | 🟡 | OCR-coupled → Wave 1 generalizes |
| Page-level vs document-level toggle | 🟡 | Wave 2 |
| Scope nodes (pluggable algorithms) | ❌ | Wave 2 (ensemble) |
| Multi-provider as configuration | ❌ | Wave 2 |
| Confidence-weighted consolidation | ❌ | Wave 2 |
| HITL as feedback fork | ❌ | Wave 3 |
| Sessions / host-affinity | ❌ | Wave 8 |
| Discovery / auto-onboarding wizard | ❌ | Wave 10 |
| Starter pipeline templates | ❌ | Wave 10 |

---

## Part 4 — The TOTAL wave plan

Generic-spine-first. Waves 1–4 build/deepen reusable capability; 5–7 broaden the surface; 8–10 are scale, observability, and platform polish. Waves 5+ are freely reprioritizable.

| Wave | Theme | Delivers | Closes |
|---|---|---|---|
| **1** | **Generic primitive spine** | `http.request`; `llm.structured` (decoupled from OCR); generic **rule/validation** node (schema/regex/DMN-lite/cross-field); generic **confidence gate** (decoupled from OCR) | §6, §9 (REST), §5 (LLM), patterns: confidence-gated routing |
| **2** | **Provider abstraction & ensemble** *(at the documented revisit trigger — NOT "fix the topology")* | Engines are separate activities by **deliberate decision** (`EXTRACTION_PROVIDER_ARCHITECTURE.md`: extract a shared interface only if 2 new engines duplicate ≥30 lines). The 5 experiment engines + ensemble combiner now satisfy that trigger → **evaluate, extract only if it fires**. SDPR's second-pass/ensemble need is met by *topology* (multi-extract + the existing combiner) — no abstraction required to ship it | §4; deliberate-deferral revisit |
| **3** | **HITL feedback loop + Dataset** | corrections → **Dataset** resource → few-shot/retraining; multi-stage review; classification-correction UI; auto-escalation | §7 (loop), §B Dataset, pattern: feedback fork |
| **4** | **NLP / AI enrichment** | PII/PHI redaction, summarization, translation, NER, RAG/vector enrichment, sentiment; geocoding/currency/master-data | §5, §8 (advanced) |
| **5** | **Ingestion expansion** | pull sources: S3/blob, email/IMAP, SFTP, SharePoint/Drive/Box, scheduled/cron, DB BLOB, webhook semantics | §1 |
| **6** | **Pre-processing & extraction depth** | image cleanup (binarize/contrast/DPI), MIME routing, text-vs-image detect, PDF password removal, page dedup, PII pre-mask; specialist extractors (regex/template/forms/table/handwriting/barcode/identity) | §2, §4 specialists |
| **7** | **Integration connectors & output** | `notify` (Slack/Teams/email); `export` (CSV/XLSX/XML/EDI/FHIR → S3/SFTP/file); ERP/CRM/ECM connectors; data-lake/search/vector loaders; RPA trigger | §9 |
| **8** | **Orchestration & scale** | idempotency/dedup gate, rate-limit/throttle, dead-letter queue, session/host-affinity, inclusive gateway, canary/A-B version router, in-pipeline agentic sub-process | §11, patterns: sessions |
| **9** | **Monitoring, analytics & governance** | STP-rate, accuracy emitter (extend benchmark), confidence-distribution exporter, SLA timer, cost/token tracker, audit-trail + field-level lineage, PII access logging, OTel | §10, §B audit |
| **10** | **Platform resources & onboarding** | Taxonomy/Schema editor; ML-Model/Template registry; Connector/Credential **vault** (replaces env-only); Review-queue config; "learn from samples" discovery wizard; 2–3 starter templates | §B, patterns: discovery/templates |
| **11** | **Document lifecycle, retention & disposition** *(new — second-pass G1)* | Retention-policy assigner, legal-hold gate, archive-to-cold-storage, retention-expiry secure-delete, document-vault writer, redaction audit logger | G1 (regulated-industry compliance: SEC 17a-4, HIPAA, GDPR erasure) |
| **12** | **Operational alerting & run intervention** *(end — may be externally owned)* | Wire workflow-failure signals into the **proactive-alerting** stack (`app_alert_active{type="workflow_activity_failed"}` → Alertmanager → Teams/email); per-run drill-in + retry-node / resume / edit-and-rerun surface | run observability gap; consumes [proactive-alerting](../20260507120000-proactive-alerting/) (someone else may own the alerting side) |

**Second-pass items folded into existing waves:**
- **Wave 3** — `Dataset` resource now explicitly unifies HITL corrections with the existing benchmark ground-truth machinery (half-built).
- **Wave 4** — expand "PII redaction" into the G6 suite: PII/PHI detector · redaction renderer (new PDF) · synthetic-data masker · redaction audit.
- **Wave 6** — add G8 document comparison / diff (delta between two versions).
- **Wave 7** — add G2 e-signature, G5 industry-format generators *(as content/connectors, not engine — mandate)*, G9 outbound callback/webhook *(uses Wave 1 `http.request`)*.
- **Wave 8** — add G4 batch collector/splitter, G3's A/B-on-live-traffic + shadow-pipeline runner, G10 pre-execution cost/budget estimator gate.
- **Wave 9** — note G3 eval (accuracy/F1/baseline/regression) is **already largely delivered** by the `benchmark.*` suite; remaining is STP-rate, confidence-distribution, field-level lineage, PII-access logging.
- **No wave** — G7 multi-tenancy already pervasive; G3 core eval already built.

### Headline coverage today
- **Fully covered:** orchestration/flow-control (§11 core), document pre-processing basics (§2), classification (§3 core), OCR (§4 core), HITL capture (§7), data transform (§8 core), workflow versioning (§B), **evaluation/benchmarking (G3)**, **multi-tenancy (G7)**.
- **Biggest empty surfaces:** external integration/output (§9), NLP enrichment + redaction (§5/G6), ingestion breadth (§1), monitoring/governance (§10), platform resources (§B Credential vault), **document lifecycle/retention (G1)**, **e-signature (G2)**.

---

## Part 5 — Open decision
Confirm this **total** wave plan (or reprioritize). Then we brainstorm **Wave 1** as the first sub-project — its own spec → plan → implementation cycle — starting with whichever primitive you choose first.

---

## Part 6 — Canonical-pipeline gauntlet (demand grounding via construction)

**Purpose:** build each pipeline end-to-end as a **library-workflow template**; every point you *can't* build it with current nodes is a demand signal that prioritizes the backlog. **#0 (SDPR) has a real client** and is the primary forcing function; the rest are chosen by **cross-vendor revealed preference** (Azure DI, Google Document AI, AWS Textract, UiPath DU, Rossum, Nanonets, Mindee, Veryfi galleries — the real "80%" pipelines) to cover pipeline shapes SDPR doesn't.

**Shape legend:** [S] simple extraction · [C] classify/split packet · [V] business-rule validation · [H] human review · [X] cross-document match

| # | Pipeline | Shape | Capabilities it exercises (waves) | Buildable today? |
|---|---|---|---|---|
| **0** | **SDPR monthly report** → extract (neural DI) → numeric-zero recovery → normalize (SIN/date/name) → **ICM cross-validation** → business-rule checks → **per-field risk gate** → tiered **HITL inline editor** | [S][V][H] | `http.request` (ICM lookup, W1) · rule/validation (W1) · **per-field** confidence gate (W1) · `llm.structured` name-match (W1) · HITL inline editor (W3, prototyped E09) | partial — **the Wave-1 driver; real client** ([report](./reports/SDPR_OCR_Performance_Report_V2.md) §§6–7, 10) |
| 1 | **Invoice** → validate totals → push to system | [S][V][H] | extract · rule/validation (W1) · `http.request` (W1) · confidence gate + HITL | mostly — needs W1 http.request + generic rule node |
| 2 | **Receipt / expense** → totals check → aggregate | [S][V] | extract · validation · `data.transform` | ✅ today |
| 3 | **Bank statement** → transaction-table extract | [S][C] | multi-page split · table extract | mostly |
| 4 | **ID doc / passport** → classify type → validate authenticity → review | [S][C][V][H] | classify · validation · HITL · fraud signals (LLM/enrich) | partial |
| 5 | **Mortgage / lending packet** → split → classify pages → route per type → extract → consolidate → review | [C][V][H] | split/classify · map/join · `childWorkflow` · HITL — **the flagship packet pipeline** | partial *(the stress test)* |
| 6 | **W-2 / 1099 batch** → multi-copy split → extract | [S][C] | split · classify | mostly |
| 7 | **PO + packing list / BoL** → 3-way match vs invoice | [S][V][X] | extract · `tables.lookup` · cross-doc validation | partial — needs cross-doc match |
| 8 | **Contract** → clause/party extract → summarize → review | [S][H] | `llm.structured` (W1) · summarization (W4) · HITL | needs W1/W4 |
| 9 | **Health claim (CMS 1500 / UB04)** or **ACORD certificate** → validate → route | [S][V][H] | extract · validation · HITL · retention (W11) | partial |

Covers every pipeline shape across finance/AP, identity, HR, tax, lending, healthcare, insurance, legal, and logistics. **Build #0 (SDPR) first** — real client, exercises the full Wave-1 + Wave-3 chain end-to-end; its report flags several knobs (**risk thresholds, ICM lookup key, date validation, second-pass engine**) as *undefined* → build them **configurable**. Then #1 / #5 / #8 stress-test the rest (packet split, cross-doc match, summarization).

Each template triples as: (1) a **demand signal** (what's missing), (2) a shippable **starter template** (Wave 10), and (3) a **regression fixture** feeding the benchmark/eval suite (G3).

**Sources:** Azure DI model list · Google Document AI processor gallery + Lending DocAI · AWS Textract AnalyzeExpense/AnalyzeID/AnalyzeLending · UiPath DU out-of-the-box ML packages · Rossum supported document types · Nanonets pre-built models · Mindee/Veryfi extraction models.

---

## Part 7 — Prototyped-in map (experiments → waves)

Several waves are **not greenfield** — the stacked experiment PRs (#155–#184) already prototype them. The work is **productionize-from-here**, not build-from-scratch.

| Capability | Wave | Prototyped in |
|---|---|---|
| Dataset seeding + benchmark/eval harness | 3 / G3 | harness `feature/extraction-experiments` (#155) |
| `llm.structured` (VLM/LLM structured extraction) | 1 | E04 VLM-direct (#159), E05/E07/E08 VLM+OCR hybrid (#160/#164/#165) |
| New extraction engines (Neural DI, Mistral-on-Azure, Content Understanding) | 2 | E01–E03 (#156–#158) |
| Ensemble / second-pass combiner + cross-engine evaluator | 2 | `improve/03` (#163) |
| HITL inline editor (SDPR) | 3 / #0 | E09 `experiment/09-sdpr-hitl-committed` (#184) |
| Numeric-zero recovery | #0 | `ocr.recoverNumericZerosFromCheckboxes` (already an activity) |

**Branch plan:** new branch off `feature/visual-workflow-builder`, experiment chain merged in **merge-only / never-rebase the foundation** (Option B), when Alex says go. Cost/usage telemetry is a known gap (`EXTRACTION_PROVIDER_ARCHITECTURE.md` item 12 → G10/Wave 9).
