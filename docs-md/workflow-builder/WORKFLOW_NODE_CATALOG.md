# Workflow Builder — Node Catalog

**Audience:** Product designer designing the per-node settings panels for the workflow builder.
**Purpose:** A complete, plain-language reference of every node available in the workflow builder. Each entry describes what the node does, what category it belongs to, and exactly which fields its settings panel needs to expose.

This is the companion to [WORKFLOW_DESIGN_BRIEF.md](WORKFLOW_DESIGN_BRIEF.md), which describes the overall builder experience and the canvas-level decisions.

---

## How to read this document

Every node has the same outline:

- **Display name** — what the user sees in the palette.
- **Category** — which palette section it belongs to.
- **Visual cue** — suggested color/icon hint (final visuals are designer's call).
- **One-line description** — what it does.
- **When to use it** — typical scenarios.
- **Settings panel — Inputs ("This step reads")** — for each input slot, the user picks from a dropdown that autocompletes from available upstream node outputs and trigger inputs (or types a dotted path like `currentSegment.blobKey`).
- **Settings panel — Outputs ("This step produces")** — for each output slot, the user names the result. That name instantly becomes available in every downstream node's input picker.
- **Settings panel — Static parameters** — values that aren't read from the notebook; they're typed in directly or chosen from a dropdown.
- **Common settings** — applies to most nodes (label, timeouts, retries, error handling). Listed once at the bottom of this document; the per-node entries say "Standard" when they all apply, or call out exceptions.

When a parameter is **required** vs **optional**, that's noted. Optional parameters with sensible defaults should be collapsed into an "Advanced" section by default to keep the UI clean.

---

## Standard settings (apply to most nodes)

These appear on every Activity, Wait & Retry, and most other operational nodes. The settings panel should show them as collapsible sections.

### Identification
- **Label** *(text, required)* — A human-readable name shown on the canvas. Defaults to the node-type's display name.
- **Notes** *(long text, optional)* — Free-form notes for the workflow author.

### Timeouts (collapsed by default; sensible defaults from registry)
- **Single-attempt timeout** *(duration, default varies)* — How long this single attempt may run before being killed (e.g., `30s`, `2m`, `10m`).
- **Overall timeout including retries** *(duration, optional)* — Hard cap on total time across all retries. If left blank, only the single-attempt timeout applies.

> Duration syntax: short strings like `30s`, `2m`, `10m`, `24h`. The widget should be a number + unit dropdown.

### Retry policy (collapsed by default; sensible defaults)
- **Maximum attempts** *(integer, default varies)* — How many times to try before giving up.
- **Initial wait between attempts** *(duration, optional)* — Wait this long between attempt 1 and attempt 2.
- **Backoff multiplier** *(decimal number, optional)* — Each subsequent retry waits this much longer than the previous one (e.g., `2.0` doubles the wait each time).
- **Maximum wait between attempts** *(duration, optional)* — Cap on the per-retry wait.

### Error handling
- **On error** *(dropdown, required, default "Retry then fail")* — What happens after retries are exhausted:
  - **Retry then fail** *(default)* — Stop the workflow.
  - **Retry then fall back** — Follow the error-fallback arrow to an alternative path. Selecting this enables a second outgoing handle on the node where the user can draw a red dashed arrow.
  - **Retry then skip** — Mark this step as skipped and continue to the next node.

---

# Flow Control Nodes

These are the structural nodes — they don't do work themselves, they direct the flow. They are categorically different from Activity nodes (different shapes, no `activityType`, no retry behaviour for "the work itself", though some of their internal operations can have timeouts).

## ⚙ Switch (Conditional Branch)

- **Category:** Flow Control
- **Visual:** Yellow diamond
- **One-line description:** Routes the workflow down one of several paths based on conditions.
- **When to use it:**
  - Routing low-confidence OCR results to human review.
  - Picking a different sub-workflow per document type.
  - Any "if A else if B else …" decision based on data in the notebook.

### Settings panel

- **Label** *(text, required)*
- **Branches** *(ordered list, required, at least one item)* — Each branch contains:
  - **Condition** — built with the **condition builder** (see below).
  - **Outgoing arrow target** — which downstream node this branch points to. Visualized on the canvas as a dashed arrow with a label.
  - **Branch label** *(short text)* — The label shown on the arrow (e.g., "monthly report", "needs review").
- **Default branch** *(arrow target, optional but recommended)* — Where to go when none of the conditions match. If absent, the workflow fails when nothing matches.

### The condition builder

Used by Switch and by Wait & Retry's stop condition. Builds expressions without writing code.

A condition is a tree of:

- **Comparison** — *left value* + *operator* + *right value*. Operators: `equals`, `not equals`, `greater than`, `greater or equal`, `less than`, `less or equal`, `contains`, `is empty`, `is not empty`, `is in list`, `is not in list`.
- **Combinator** — `AND`, `OR`, `NOT` of one or more sub-conditions.

A *value* is either:
- A **variable reference**, including dotted paths (e.g., `currentSegment.segmentType`, `ocrResponse.status`). Should autocomplete from available upstream outputs and trigger inputs.
- A **literal value** — a typed-in number, text, true/false, or list (depending on what makes sense for the operator).

Designer note: simple cases (a single comparison) should look as clean as possible — like a single row with three fields. The tree structure should only appear when the user adds AND/OR/NOT.

---

## 🔁 Loop (Map / Fan-Out)

- **Category:** Flow Control
- **Visual:** Green container/frame, with a loop icon
- **One-line description:** Runs a chunk of the workflow once for each item in a list, in parallel.
- **When to use it:**
  - Processing each segment of a split PDF in parallel.
  - Running the same operation across a batch of items.

### Settings panel

- **Label** *(text, required)*
- **List to iterate over** *(variable reference, required)* — Must point to a list-type output from an upstream node or trigger input.
- **Name for the current item** *(text, required, default `currentItem`)* — The name under which each iteration's item is available inside the loop body. This becomes a transient variable visible only inside the loop body.
- **Name for the iteration index** *(text, optional)* — If set, an integer counter (starting at 0) is also exposed inside the loop body.
- **Maximum concurrency** *(integer, optional)* — Cap the number of iterations running at the same time. Empty/blank means "no limit". A small slider or numeric input.
- **Body start node** *(node reference, required)* — Which node inside the loop's body runs first for each iteration.
- **Body end node** *(node reference, required)* — Which node inside the loop's body runs last for each iteration. The Collect node (paired Join) gathers data from this node.

> Visual: the design needs a way to clearly show which nodes are "inside" the loop body. Options outlined in [WORKFLOW_DESIGN_BRIEF.md §13](WORKFLOW_DESIGN_BRIEF.md). Whichever is chosen, body-start and body-end should ideally be **inferred** from the canvas geometry rather than asked of the user — only fall back to dropdowns if the body has multiple disconnected start nodes.

---

## ⊕ Collect (Join / Fan-In)

- **Category:** Flow Control
- **Visual:** Green rounded rectangle with a merge icon
- **One-line description:** Collects the results of a Loop's iterations back into a single list.
- **When to use it:** Always paired with a Loop. Place it **after** the Loop on the canvas.

### Settings panel

- **Label** *(text, required)*
- **Source loop** *(reference to a Loop node, required)* — Which Loop node's iterations this Collect is gathering. Should auto-populate when Collect is placed immediately after a Loop.
- **Strategy** *(dropdown, required, default "Wait for all")*:
  - **Wait for all** — Wait until every iteration finishes.
  - **As soon as any** — Continue as soon as the first iteration succeeds; the rest are cancelled.
- **Results variable name** *(text, required)* — The name for the collected list of per-iteration results. This becomes available as an output to downstream nodes.

---

## 🧩 Sub-workflow

- **Category:** Flow Control
- **Visual:** Purple rectangle with a nested-workflow icon
- **One-line description:** Runs another saved workflow as a single step.
- **When to use it:**
  - Reusing a "Standard OCR" pipeline inside a larger multi-step workflow.
  - Building modular, composable processing flows.

### Settings panel

- **Label** *(text, required)*
- **Workflow reference** *(picker, required)* — Pick from the library of saved workflows. Show name, description, version. Optionally an "inline" mode that lets advanced users paste a workflow definition.
- **Input mappings** *(list of mappings, required)* — For each input the picked workflow expects, choose which available upstream output or trigger input from the *parent* workflow to feed it. Format: `Input slot name` ← `Available variable`.
- **Output mappings** *(list of mappings, optional)* — For each output the picked workflow produces, name the result for use in the parent workflow. Format: `Output slot name` → `Result name`.
- **(Open in new tab)** — A button that opens the referenced workflow's definition for inspection or editing.

> The list of input/output slot names should auto-populate from the picked workflow's published interface. If the user changes the referenced workflow, mappings to slots that no longer exist should be flagged as warnings.

---

## ⏱ Wait & Retry (Poll Until)

- **Category:** Flow Control
- **Visual:** Orange rounded rectangle with a clock/refresh icon
- **One-line description:** Repeatedly runs an activity until a condition is met.
- **When to use it:** Waiting for an asynchronous external service to finish processing (most commonly: waiting for Azure OCR to complete).

### Settings panel

- **Label** *(text, required)*
- **Activity to run on each poll** *(dropdown of all activity types, required)* — Same picker as picking an Activity, but constrained to "polling-friendly" activities. The most common is **Wait for OCR Result** (`azureOcr.poll`).
- **Stop condition** *(condition builder, required)* — Uses the same condition builder as Switch. The poll continues until this condition is true.
- **Interval between polls** *(duration, required, e.g., `10s`)*
- **Initial delay before first poll** *(duration, optional)*
- **Maximum poll attempts** *(integer, optional, default 100)*
- **Overall timeout** *(duration, optional)* — Hard cap on total time. Failure if exceeded.
- **Inputs ("This step reads")** — Same shape as the chosen activity's inputs. Pickers autocomplete from upstream outputs and trigger inputs.
- **Outputs ("This step produces")** — Same shape as the chosen activity's outputs. Each poll's output is named by the user and becomes available so the stop condition can reference it.
- **Static parameters** — Same as the chosen activity's static parameters.
- **Standard timeouts, retry policy, error handling** *(applies to each individual poll attempt, not the whole loop)*.

---

## 🙋 Human Gate

- **Category:** Flow Control
- **Visual:** Red rounded rectangle with a person icon
- **One-line description:** Pauses the workflow until a human responds.
- **When to use it:**
  - Approval / rejection gates for low-confidence results.
  - Manual data entry when automated extraction fails.
  - Quality review before storing results.

### Settings panel

- **Label** *(text, required)*
- **Signal name** *(text, required)* — A unique name for this approval request (e.g., `humanApproval`, `manualEntry`).
- **Expected response shape** *(simple field-list editor, optional)* — Defines what fields the reviewer can/must provide. Each field has:
  - **Name** *(text)*
  - **Type** *(dropdown: text / number / true-false / list / object)*
  - **Required** *(toggle)*
  - **Description** *(short text)*
- **Timeout** *(duration, required, e.g., `24h`)*
- **On timeout** *(dropdown, required, default "Fail")*:
  - **Fail** — Workflow fails if no response in time.
  - **Continue** — Treat as approved and continue normal flow.
  - **Follow fallback arrow** — Take the fallback outgoing arrow. Selecting this enables an extra outgoing handle on the canvas.
- **Output variable name** *(text, optional)* — Name for the response payload. If blank, defaults to a system-generated name. This becomes available to downstream nodes.

---

# File Handling

## 📄 Prepare File

- **Category:** File Handling
- **Visual:** Blue, file icon
- **Activity ID (internal):** `file.prepare`
- **One-line description:** Validates and prepares a file's metadata for further processing.
- **When to use it:** As the first step in any OCR workflow, after the workflow has been triggered with a file reference.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)* — Pick from upstream outputs or trigger inputs.
  - **File reference (blob key)** *(required)* — Pick from upstream outputs or trigger inputs.
  - **File name** *(optional)* — If not provided, derived from the file reference.
  - **File type** *(optional)* — `pdf` or `image`. Auto-detected from extension if not provided.
  - **Content type (MIME)** *(optional)* — Auto-detected if not provided.
