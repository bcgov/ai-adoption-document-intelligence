# A Comprehensive Taxonomy of Nodes, Activities, and Components for an Intelligent Document Processing (IDP) Workflow Builder

## TL;DR
- **Across every major IDP platform (ABBYY Vantage, UiPath Document Understanding, Hyperscience Hypercell, AWS GenAI IDP Accelerator, Azure AI Document Intelligence, Google Document AI, Camunda 8 IDP, Rossum Aurora, Indico, Automation Anywhere IQ Bot), the same 7-stage runtime pipeline recurs: Ingest → Pre-process/Digitize → Classify (+ Split) → Extract → Assess/Validate → Human-in-the-Loop Review → Export/Integrate**, wrapped by orchestration primitives (branching, retries, sessions/affinity, signals) and cross-cutting concerns (taxonomy/schema management, model/template versioning, training-feedback loops, audit/STP analytics). Build to that canonical pipeline and you will be feature-compatible with every commercial system.
- **There is no formal IEEE/ISO standard for "IDP workflows."** The de-facto reference architectures are (1) BPMN 2.0 from OMG (used by Camunda for executable workflows including a new "IDP Extraction Project" task type introduced in Camunda 8.7), (2) AWS's published IDP reference architecture and open-source **GenAI IDP Accelerator** with its named runtime stages (OCR, Classification, Extraction, Assessment, Rule Validation, Summarization, plus an offline Evaluation Framework), and (3) AIIM's three-pillar framework (business strategy, governance, technology) plus the capability taxonomy promoted by the inaugural Gartner Magic Quadrant for IDP Solutions (Vashisth, Srivastava, Emmott, Joshi, Roy, 3 September 2025) and the Everest Group IDP Products PEAK Matrix Assessment 2026 (which evaluated 32 providers and named 10 Leaders: ABBYY, EdgeVerve, HCL Tech, Hyperscience, Infrrd, Microsoft, Nanonets, Rossum, Tungsten Automation, UiPath).
- **For a node-based builder, the most defensible design is to ship ~70 typed nodes across 11 categories (ingestion, pre-processing, classification/splitting, OCR/extraction, NLP/LLM, validation, HITL, transformation/enrichment, integration/output, monitoring/analytics, and orchestration/flow control), plus three cross-cutting "platform" resource types — Taxonomy/Schema, Model/Template, and Pipeline Version — exactly mirroring the resource model used by UiPath (Taxonomy + ML Packages + Pipelines) and ABBYY Vantage (Skills + Process Skills + Marketplace). LLMs should be used as enrichment/structured-output nodes inside the pipeline, not as the pipeline itself** — every IDP leader (Hyperscience, Rossum, ABBYY) is converging on a "specialized models + LLM as accelerator" architecture rather than LLM-first extraction.

---

## Key Findings

1. **The canonical IDP runtime pipeline is remarkably stable across vendors.** Mapping seven leading systems to their stage names:

   | Stage | UiPath DU | ABBYY Vantage | AWS GenAI IDP Accelerator | Hyperscience Hypercell | Azure Doc Intelligence | Automation Anywhere IQ Bot | Camunda 8 IDP |
   |---|---|---|---|---|---|---|---|
   | Intake | Load Taxonomy / Digitization | Input activity | S3 trigger | Smart intake | Submit | Pre-process | Document Handling / File Upload |
   | Pre-process | Digitization (OCR engine) | OCR activity | OCR (Textract) | Blocks (image cleanup) | Layout/OCR stage | Text segmentation + OCR | (in connector) |
   | Classify/Split | Classify Document Scope; Intelligent Keyword / ML Classifier | Classify activity; Assemble activity | Classification (page-level or holistic) | Classification Block | Classification model | Classify documents in groups | "classification" feature routes to extraction template |
   | Extract | Data Extraction Scope (ML, Forms, Regex, Intelligent Form Extractor) | Skill (Document / Process / Advanced) | Extraction (Bedrock) | Field Capture / VLM / FPT | Prebuilt/custom models | Extract document data | "IDP Extraction Project" service task (Unstructured / Structured Form) |
   | Assess/Validate | Business rules in config | Validation rules | Assessment + Rule Validation | Confidence + AI-in-the-Loop | Confidence + logprobs | Validate failed docs | (connector return + BPMN gateway) |
   | HITL | Validation Station / Action Center | Manual Review Client (multi-stage) | HITL Review (built-in queue) | Human review queues | (external) | Validator UI | BPMN User Task |
   | Train/Export | Train Classifiers/Extractors Scope; Export | Collect documents and learn | Evaluation Framework (offline) | Staggered loop / model retrain | Custom model retrain | Send to production | (out of scope) |