- **Outputs ("This step produces"):**
  - **Prepared file data** *(required)* — Name for the prepared metadata (becomes available downstream).
- **Static parameters:**
  - **OCR model ID** *(text or dropdown, optional, default `prebuilt-layout`)* — Which Azure Document Intelligence model the prepared data should be associated with. The dropdown should include the common Azure prebuilt models.

---

# OCR (Azure)

## 📤 Submit OCR

- **Category:** OCR (Azure)
- **Visual:** Blue, upload-arrow icon
- **Activity ID (internal):** `azureOcr.submit`
- **One-line description:** Sends a prepared document to Azure Document Intelligence and returns a tracking ID.
- **When to use it:** After **Prepare File**, before **Wait for OCR Result**.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Prepared file data** *(required)* — Output from **Prepare File**.
- **Outputs ("This step produces"):**
  - **Request ID** *(required)* — Name for the Azure tracking ID (becomes available downstream).
  - **Submission status code** *(optional)* — Name for the HTTP status code (typically 202).
  - **Submission headers** *(optional, advanced)* — Name for the response headers if needed downstream.
- **Static parameters:**
  - **Locale** *(dropdown, optional, default `en-US`)* — Language hint for OCR.

---

## ⌛ Wait for OCR Result

- **Category:** OCR (Azure)
- **Visual:** Orange rounded rectangle with clock icon (this is technically a **Wait & Retry** node configured for OCR polling)
- **Activity ID (internal):** `azureOcr.poll` *(used inside a Wait & Retry node)*
- **One-line description:** Waits for Azure OCR to finish, polling at a configurable interval.
- **When to use it:** Right after **Submit OCR**.

This is normally exposed as a preconfigured **Wait & Retry** node with the polling activity already chosen. The user only needs to configure the request-ID input, the OCR model, and the polling parameters.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Request ID** *(required)* — From **Submit OCR**'s output.
- **Outputs ("This step produces"):**
  - **OCR poll response** *(required)* — Name for the response (becomes available downstream and to the stop condition).
- **Static parameters:**
  - **OCR model ID** *(required, defaults from upstream)*.
- **Wait & Retry settings (preconfigured but editable):**
  - **Stop condition**: pre-filled with "OCR poll response status not equals `running`" — the user shouldn't normally need to edit this.
  - **Interval between polls** *(default `10s`)*.
  - **Initial delay** *(default `5s`)*.
  - **Maximum attempts** *(default `20`)*.
  - **Overall timeout** *(default `10m`)*.

---

## 📥 Extract OCR Result

- **Category:** OCR (Azure)
- **Visual:** Blue, document icon
- **Activity ID (internal):** `azureOcr.extract`
- **One-line description:** Parses the raw Azure response into a structured OCR result with fields, key-value pairs, and confidence scores.
- **When to use it:** After **Wait for OCR Result**.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Request ID** *(required)*.
  - **File name** *(required)*.
  - **File type** *(required)* — `pdf` or `image`.
  - **OCR model ID** *(required)*.
  - **OCR poll response** *(optional)* — If provided, used directly; otherwise the activity refetches it from Azure.