2. **The most influential reference architecture is AWS's GenAI IDP Accelerator** (`aws-solutions-library-samples/accelerated-intelligent-document-processing-on-aws`). Its README defines the runtime pipeline explicitly: *"Pipeline mode (default): OCR → Bedrock Classification (page-level or holistic) → Bedrock Extraction → Assessment → Rule Validation → Summarization. BDA mode: End-to-end processing with Bedrock Data Automation (BDA) → Rule Validation → Summarization."* Configuration is per-stage model selection (`classification_model_id`, `extraction_model_id`, `enable_assessment`, `enable_summarization`, `enable_evaluation`) plus user-defined extraction schemas and prompts. The accompanying arXiv paper documents the **Assessment** module producing per-attribute confidence (0.0–1.0) with bounding-box localization, triggering HITL when below a configurable threshold (default 0.8). This is the closest thing to a public "specification" of an IDP pipeline.

3. **UiPath's Document Understanding framework is the most explicit about resource separation** — it splits the design surface into four resources you must reproduce in any builder: (a) **Taxonomy** (document types + fields), (b) **Classifiers** (Keyword, Intelligent Keyword, ML, Generative), (c) **Extractors** (ML, Forms, Regex, Intelligent Form, Generative), and (d) **Pipelines** (Training, Evaluation, Full Pipelines, plus the new Auto-Fine-Tuning Loop). Activities are wrapped in **Scope** activities (Classify Document Scope, Data Extraction Scope, Train Classifiers Scope, Train Extractors Scope) — a useful design pattern: a "scope node" lets users plug in N pluggable algorithms inside a single conceptual step with majority voting / fallback.

4. **ABBYY Vantage exposes a "Skill" abstraction with a process-flow canvas** containing the activities `Input`, `Classify`, `OCR`, `Assemble` (page detection / multi-page splitting), `Skill` (extraction model invocation), `Review` (sends to Manual Review Client, optionally multi-stage with junior→senior escalation), `IF` (conditional branching), `Custom` (third-party / scripting), plus newer activities for **email/attachment import**, **document combine/split by classification**, **external AI service connector**, and **custom export scripts**. The Advanced Skill Designer adds **Deep learning**, **NLP segmentation training**, **NER**, and **address parsing** activities — a useful template for the "NLP/AI processing" node category.

5. **Hyperscience Hypercell uses a "Blocks and Flows" model** in which a goal-oriented **agent** orchestrates an ensemble of proprietary models + VLMs + LLMs, activating only the necessary Blocks per document and optimizing across "accuracy, speed, cost, or compliance thresholds." Their architecture lesson is explicit: *"LLMs should be thought of as strategic accelerators within a broader IDP pipeline,"* not the pipeline itself, because LLMs lack the traceability and cost profile needed at high volume. Hyperscience markets industry-leading rates of **99.5% accuracy and 98% automation** (per its platform page and 15 July 2025 BusinessWire release): *"Built on a proprietary model-based architecture, the Hypercell extracts structured, usable data from the most complex, handwritten, and non-machine-readable documents at industry-leading accuracy (99.5%) and automation (98%) rates."* This validates the design choice of typed extraction nodes with LLM-extractor nodes as one option among several.

6. **Camunda 8 (since 8.7, April 2025) is the only major BPMN workflow engine with native IDP primitives.** The canonical BPMN element is the **"IDP Extraction Project" service task**, configured via a hierarchy of **IDP Application → Document Extraction Template (Unstructured data extraction vs Structured form extraction) → published Connector**. Templates are configured with (1) sample documents, (2) field schema with data types, (3) per-field extraction prompts, and (4) a selected LLM (provider-pluggable: AWS Bedrock + Textract, Azure AI Document Intelligence + AI Foundry, GCP Vertex AI + Document AI, OpenAI-compatible). Documents themselves are first-class BPMN variables (FEEL expression `documents[n]`) — a pattern worth copying.