- **Outputs ("This step produces"):**
  - **OCR result** *(required)* — Name for the structured result.

---

# OCR Cleanup & Correction

These nodes all read an OCR result, transform it, and write a corrected OCR result back. They can be chained.

## ✨ Cleanup

- **Category:** OCR Cleanup & Correction
- **Visual:** Teal, sparkle icon
- **Activity ID (internal):** `ocr.cleanup`
- **One-line description:** Normalizes the raw OCR text — fixes whitespace, smart quotes, hyphens, dates.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **OCR result to clean** *(required)*.
- **Outputs ("This step produces"):**
  - **Cleaned OCR result** *(required)*.

*No static parameters — this node has no configurable rules.*

---

## 🔡 Spellcheck

- **Category:** OCR Cleanup & Correction
- **Visual:** Teal, abc/spell icon
- **Activity ID (internal):** `ocr.spellcheck`
- **One-line description:** Dictionary-based spellcheck on OCR field values.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **OCR result** *(required)*.
- **Outputs ("This step produces"):**
  - **Corrected OCR result** *(required)*.
  - **List of corrections (changes)** *(optional)* — Each entry is `{ field key, original value, corrected value, reason }`.
  - **Metadata** *(optional)* — `{ totalWordsChecked, totalCorrections }`.
- **Static parameters:**
  - **Field scope** *(list of field names, optional)* — If empty, applies to all fields. Otherwise, restrict to listed fields. The widget should be a multi-select that autocompletes from known field names if available, with free-text fallback.
  - **Language** *(dropdown, optional, default `en`)* — Dictionary language.

---

## 🔠 Character Confusion Fix

- **Category:** OCR Cleanup & Correction
- **Visual:** Teal, swap-letters icon
- **Activity ID (internal):** `ocr.characterConfusion`
- **One-line description:** Fixes common OCR misreads (`O`→`0`, `l`→`1`, `S`→`5`, etc.) using a confusion map.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **OCR result** *(required)*.
- **Outputs ("This step produces"):**
  - **Corrected OCR result** *(required)*.
  - **List of corrections (changes)** *(optional)*.
- **Static parameters:**
  - **Document type** *(dropdown, optional)* — Picks a labeling project; if set, only field-type-appropriate rules apply.
  - **Confusion profile** *(dropdown, optional)* — Pick a saved profile of rules. Overrides the built-in rules.
  - **Built-in rules** *(checkbox list)* — Toggle individual rules on/off:
    - O / o → 0
    - I / l → 1
    - S / s → 5
    - B → 8
    - G → 6
    - Z → 2
    - q → 9
    - / → 1 *(numbers only; date contexts excluded)*
  - **Custom confusion map** *(advanced; key→value table, optional)* — Override or extend the built-in map.
  - **Field scope** *(list, optional)* — Restrict to specific fields.
  - **Apply to all fields** *(toggle, default off)* — By default rules apply only to fields likely to be numeric/date; toggle on to apply broadly.

---

## 🧹 Normalize Fields

- **Category:** OCR Cleanup & Correction
- **Visual:** Teal, broom/normalize icon
- **Activity ID (internal):** `ocr.normalizeFields`
- **One-line description:** Cleans up field values — whitespace, digit grouping, date separator standardization.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **OCR result** *(required)*.
- **Outputs ("This step produces"):**
  - **Normalized OCR result** *(required)*.
  - **List of changes** *(optional)*.
- **Static parameters:**
  - **Document type** *(dropdown, optional)* — For field-type-aware rules.
  - **Per-rule toggles** *(checkbox list)*:
    - **Whitespace normalization** *(default on)*
    - **Digit grouping cleanup** *(default on)*
    - **Date separator standardization** *(default on)*
    - **Unicode normalization (NFC)** *(default on)*
    - **Dehyphenation across line breaks** *(default on)*
    - **Comma-thousands removal** *(default on)*
    - **Currency spacing** *(default on)*
  - **Field scope** *(list, optional)*.
  - **Empty value handling** *(dropdown, default "Leave as-is")*:
    - **Leave as-is**
    - **Coerce empty fields to blank**
    - **Coerce empty fields to null**

---

# OCR Quality

## ✅ Check Confidence

- **Category:** OCR Quality
- **Visual:** Teal, gauge icon
- **Activity ID (internal):** `ocr.checkConfidence`
- **One-line description:** Calculates average confidence across OCR fields and flags whether the result needs human review.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)*.
  - **OCR result** *(required)*.
- **Outputs ("This step produces"):**
  - **Average confidence** *(required)* — A number between 0 and 1.
  - **Requires review** *(required)* — A true/false flag (true if below threshold).
- **Static parameters:**
  - **Confidence threshold** *(decimal between 0 and 1, optional, default `0.95`)* — Below this, the result is flagged for review.

> Pattern: A Switch node usually follows this, branching on **Requires review** to either route through a Human Gate or proceed straight to storage.

---

## ✨ Enrich OCR Results

- **Category:** OCR Quality
- **Visual:** Teal, sparkle-document icon
- **Activity ID (internal):** `ocr.enrich`
- **One-line description:** Applies field-schema-driven enrichment, optionally using an LLM to fix low-confidence fields.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)*.
  - **OCR result** *(required)*.
- **Outputs ("This step produces"):**
  - **Enriched OCR result** *(required)*.
  - **Enrichment summary** *(optional)*.
- **Static parameters:**
  - **Document type / template** *(dropdown, required)* — Picks the field schema. The dropdown lists configured templates from the system.
  - **Confidence threshold for LLM enrichment** *(decimal, optional, default `0.85`)* — Fields below this are eligible for LLM correction (only matters if LLM enrichment is enabled).
  - **Enable LLM enrichment** *(toggle, optional, default off)* — When on, low-confidence fields are sent to an Azure OpenAI deployment for correction.

---

# Document Handling

## ✂ Split Document

- **Category:** Document Handling
- **Visual:** Indigo, scissors icon
- **Activity ID (internal):** `document.split`
- **One-line description:** Splits a multi-page PDF into segments using one of several strategies.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Source file reference (blob key)** *(required)*.
  - **Group ID** *(required)* — Used as the destination group for segment storage.
  - **Document ID** *(optional)* — Inferred from the file reference if not provided.
- **Outputs ("This step produces"):**
  - **Segments** *(required)* — A list. Each entry has `segmentIndex`, `pageRange`, `blobKey` (for the segment file), and `pageCount`.