7. **n8n, Airflow, Prefect, and Temporal do not provide IDP-native nodes** beyond third-party API wrappers (n8n has community templates for OCRSpace, Tesseract.js, Mistral OCR, Nanonets, Azure Document Intelligence). For code-driven engines:
   - **Temporal**'s official Code Exchange mortgage-underwriting sample distinguishes a **fixed-flow workflow** (deterministic pipeline) from an **embedded-agent supervisor workflow** (LLM-routed) — both staying inside Temporal's durability model. Its canonical Go "File Processing" sample uses **Sessions** to pin a chain of activities (download → store → process) to a single worker host, which is essential for IDP since OCR/extraction often needs file locality. Community guidance recommends a **parent (orchestrator) workflow + per-document child workflows**.
   - **Prefect** has no IDP primitives; its design philosophy is small `@task` units (one per logical stage) plus typed **Blocks** for S3/GCS connectivity and event-driven flow triggers via webhook.
   - **Airflow** treats OCR as just another ETL ingestion source — a DAG of PythonOperators wrapping Tesseract/Textract/Vision.

8. **The inaugural Gartner Magic Quadrant for IDP Solutions** (Vashisth, Srivastava, Emmott, Joshi, Roy, 3 September 2025) evaluated 18 vendors (ABBYY, AWS, Appian, Automation Anywhere, Google, Graphwise, Hyland, Hypatos, Hyperscience, IBM, Infrrd, Laiye, Microsoft, Nanonets, OpenText, Rossum, Tungsten Automation [Kofax], UiPath). Per its press-release-quoted definition, providers are evaluated on their ability to handle diverse documents and offer *"a full range of capabilities, from document preprocessing, classification, extraction and validation through integration with downstream systems."* Hyperscience was *"positioned furthest for Completeness of Vision among 18 vendors"* (8 Sep 2025 release); other Leaders include ABBYY, UiPath, Tungsten, and Infrrd. Together with the Everest Group IDP Products PEAK Matrix 2026 (32 providers; 10 Leaders: ABBYY, EdgeVerve, HCL Tech, Hyperscience, Infrrd, Microsoft, Nanonets, Rossum, Tungsten Automation, UiPath), these reports confirm the 7-stage canonical pipeline as the industry's working "standard."

9. **Confidence-based routing is the universal design pattern** for STP-vs-HITL decisions. AWS GenAI IDP defaults to a 0.8 attribute-confidence threshold; ABBYY Vantage reports "up to 90%" out-of-the-box accuracy and routes low-confidence fields to verification queues; Rossum advertises that **Aurora 1.5 brings "Instant Learning with 276 languages, 4x faster processing of 100+ page documents"** (Rossum Aurora product page); Blue Prism, Appian, and Infrrd repeat the same architecture: per-field confidence score → threshold gate → auto-approve or route to human queue → corrections feed back into the model.

10. **Training-feedback loops ("staggered loop", "auto-fine-tune", "Collect documents and learn") are a first-class architectural feature** in every leading platform: Indico's "Staggered Loop Training" pre-labels new docs from HITL corrections; ABBYY's "Collect documents and learn" toggle on the Classify activity does the same; UiPath has the new "Auto-Fine-Tuning Loop"; Rossum's Aurora "instantly learns from every human input." A node-based builder must treat HITL not as a terminal node but as a *labeling event source* that updates the model resource attached to upstream extractor nodes.

---

## Details

### A. Taxonomy of node categories (11 categories, ~70 nodes)

Below is the synthesized, deduplicated list of node types — every node has been observed in at least one of: ABBYY Vantage, UiPath DU, Hyperscience, Kofax TotalAgility, IQ Bot, Rossum, AWS IDP, Azure DocIntel, Google Document AI, Indico, Camunda IDP, n8n IDP templates.

#### 1. Document Ingestion / Intake Nodes
- **HTTP/REST endpoint trigger** (synchronous upload) — present in every vendor; Rossum and Azure DocIntel expose REST as the primary intake.
- **Webhook receiver** (async push from external system).
- **Email/IMAP/Exchange inbox watcher** with attachment extraction — ABBYY added a dedicated "import emails and attachments" activity in Vantage 2.1; Kofax Import Connector (KIC); Rossum supports multi-channel email reception.
- **SFTP / FTPS poller**.
- **Cloud object storage trigger** (S3, GCS, Azure Blob) — AWS's reference architecture is built on an S3-ObjectCreated → Lambda trigger.
- **SharePoint / OneDrive / Google Drive / Dropbox / Box watcher**.
- **Scanner / MFP / mobile-capture intake** (TWAIN, ISIS, mobile SDK) — Kofax Capture's historical strength.
- **Fax-server intake** (still relevant in healthcare; Kofax KIC).
- **Form/portal upload trigger** (n8n form trigger, Camunda "File Upload" form component).
- **API pull from RPA bot / chatbot / case-management system**.
- **Web scraping / RPA-driven intake** (Selenium/Playwright/UiPath Kapow).
- **Database BLOB read** (for migration / backfill).