- **Static parameters:**
  - **Strategy** *(dropdown, required)*:
    - **One segment per page** — Each page becomes its own segment.
    - **Fixed-size ranges** — Reveals a "Pages per segment" number input.
    - **Boundary detection** — Auto-detects boundaries from the document content (no extra config; behaviour is built-in).
    - **Custom page ranges** — Reveals a list editor where the user adds `{ start, end }` page ranges.

---

## 🏷 Classify Document

- **Category:** Document Handling
- **Visual:** Indigo, tag icon
- **Activity ID (internal):** `document.classify`
- **One-line description:** Classifies a document segment's type using rule-based pattern matching on its OCR text.
- **When to use it:** Inside a Loop body, after a single segment has been OCR'd, to decide what kind of document it is.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **OCR result for this segment** *(required)*.
  - **Segment metadata** *(required)*.
- **Outputs ("This step produces"):**
  - **Detected segment type** *(required)*.
  - **Confidence** *(optional)*.
  - **Matched rule name** *(optional)*.
- **Static parameters:**
  - **Classifier strategy** *(dropdown, required, default "Rule-based")* — Currently only rule-based is supported.
  - **Classification rules** *(ordered list editor, required)* — Each rule has:
    - **Rule name** *(text)*
    - **Result type** *(text — the document type to assign if this rule matches)*
    - **Patterns** *(list of conditions; ALL must match for the rule to fire)*. Each pattern:
      - **Where to look** *(dropdown)*: Full text / Title / Paragraph / Section / Key-value-pair key / Key-value-pair value
      - **Operator** *(dropdown)*: contains / starts with / matches (regex)
      - **Value** *(text)* — The string or pattern to match.
    - Reorderable; rules are tried in order, first match wins.

---

## 🔀 Split & Classify

- **Category:** Document Handling
- **Visual:** Indigo, scissors-with-tag icon
- **Activity ID (internal):** `document.splitAndClassify`
- **One-line description:** Splits a PDF *and* classifies each segment in one step, using keyword markers found in the OCR text.
- **When to use it:** When a document has an explicit page-marker structure (e.g., "Page 3 — Pay Stub").

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Source file reference (blob key)** *(required)*.
  - **Group ID** *(required)*.
  - **OCR result for the full document** *(required)*.
  - **Document ID** *(optional)*.
- **Outputs ("This step produces"):**
  - **Segments with types** *(required)* — A list. Each entry has all standard segment fields plus `segmentType`, `keywordMatch`, and `confidence`.
- **Static parameters:**
  - **Keyword patterns** *(ordered list editor)* — Each pattern has:
    - **Pattern** *(regex with capture group 1 = page number; advanced field, with helpful preset templates)*.
    - **Segment type to assign** *(text)*.
  - The UI should provide a friendly **pattern builder** for common cases (e.g., "Match the phrase 'Page X — Monthly Report' where X is the page number"), and an "advanced regex" field below it.

---

## ⊕ Combine Segment Result

- **Category:** Document Handling
- **Visual:** Indigo, layers icon
- **Activity ID (internal):** `segment.combineResult`
- **One-line description:** Merges segment metadata with the segment's OCR result into a single object — used as the body-end node in a Loop.
- **When to use it:** Inside a Loop body, just before the Collect node, to produce the per-iteration result that the Collect will gather.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Current segment** *(required)* — Usually the loop's per-iteration `currentSegment` variable.
  - **Segment OCR result** *(required)* — The OCR output from the per-segment processing.
- **Outputs ("This step produces"):**
  - **Combined segment** *(required)* — The merged object.

---

# Validation

## ✔ Validate Fields

- **Category:** Validation
- **Visual:** Cyan, checklist icon
- **Activity ID (internal):** `document.validateFields`
- **One-line description:** Validates fields across related document segments — arithmetic checks, cross-document field matching, array matching.
- **When to use it:** After a Collect node has gathered all segment results, before storing.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Processed segments** *(required)* — A list. Item 0 is treated as the **primary document**; items 1+ are **attachments**. The UI should make this clear with a labeled note in the panel.
  - **Document ID** *(required)*.
- **Outputs ("This step produces"):**
  - **Validation results** *(required)* — Contains per-rule outcomes plus a summary `{ matched, mismatched, missing }`.
- **Static parameters:**
  - **Validation rules** *(list editor, required)* — Each rule has:
    - **Name** *(text)*
    - **Type** *(dropdown)*: **Field match** / **Arithmetic** / **Array match**
    - Fields below depend on the type:

      **Field match** (compares a field on the primary doc to a field on an attachment):
      - **Primary field** *(field path text, e.g., `page1.grossPay`)*
      - **Attachment field** *(field path text, e.g., `page2.grossPay`)*
      - **Operator** *(dropdown: exact / approximately)*
      - **Tolerance** *(if approximately)* — `{ amount, percentage }` (either or both)
      - **Field type** *(dropdown: text / number / currency)*

      **Arithmetic** (validates an equation across fields):
      - **Operation** *(dropdown: sum / difference / product)*
      - **Operand fields** *(list of field paths)*
      - **Equals field** *(field path)* — The expected result.
      - **Operator** *(dropdown: exact / approximately)* with tolerance like above.
      - **Field type**.

      **Array match** (cross-segment array validation, like "deposit amounts in the bank record match income totals on the report"):
      - **Primary fields** *(list)*
      - **Attachment fields** *(list)*
      - **Match type** *(dropdown: any / all)* — All primary values must be found in attachments, or any.
      - **Operator** + **Tolerance** + **Field type** as above.

> Important note for the designer: there are no built-in validation rules. The user must add at least one. A clean empty state ("Add your first validation rule") and good rule reordering (drag-handle) are essential.

---

# Storage

## 💾 Store OCR Results

- **Category:** Storage
- **Visual:** Slate-gray, save icon
- **Activity ID (internal):** `ocr.storeResults`
- **One-line description:** Saves processed OCR results to the database.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)*.
  - **OCR result** *(required)*.
  - **Enrichment summary** *(optional)*.
- **Outputs:** None.
- **Static parameters:** None.

---

## 📋 Update Document Status

- **Category:** Storage
- **Visual:** Slate-gray, status-tag icon
- **Activity ID (internal):** `document.updateStatus`
- **One-line description:** Updates a document's processing status in the database.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)*.
  - **APIM request ID** *(optional)* — Saved alongside the status when present.
- **Outputs:** None.
- **Static parameters:**
  - **Status value** *(text or dropdown, required)* — Common values: `pending`, `ongoing_ocr`, `awaiting_review`, `completed`, `rejected`. Should be a dropdown with the common values plus an "other (custom)" option that reveals a text field.

---

## ❌ Store Rejection

- **Category:** Storage
- **Visual:** Slate-gray, no-entry icon
- **Activity ID (internal):** `document.storeRejection`
- **One-line description:** Records rejection data when a document fails processing or human review.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):**
  - **Document ID** *(required)*.
  - **Rejection reason** *(required)*.
  - **Reviewer** *(optional)*.
  - **Annotations** *(optional)*.
- **Outputs:** None.
- **Static parameters:** None.

---

# Data Transformation

## 🔄 Generic Data Transform

- **Category:** Data Transformation
- **Visual:** Lavender, transform icon
- **Activity ID (internal):** `data.transform`
- **One-line description:** Generic transformer — read inputs in JSON / XML / CSV, map fields, and write a new structure in JSON / XML / CSV.
- **When to use it:** Reformatting data between an OCR result and an external system's expected payload, or vice-versa.

### Settings panel

- **Standard label, timeouts, retry, error handling.**
- **Inputs ("This step reads"):** *Free-form list of named slots.* The user adds slots by name; each slot picks from available upstream outputs. The slot name is then available as a placeholder in the field-mapping editor.
- **Outputs ("This step produces"):**
  - **Output** *(required)* — The rendered result (string in the chosen output format).
- **Static parameters:**
  - **Input format** *(dropdown, required)*: JSON / XML / CSV — How to parse string-valued inputs.
  - **Output format** *(dropdown, required)*: JSON / XML / CSV.
  - **Field mapping** *(JSON or visual editor, required)* — Defines the output structure. Values can include placeholder expressions in the form `{{slotName.field.path}}`. The UI should support a visual mapping mode (drag a source path to an output field) and an advanced JSON/text mode.
  - **XML envelope template** *(text, optional, only if output format = XML)* — Wraps the rendered fields in a custom XML envelope.

---

# Benchmarking (Advanced — usually hidden)

These nodes are used by the benchmarking subsystem and don't usually appear in user-built workflows. They should be in a collapsed "Advanced" section of the palette, behind a feature flag or admin-only toggle.