#### 2. Pre-processing / Digitization Nodes
- **MIME / file-type detection + routing** (PDF, TIFF, JPEG, PNG, DOCX, XLSX, HEIC, email .eml/.msg).
- **PDF text vs image detection** (born-digital vs scanned).
- **Page splitting / range extraction** (UiPath has "Extract PDF Page Range", "Get PDF Page Count", "Merge PDFs", "Extract PDF Images"; AWS Textract IDP CDK has a `DocumentSplitter` that chunks 2,500-page docs).
- **Document chunking** (e.g., 10-page sub-batches for parallel processing — see Netwoven Azure pattern).
- **Image deskew / rotation correction**.
- **Noise / speckle removal, binarization, despeckle**.
- **Contrast and brightness normalization**.
- **Resolution upscaling / DPI normalization** (high-resolution OCR option in Azure DocIntel).
- **PDF password / encryption removal** (UiPath "Set PDF Password" / pikepdf).
- **PII / signature / barcode-zone masking before OCR** (privacy by design).
- **Page deduplication / hash-based dedupe** (Rossum dedup is part of pre-processing).
- **Document assembly** — re-stitch separated pages into logical documents (ABBYY's "Assemble" activity).

#### 3. Classification / Routing Nodes
- **Keyword / rules classifier** (UiPath Keyword Based Classifier).
- **Intelligent Keyword Classifier** (n-gram + heuristics, UiPath).
- **ML / deep-learning classifier** (UiPath ML Classifier, Hyperscience Classification Block, Comprehend Custom Classifier).
- **VLM / multimodal classifier** (GPT-4o vision; Azure GenAI IDP sample; AWS GenAI IDP `multimodalPageLevelClassification` method).
- **Page-level vs holistic/packet classifier** (AWS IDP Accelerator exposes both methods explicitly).
- **Document splitter / unbundler** (Indico's "Automatic Document Unbundling" model; Google Procurement Doc Splitter; ABBYY Assemble).
- **Priority / SLA routing node** (route urgent docs to dedicated lane).
- **Language detection + language-based routing**.
- **Confidence-gated classification routing** (high → auto, low → manual review of *classification*, separate from extraction review — UiPath has Document Classification Validation as a distinct node).

#### 4. OCR / Extraction Nodes
- **OCR engine selector** (UiPath Document OCR, Tesseract, Omnipage, ABBYY FineReader, Microsoft OCR, Google Cloud Vision, Mistral OCR, Textract `DetectDocumentText`).
- **Multi-engine OCR ensemble / best-of-breed router** — Indico lets you swap OCR vendor per workflow; ABBYY's purpose-built engine is one option among many.
- **Layout-aware OCR** (Textract `AnalyzeDocument`, Azure DocIntel Layout, Google Form Parser, IBM Docling DocLayNet).
- **Template-based extraction** (zone/anchor-based, Kofax-style; for stable forms).
- **ML / deep-learning structured extractor** (UiPath ML Extractor, ABBYY Skill, Hyperscience Field Capture, Google Custom Extractor).
- **Forms extractor** (key-value pair detection — UiPath Forms Extractor, Azure prebuilt-layout).
- **Regex / pattern-based extractor**.
- **Table / line-item extractor** (Textract Tables, Docling TableFormer, ABBYY table model).
- **Handwriting recognition** (Textract handwriting, Hyperscience handwritten forms, ABBYY 30 handwriting languages).
- **Barcode / QR / MICR / OMR / checkbox reader** (Azure DocIntel checkboxes + signatures, ABBYY barcode).
- **Identity-document extractor** (Google Identity Proofing processor, prebuilt ID models in Azure/Textract).
- **Invoice / receipt / W-2 / 1099 specialist extractor** (Google Invoice Parser, Textract AnalyzeExpense, Azure prebuilt-invoice — these are pre-trained "skills").
- **Generative / LLM extractor with structured-output schema** (UiPath Generative Extractor; AWS Bedrock + Pydantic; Azure Content Understanding; Camunda "Unstructured data extraction").
- **Full-page transcription / single-model end-to-end** (Donut, Hyperscience FPT, BDA mode).
- **Custom extractor scope** (pluggable user algorithm — UiPath's `UiPath.DocumentProcessing.Contracts` abstract classes).

#### 5. NLP / AI Processing Nodes
- **Named entity recognition** (Comprehend default + custom entities, ABBYY NER, spaCy).
- **Custom entity recognition / fine-tuned NER**.
- **PII / PHI detection and redaction** (Comprehend PII, Comprehend Medical PHI, Azure Language).
- **Sentiment analysis** (Comprehend sentiment, ABBYY sentiment recognition added in Vantage 2024).
- **Summarization** (AWS IDP Accelerator's `enable_summarization`; ABBYY document summarization).
- **Translation** (NMT step before extraction for multilingual pipelines).
- **Address parser / normalizer** (ABBYY Advanced Skill Designer parse-address activity).
- **LLM prompt / structured-output extraction** (Pydantic schema + logprobs as confidence — Azure GenAI sample pattern).
- **RAG / vector-store enrichment** — ground extracted entities against a knowledge base.
- **Document Q&A / chat-with-doc** (Mistral document understanding, Hyperscience document chat, Camunda agentic ad-hoc sub-process).

#### 6. Validation & Verification Nodes
- **Field-level confidence threshold gate** (the universal STP knob — default 0.8 in AWS GenAI IDP).
- **Cross-field business-rule validator** (e.g., subtotal + tax = total; date_issued ≤ date_due) — Kofax Rules Management, Camunda DMN decision tables, AWS "Rule Validation" stage.
- **DMN decision-table node** (Camunda's "business rule task").
- **External lookup validator** (vendor exists in ERP, customer in CRM, VIN against DMV) — Rossum Master Data Hub.
- **Three-way match** (PO ↔ invoice ↔ receipt — Rossum native).
- **Duplicate / fraud detection** (hash-based dedup + Rossum's documented "fraudulent or duplicate documents" detection).
- **Schema / data-type / regex validator**.
- **Spatial grounding validator** — every extracted field must point to a bounding box in the source (the AWS Assessment module produces "spatial localization via bounding box coordinates").
- **Cross-document consistency validator** (within a packet/case).
- **Compliance / policy checker** (regulated industries).

#### 7. Human-in-the-Loop (HITL) Nodes
- **Review queue / task inbox** (UiPath Action Center, Hyperscience review queue, ABBYY Manual Review Client, AWS A2I, IQ Bot Validator).
- **Multi-stage review** (junior → senior escalation by rule, ABBYY Manual Review supports this natively).
- **Field-correction / labeling UI** (with bounding-box overlay).
- **Document classification correction UI** (separate from field correction — UiPath "Document Classification Validation").
- **Approval / signoff task** (BPMN user task with form).
- **Exception handler queue** (failed OCR, unsupported file types).
- **Side-by-side dual-extractor diff UI** (Microsoft's recent IDP sample shows Azure CU vs DSPy LLM in a comparison panel).
- **Auto-escalation on SLA timeout**.
- **Annotation export to training-data store** (closes the loop to model retraining).

#### 8. Data Transformation / Enrichment Nodes
- **Field-mapping / rename / reshape** (JSONata, JMESPath, FEEL).
- **Format normalization** (date formats, currencies, units, country codes).
- **Lookup / join with reference table** (database, API, Excel master file).
- **Calculation / derived field** (DTI, LTV in Temporal's mortgage sample; line-item sum).
- **Concatenation / split / templating**.
- **Geocoding / address standardization**.
- **Currency conversion**.
- **Master Data enrichment** (Rossum Master Data Hub; ABBYY data warehouse for analytics).

#### 9. Integration / Output Nodes
- **Database write** (SQL, NoSQL, BigQuery, Snowflake).
- **REST / GraphQL API push**.
- **ERP / accounting connector** (SAP, NetSuite, QuickBooks, Sage, Microsoft Dynamics, Xero — Rossum and Kofax ship these as prebuilt connectors).
- **CRM / case-management connector** (Salesforce, Dynamics, ServiceNow).
- **ECM / DMS write** (SharePoint, OpenText, Box, M-Files).
- **Data-lake / warehouse loader** (Delta, Iceberg, S3 partitions for analytics).
- **Search index loader** (Elasticsearch, Azure AI Search, OpenSearch).
- **Vector-DB loader** (for downstream RAG — common Azure GenAI IDP pattern).
- **RPA trigger** (UiPath Orchestrator, Automation Anywhere Control Room, Blue Prism queue add).
- **Notification node** (email, Slack, Teams, SMS, webhook).
- **File export** (CSV, XLSX, JSON, XML, EDI, FHIR for healthcare).
- **Audit-log emitter** (separate from monitoring — typically writes immutable record).

#### 10. Monitoring, Analytics & Governance Nodes
- **Pipeline run logger / OpenTelemetry emitter** (Azure DocIntel sample uses OpenTelemetry; AWS uses CloudWatch + CloudTrail).
- **STP-rate counter** (% of docs auto-approved end-to-end).
- **Accuracy / field-precision metric emitter** (Document AI auto-generates precision/recall; AWS Evaluation Framework compares against ground truth).
- **Processing-time / SLA timer**.
- **Per-stage confidence-distribution exporter** (heatmap of which fields routinely fall below threshold — guides retraining priorities).
- **Cost / token-usage tracker** (critical for LLM-heavy pipelines).
- **Audit-trail node** (who accessed, who corrected, when — Rossum SOC 2 / ISO 27001 controls).
- **PII access logging** (HIPAA / GDPR).

#### 11. Orchestration / Flow-Control Nodes
- **Conditional branch / IF / exclusive gateway** (BPMN exclusive; ABBYY "IF" activity).
- **Parallel split + join / fan-out / fan-in** (Map state in Step Functions, BPMN parallel gateway).
- **Inclusive gateway** (multiple paths can fire).
- **Loop / iterator over pages or line items**.
- **Sub-workflow / call-activity** (composability — UiPath Document Understanding Process is a template).
- **Error boundary / catch / compensation** (BPMN error events; Temporal activity heartbeats and retries).
- **Retry with exponential backoff**.
- **Timer / wait-for-event** (Temporal signals, Camunda message catch event — used to wait for HITL).
- **Session / host-affinity activity chain** (Temporal's Session API — keep download + OCR + extract on the same worker).
- **Dead-letter / poison-message queue**.
- **Idempotency key / dedup gate** (hash of file + version).
- **Rate-limit / throttle gate** (cap calls to Textract or OpenAI).
- **Sub-process for "ad-hoc / agentic" tasks** (Camunda BPMN ad-hoc sub-process, Hyperscience goal-oriented agent).
- **Versioned-pipeline router** (canary/A/B between pipeline versions).

### B. Cross-cutting platform resources (not nodes — first-class objects)

These belong in the platform's resource model, not on the canvas:

1. **Taxonomy / Schema** — document types and target fields with data types, multiplicity, hierarchy (UiPath Taxonomy Manager; Camunda's "fields with data types and prompts per field"; AWS schemas).
2. **Model / Skill / Template registry** — versioned classifiers, extractors, splitters with promotion through stable / RC / pinned versions (Google Document AI's `pretrained-TYPE-vX.X-YYYY-MM-DD` versioning, with Google Stable + Google RC channels and user versions; ABBYY Marketplace; Hyperscience model packs).
3. **Pipeline / Workflow version** — the canvas itself must be versioned, with traffic-shadowing or canary deployment.
4. **Dataset / Document Manager** — labeled corpus per model (UiPath Data Manager, Indico Workflow Canvas datasets, ABBYY Vantage training docs).
5. **Connector / Credential vault** (Camunda Connector secrets, Rossum Store, ABBYY Marketplace connectors).
6. **Review queue configuration** (assignment rules, escalation policies, SLAs).
7. **Audit / lineage store** (immutable record of every field's source bounding box + reviewer corrections).

### C. Key design patterns to bake into the builder

1. **Confidence-gated routing as a first-class pattern.** Every extractor node should emit `value`, `confidence`, and `bounding_box` per field; every downstream gate should compose a threshold expression. Default threshold 0.8 (AWS), but expose per-field thresholds (critical fields like `iban` or `dosage` should be 0.99).
2. **Scope nodes containing pluggable algorithms** (UiPath pattern). A single "Classify" node on canvas can contain N classifiers running in parallel with majority-vote or fallback semantics — far more usable than forcing the user to wire four nodes.
3. **Multi-provider OCR strategy as configuration, not topology.** Indico, Rossum, Camunda all let you swap OCR vendor per workflow without redrawing the diagram. Ship an "OCR" node whose engine is a property, with a fallback chain (e.g., Textract → Azure → Tesseract on failure) and an ensemble mode (run all, pick highest confidence or vote).
4. **Page-level vs document-level / packet processing as a node-level toggle.** AWS GenAI IDP's `classification.method` is `multimodalPageLevelClassification` or holistic — same idea applies to extraction. Don't force users to choose at the pipeline level.
5. **HITL is not a terminal — it's a feedback fork.** Every review activity should have two exits: "approved → continue" *and* "corrections → training-data store." This is what Indico's "Staggered Loop" and ABBYY's "Collect documents and learn" toggle implement.
6. **Document as first-class variable** (Camunda pattern). Use a `Document` reference type (URI + metadata + page-range + bounding-box overlay layer) rather than passing raw bytes between nodes; this is what enables auditability and re-processing.
7. **Sessions / host-affinity for heavy workloads.** Borrow Temporal's Session API pattern: a "Document Session" scope that pins ingest → OCR → extract activities to the same worker, avoiding network shuffling of large PDFs.
8. **Parent-orchestrator + per-document child workflow** (Temporal community pattern). Scales to millions of files because each document has its own state machine.
9. **Pattern modes** (AWS naming — Pattern 1 BDA / Pattern 2 Textract+Bedrock / Pattern 3 SageMaker+Bedrock). Ship 2–3 opinionated "starter pipelines" for the 80% case.
10. **LLM as enrichment, not as pipeline.** Use LLM nodes for: structured extraction with Pydantic schema, classification when no training data exists, summarization, validation reasoning, generative correction suggestions in the HITL UI — but keep specialized models (layout, OCR, table) as the spine for cost and audit (Hyperscience's published position).
11. **Confidence-weighted consolidation across multiple extractors** (Microsoft sample's `consolidate_extractions` tool merges Azure DocIntel + DSPy LLM by confidence-weighted selection; AWS Assessment module similarly cross-references OCR text + image).
12. **Discovery / auto-onboarding nodes.** AWS GenAI IDP has a "pattern-neutral Discovery" step that infers a BDA blueprint from samples; UiPath has an Auto-Fine-Tuning Loop. Ship a "learn from a folder of samples" wizard.

### D. Where standards actually exist (and where they don't)

- **BPMN 2.0 (OMG)** is the only widely adopted executable standard, and Camunda's 8.7 IDP integration shows BPMN can carry IDP semantics natively via service tasks ("IDP Extraction Project") plus the new document-handling primitive. If you want export/import interop, support BPMN 2.0 XML export.
- **DMN 1.x (OMG)** for decision tables — use this for business-rule validation nodes.
- **CMMN (OMG)** for case-style workflows where order isn't fixed — relevant for exception handling.
- **No IDP-specific standard from IEEE, ISO, or AIIM.** AIIM publishes the three-pillar framework (business strategy, governance, technology) and benchmark research, not a node taxonomy. Gartner and Everest Group publish capability taxonomies that match the 7-stage pipeline but are commercial/proprietary.
- **W3C / OASIS standards relevant adjacent**: PDF/A (archival), XMP (metadata), JSON Schema (extraction schemas), AsyncAPI (event-driven pipelines).

### E. Open-source and reference implementations to mine for ideas

| Project | License | Strength for taxonomy |
|---|---|---|
| **AWS GenAI IDP Accelerator** (`aws-solutions-library-samples/accelerated-intelligent-document-processing-on-aws`) | Apache 2.0 | Best public spec of the 6-stage runtime pipeline; modular config; Pattern 1/2/3 templates |
| **`aws-samples/amazon-textract-idp-cdk-constructs`** | Apache 2.0 | CDK constructs for individual stages — direct mapping to "node" concept |
| **Azure `ai-document-processing-pipeline`** (Durable Functions) | MIT | Workflow/Activity separation, confidence aggregation, OpenTelemetry |
| **Docling (IBM)** — 60,400 GitHub stars as of 26 May 2026 | MIT | Modular pre-processing + layout (DocLayNet) + table (TableFormer) — perfect open-source backbone for the "OCR/extraction" category |
| **Unstructured.io** | Apache 2.0 (core) | Format adapters, partitioning strategies |
| **Documind** | MIT | LLM-based schema-driven extraction reference |
| **Camunda 8 IDP samples** | Source-available | BPMN modeling of IDP |
| **Temporal `samples-go` File Processing & Code Exchange mortgage demo** | MIT | Session/affinity, parent-child workflow, fixed-flow vs agentic patterns |

### F. Caveats and source-quality notes
- Most analyst figures come from vendor press releases that quote the underlying Gartner / Everest reports; the primary Gartner MQ (Vashisth et al., 3 Sept 2025) and Everest PEAK Matrix 2026 reports are paywalled — use vendor-quoted definitions carefully.
- Camunda 8's IDP feature was introduced in 8.7 (April 2025) and is actively evolving — the named task type may rename in later versions.
- AWS Textract's older `amazon-textract-serverless-large-scale-document-processing` repo is being phased out by 2023-09-30 and superseded by the CDK-constructs/Accelerator repos.
- Vendor accuracy claims (Hyperscience's published 99.5% accuracy / 98% automation; ABBYY "up to 90%" out-of-the-box; Rossum Aurora 1.5's "4x faster processing of 100+ page documents") are marketing-attested, not independently benchmarked; treat as directional.
- Docling growth metrics evolve quickly — earlier secondary sources cited 30k–37k stars; the current GitHub count is 60,400 stars (26 May 2026).
- "BDA mode" in AWS IDP Accelerator refers to Bedrock Data Automation, a managed offering distinct from raw Bedrock + Textract.

---

## Recommendations

**Build in three stages, with explicit go/no-go thresholds.**

### Stage 1 — MVP (first 8 weeks): build the canonical 7-stage pipeline as opinionated typed nodes.
Ship exactly these nodes first: `S3/HTTP/Email Trigger`, `Pre-process` (deskew, split, page-range), `Classify` (with pluggable engine: ML/LLM/keyword), `OCR/Extract` (with pluggable engine), `Validate` (confidence threshold + DMN-style rule), `HITL Review`, `Export` (DB/API/ERP). Add the orchestration primitives: `If`, `Parallel`, `Loop`, `Try/Catch`, `Retry`. Use a `Document` first-class variable type. **Threshold to advance:** an internal user can wire an invoice-to-NetSuite pipeline end-to-end in under 30 minutes.

### Stage 2 — Differentiation (weeks 9–20): platform resources + feedback loop.
Add the **Taxonomy/Schema editor**, **Model registry with versioned channels** (Stable/RC/User), **Document Manager** for labeled training data, **HITL → training-store feedback loop**, and **per-pipeline analytics dashboard** (STP rate, accuracy, processing time, confidence distribution). Add **multi-engine OCR ensemble** and **scope nodes** that contain N pluggable classifiers/extractors. **Threshold to advance:** customers report STP rate improvement of >10 pts after one round of HITL-driven retraining.

### Stage 3 — Enterprise (weeks 21–40): governance, scale, and agentic patterns.
Add **BPMN 2.0 XML export/import**, **pipeline versioning with canary deployment**, **audit-trail with field-level lineage**, **PII/PHI auto-redaction**, **session/host-affinity activity chains** (Temporal-style), **agentic ad-hoc sub-process** (Camunda-style; Hyperscience-style goal-oriented agent), and **Pattern Library** of 6–10 starter templates (invoice-to-ERP, ID verification, mortgage packet, claim adjudication, contract metadata, lab report). **Threshold to advance:** pass a SOC 2 Type II audit and process a million-document backfill without manual intervention.

**Benchmarks that should change the plan:**
- If LLM API costs exceed 30% of total processing cost: re-architect to use a layout/structured-extraction model as the spine and LLM only on low-confidence residual fields (Hyperscience's published position).
- If HITL queue grows faster than throughput: lowering confidence thresholds is the *wrong* fix; instead invest in the feedback-loop wiring (Stage 2) and per-field threshold tuning.
- If users keep asking for "agentic" routing: adopt Camunda's BPMN ad-hoc sub-process + Temporal's embedded-agent supervisor pattern — but only after the deterministic pipeline is stable, because agentic routing destroys auditability if you haven't first solved spatial grounding and bounding-box lineage.
- If multiple OCR engines is requested: implement the ensemble pattern (run N, vote by confidence) before adding a fourth engine — most accuracy gains come from ensembling two, not from adding more.

## Caveats
- Treat all vendor accuracy / STP percentage claims as directional, not benchmarked; the only public head-to-head numbers come from arXiv benchmarks of open-source toolkits (Docling vs Unstructured vs LlamaParse), not from commercial IDPs.
- The Gartner MQ and Everest PEAK Matrix reports are commercial and access-gated; their vendor lists are evidence of market structure, not endorsement.
- Camunda 8 IDP, AWS GenAI IDP Accelerator, and UiPath's Auto-Fine-Tuning Loop are all <18 months old at time of writing; expect breaking API changes.
- BPMN export interop is partial — service-task semantics for AI/IDP are not yet standardized in BPMN 2.0; expect to ship a Camunda-flavored extension namespace if you support it.
- Open-source IDP projects (Docling, Unstructured, Documind) are excellent for components but none provide an end-to-end node-based builder — that is currently a market gap your product can fill.