| Display name | Activity ID | One-line description |
|---|---|---|
| Benchmark — Evaluate | `benchmark.evaluate` | Evaluate benchmark run results against ground truth |
| Benchmark — Aggregate | `benchmark.aggregate` | Aggregate evaluation results into summary metrics |
| Benchmark — Cleanup | `benchmark.cleanup` | Clean up temporary files and materialized datasets |
| Benchmark — Update Run Status | `benchmark.updateRunStatus` | Update benchmark run status in database |
| Benchmark — Compare Against Baseline | `benchmark.compareAgainstBaseline` | Compare run metrics against baseline and detect regressions |
| Benchmark — Write Prediction | `benchmark.writePrediction` | Write workflow prediction data to a JSON file for evaluation |
| Benchmark — Materialize Dataset | `benchmark.materializeDataset` | Materialize dataset version from object storage |
| Benchmark — Load Dataset Manifest | `benchmark.loadDatasetManifest` | Load dataset manifest from materialized data |
| Benchmark — Load OCR Cache | `benchmark.loadOcrCache` | Load cached Azure OCR poll JSON for a benchmark sample |
| Benchmark — Persist OCR Cache | `benchmark.persistOcrCache` | Persist Azure OCR poll JSON for a benchmark sample |
| Load Workflow Graph Config | `getWorkflowGraphConfig` | Load workflow configuration from database |

These follow the same general settings-panel pattern as other Activities (input/output pickers, parameters, standard error handling) and don't have unique visual requirements beyond the "advanced" tag.

---

# Cross-cutting widgets the design must produce

Reusable settings-panel widgets that several nodes share. Building these once and reusing them is the right approach.

| Widget | Used by |
|---|---|
| **Variable picker** (autocomplete dropdown showing available upstream outputs and trigger inputs; supports dotted paths like `currentSegment.blobKey`) | Every node's input/output sections |
| **Duration input** (number + unit dropdown for `s/m/h`) | Every node's timeouts; Wait & Retry settings; Human Gate timeout |
| **Condition builder** (left value + operator + right value, with AND/OR/NOT trees) | Switch branches; Wait & Retry stop condition |
| **Field-scope multi-select** (autocompleted list of field names) | Spellcheck, Character Confusion, Normalize Fields |
| **Validation rule editor** (different sub-form per rule type: field-match, arithmetic, array-match) | Validate Fields |
| **Classification rule editor** (rule with multiple AND-ed patterns) | Classify Document |
| **Keyword pattern editor** (regex with capture group + segment type) | Split & Classify |
| **Page range list editor** (list of `{ start, end }` items) | Split Document (custom-ranges strategy) |
| **Confusion map editor** (key→value table; preset toggles plus overrides) | Character Confusion Fix |
| **Sub-workflow picker** (browse the library of saved workflows with name, description, version) | Sub-workflow node |
| **Mapping list** (paired-list: left=internal slot name, right=available variable) | Sub-workflow inputs/outputs; activity inputs/outputs |
| **Field-mapping editor** (visual or JSON, with placeholder expressions like `{{slot.path}}`) | Generic Data Transform |
| **Schema field-list editor** (name + type + required + description) | Human Gate expected payload |
| **Retry policy widget** (max attempts + intervals + backoff) | All Activities, Wait & Retry |
| **Error policy widget** (Fail / Fallback / Skip dropdown; conditionally exposes the fallback handle) | All Activities, Wait & Retry, Human Gate |

---

# Quick categorization summary (for the palette)

```
📂 Flow Control
   ⚙ Switch
   🔁 Loop
   ⊕ Collect
   🧩 Sub-workflow
   ⏱ Wait & Retry
   🙋 Human Gate

📂 File Handling
   📄 Prepare File

📂 OCR (Azure)
   📤 Submit OCR
   ⌛ Wait for OCR Result   (preset of Wait & Retry)
   📥 Extract OCR Result

📂 OCR Cleanup & Correction
   ✨ Cleanup
   🔡 Spellcheck
   🔠 Character Confusion Fix
   🧹 Normalize Fields

📂 OCR Quality
   ✅ Check Confidence
   ✨ Enrich OCR Results

📂 Document Handling
   ✂ Split Document
   🏷 Classify Document
   🔀 Split & Classify
   ⊕ Combine Segment Result

📂 Validation
   ✔ Validate Fields

📂 Storage
   💾 Store OCR Results
   📋 Update Document Status
   ❌ Store Rejection

📂 Data Transformation
   🔄 Generic Data Transform

📂 Benchmarking (Advanced)
   … (10 nodes, see table above)
```

The icons are placeholders — final iconography is the designer's call. Categories and grouping are based on what the system actually does, not on internal code organization.
