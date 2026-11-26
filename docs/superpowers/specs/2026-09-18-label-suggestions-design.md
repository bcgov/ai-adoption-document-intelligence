# Label Suggestions — Design

**Status:** Approved 2026-09-18.

**Goal:** Make training a template model by hand fast for any form. An LLM
suggests the field list from the first uploaded document, and suggests labels
on every document, the first one included. A person checks and corrects the
suggestions before anything is saved.

**Non-goals:**

- Suggesting labels with the template model's own trained version.
- Storing suggestions. Every request is a fresh LLM call.
- Choosing the LLM deployment. The service uses whatever the Azure OpenAI
  settings point at; §5.6 lists the availability checks that inform that choice.
- Changing the training export (the `labels.json` shape) or the order in which
  a label's words are joined. Both are measured in the evaluation harness
  first (§5.4).
- Routing a mix of form types: classifiers, composed models.
- Metering LLM usage. The billing tables have no LLM event type.

---

## 1. Background — what exists today

- **Labelling flow.** A template model holds a field list
  (`FieldDefinition`: key, type, optional format and format spec, display
  order) and labelling documents. Uploading a document runs Azure Document
  Intelligence `prebuilt-layout` (API `2024-11-30`, `features=keyValuePairs`)
  once. The response is stored in `LabelingDocument.ocr_result`, and the
  document's status becomes `extracted`. In the labelling workspace
  (`/template-models/:modelId/document/:documentId`) a person assigns OCR
  elements to fields. Word ids are `p{page}-w{index}` and checkbox ids are
  `p{page}-sm{index}`, where the index is the element's position in
  `pages[].words` or `pages[].selectionMarks`. **Save labels** persists
  `DocumentLabel` rows. Training exports `fields.json`, `{file}.ocr.json` and
  `{file}.labels.json`.
- **The current suggestion engine** is `template-model/suggestion.service.ts`.
  It infers where a field is from the field's key name:
  - key-value pairs are matched against aliases derived from the key, plus
    hard-coded aliases for four specific keys;
  - number fields come only from a table whose column and row are parsed out
    of the key;
  - checkboxes are assigned in order, so the n-th checkbox field gets the n-th
    checkbox on the page.

  A per-model rules object exists in the code, but its only caller passes
  `null`. The only test fixture is a single 74-field form. The approach fails
  for any form whose field keys don't match its printed captions.
- **The labelling screen** (`LabelingWorkspacePage.tsx`) calls
  `POST /api/template-models/:id/documents/:docId/suggestions`. It does so
  automatically when a document with no labels and no assignments opens, and
  again when **Load suggestions** is clicked. For each field in the response
  it applies `element_ids` to the word assignments.
- **Azure OpenAI in the backend.** The workflow agent uses the Vercel AI SDK
  (`ai`, `@ai-sdk/azure`) with deployment-based URLs. The agent and format
  suggestions both read `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
  `AZURE_OPENAI_DEPLOYMENT` and `AZURE_OPENAI_API_VERSION`.
- **Facts about the stored OCR that this design relies on** (checked against
  the existing fixture `test/fixtures/ocr_output.json`):
  - `analyzeResult.content` holds the whole document text in reading order.
  - Lines, words, selection marks and table cells each carry spans into
    `content`.
  - Selection marks appear in `content` as `:selected:` / `:unselected:`
    tokens between lines. They are never inside a line's span.
  - Table cells can contain selection marks.

## 2. User flow

### 2.1 Suggest fields (new)

1. On the **Field schema** tab, the user clicks **Suggest fields** and picks a
   document whose OCR has finished.
2. The backend sends that document's tagged text (§3.1) to the LLM and asks for
   the fields a person fills in on this form. For each field the LLM returns a
   key, a type, a one-line description and where the value sits on this copy.
3. A review table shows each suggested field: an *include* checkbox, key, type,
   description, and the value found on this document (or "not filled in on
   this document"). The user can untick, rename, change the type and edit the
   description. Suggestions whose key already exists come in unticked and
   marked as existing.
4. **Add fields** creates the ticked fields in one transaction. A notification
   links to the document in the labelling workspace.
5. Opening that document triggers suggested labels (§2.2) like any other
   document.

### 2.2 Suggested labels (unchanged flow, new engine)

The labelling screen keeps its current behaviour: an automatic request when a
document with no labels opens, plus the **Load suggestions** button. Each
request makes a fresh LLM call with the field list, including descriptions,
and the document's tagged text. The response keeps its current shape, so the
screen applies it as it does today. Nothing becomes a label until the user
clicks **Save labels**.

### 2.3 Field description (new)

Each field gets an optional one-line, plain-English description of what the
field is and where it sits on the form, for example
*"Date the applicant signed, next to the applicant's signature"*. Suggest
fields fills it in, and the user can edit it in the field table and the field
editor. It is used only as instructions to the LLM. It does not change the
training export.

## 3. Backend

All new code lives under `apps/backend-services/src/template-model/label-suggestions/`.

### 3.1 Tagged text — `tagged-text.ts`

Pure function `renderTaggedText(ocr: AnalysisResponse): TaggedText`.

```ts
type TagTarget =
  | { kind: "line"; pageNumber: number; wordIds: string[] }
  | { kind: "cell"; pageNumber: number; wordIds: string[]; selectionMarkIds: string[] }
  | { kind: "selectionMark"; pageNumber: number; id: string; state: "selected" | "unselected" };

interface TaggedText {
  text: string;                    // what the LLM sees
  tags: Map<string, TagTarget>;    // "L12" | "T2 r3 c1" | "S4" -> target
  pageCount: number;
}
```

Algorithm: copy `content` in order, inserting markers at span offsets.

- `--- page N ---` at the start of each page's span.
- `[L<n>] ` at the start of each line, **unless every word of that line belongs
  to a table cell**. Those words are reached through the cell tag instead.
- `[T<t> r<row> c<col>] ` at the start of each table cell.
- Each selection-mark token (`:selected:` / `:unselected:` at the mark's span)
  is replaced by `[S<n> ☒]` or `[S<n> ☐]`.
- Everything else in `content`, newlines included, is kept verbatim.

Line and checkbox numbers run in reading order across the whole document.
Words map to lines and cells by span containment.

**Limits:** documents over **30 pages** or whose tagged text exceeds
**120,000 characters** are rejected with 422 and a message saying so.

### 3.2 Reference resolver — `resolve-refs.ts`

Pure function `resolveRefs(refs: SuggestedRef[], tagged: TaggedText): ResolvedRefs | null`,
where `SuggestedRef = { tag: string; text: string }`.

- **Line or cell tag:** normalise the reply text and the tag's words (NFKC,
  case-folded, whitespace collapsed). Take the first contiguous run of the
  tag's words whose joined text equals the reply text. If there is none, take
  the shortest run whose joined text *contains* it; this covers a value glued
  to its caption, such as `Date:2026-03-14`. Result: those word ids.
- **Checkbox tag:** the selection mark id. The value is its state.
- **Several refs** (a value spanning lines or cells) are resolved in order and
  concatenated.
- **Any ref that fails** (unknown tag, text not found, a checkbox tag on a
  non-checkbox field) drops the whole field. The reason is logged at debug
  level without the document text.

Output: `{ elementIds, value, pageNumber, polygon }`. The polygon is the union
rectangle of the elements, used only to fill the response DTO's
`bounding_box`; the screen recomputes geometry from the element ids.

### 3.3 LLM access — `suggestion-llm.ts`

- Reads the four existing `AZURE_OPENAI_*` settings. It builds the Azure
  provider the way the agent does (`baseURL = <endpoint>/openai`,
  deployment-based URLs) and calls the AI SDK's `generateObject` with a zod
  schema, so the reply is schema-checked.
- No temperature is sent, because reasoning deployments reject the setting.
  Timeout 120 s.
- Missing settings → 503 naming the missing setting names, never values.
  A failed call or an invalid reply → 502.
- Document text is never logged.

### 3.4 Prompts and reply schemas — `label-suggestion.service.ts`

**Suggest fields.** The input is the tagged text. The reply:

```ts
{ fields: Array<{
    key: string;                 // snake_case
    type: "string" | "number" | "date" | "selectionMark" | "signature";
    description: string;         // names the printed caption and where it is
    refs: SuggestedRef[];        // empty when the field is blank on this copy
}> }
```

Prompt rules:

- Only values a person fills in: not headings, instructions or printed captions.
- One field per checkbox (for example `…_yes`, `…_no`), always pointing at its
  `S` tag, ticked or not.
- A fixed grid becomes one field per fillable cell, keyed by row and column.
- Keys are snake_case and unique.
- Never invent a value; blank means empty refs.

Post-processing:

- Normalise keys to `^[a-z][a-z0-9_]*$`.
- De-duplicate with a numeric suffix.
- Drop invalid types.
- Cap at 200 fields.
- Resolve refs for the preview value.
- Mark keys that already exist.

**Suggest labels.** The input is the field list (key, type, description) plus
the tagged text. The reply:

```ts
{ fields: Array<{ key: string; refs: SuggestedRef[] }> }
```

Prompt rules:

- Use only the listed keys.
- Checkbox fields point at their `S` tag, ticked or not.
- Empty refs when the field is blank.
- Never invent a value.

Post-processing drops unknown keys and resolves refs. The output is
`LabelSuggestionDto[]`:

- `field_key`, `label_name`, `value`, `page_number`, `element_ids` and
  `bounding_box` as today;
- `source_type: "llm"`;
- `explanation` naming the tags used, for example `"Line L12"` or
  `"Checkbox S4"`;
- no `confidence`.

A template model with no fields → 422 ("add fields first").

### 3.5 Endpoints

All three use `@Identity({ allowApiKey: true })` plus `identityCanAccessGroup`,
like the existing field endpoints. Each has specific Swagger response
decorators and dedicated DTO classes.

| Method | Path | Body → Response | Errors |
|---|---|---|---|
| POST | `/api/template-models/:id/documents/:docId/suggestions` (existing) | — → `LabelSuggestionDto[]` | 403, 404, 422, 502, 503 |
| POST | `/api/template-models/:id/field-suggestions` (new, `@HttpCode(200)`) | `SuggestFieldsDto { document_id }`, where `document_id` is the id the existing `/documents/:docId` routes take → `SuggestedFieldDto[] { field_key, field_type, description, value: string \| null, page_number: number \| null, already_exists }` | 403, 404, 422, 502, 503 |
| POST | `/api/template-models/:id/fields/bulk` (new) | `CreateFieldDefinitionsDto { fields: CreateFieldDefinitionDto[] }` → `FieldDefinitionResponseDto[]` | 403, 404, 409 |

**Bulk create** runs in one `prismaService.transaction`:

- It validates that no key already exists and that none repeats within the
  request. Otherwise it returns 409 listing the keys.
- It creates the fields with display orders continuing after the current
  maximum.
- It records one `template_model_field_created` audit event per field through
  `AuditService.recordEvent(events, tx)`.

### 3.6 Schema

- `FieldDefinition.description String?`, added in a new migration under
  `apps/shared/prisma/migrations/`. Regenerate with `npm run db:generate` from
  `apps/backend-services`.
- `CreateFieldDefinitionDto`, `UpdateFieldDefinitionDto` and
  `FieldDefinitionResponseDto` gain `description`. The single-field create and
  update endpoints accept it.
- The export is unchanged.

### 3.7 Removal

Delete `suggestion.service.ts`, `suggestion.service.spec.ts` and
`suggestion.service.integration.spec.ts`, and remove the provider from
`template-model.module.ts`. The `LabelSuggestionDto.source_type` enum becomes
`["llm"]`. The fixtures `ocr_output.json`, `form_image_0.jpg.labels.json` and
`fields.json` stay; the new tests use them.

### 3.8 Tests (jest)

- **`tagged-text.spec.ts`** (fixture):
  - every word is reachable through at least one line or cell tag;
  - all 28 selection marks become `S` tags, in content order;
  - table cells are tagged;
  - page markers are present;
  - both limits are enforced.
- **`resolve-refs.spec.ts`:**
  - **Fixture round trip.** For each of the 74 reference labels in
    `form_image_0.jpg.labels.json`, build the refs a perfect LLM would return
    (the tag holding those words plus their exact text). Resolving them must
    reproduce the reference word and checkbox ids exactly.
  - Failure cases: unknown tag, text not on the tag, a caption glued to its
    value, a multi-ref value.
- **`label-suggestion.service.spec.ts`**, using the AI SDK's mock language
  model:
  - prompt content (tags, field descriptions);
  - reply validation;
  - unknown keys dropped;
  - key normalisation and de-duplication;
  - `already_exists`;
  - 422, 502 and 503 paths.
- **Controller specs** for the two new endpoints: group access and DTO
  validation.
- **Bulk create:** one transaction, audit events written with the same `tx`,
  409 on an existing key or a duplicate within the request.

## 4. Frontend

- **Field schema tab** (`ModelDetailPage.tsx`):
  - a **Description** column;
  - a **Suggest fields** button next to **Add field**.
- **`FieldSchemaEditor.tsx`** (the add/edit modal): a description input.
- **New `SuggestFieldsModal.tsx`:**
  - a document picker listing documents whose status is `extracted`;
  - a **Suggest** action with a loading state;
  - the review table from §2.1;
  - **Add N fields**, which calls bulk create;
  - a success notification with an **Open document** link to
    `/template-models/:modelId/document/:documentId`.
- **Hooks:**
  - a new `useFieldSuggestions` (mutation);
  - `useFieldSchema` gains `description` and a bulk-create mutation;
  - `useSuggestions` changes `source_type` to `"llm"`.
- **`LabelingWorkspacePage.tsx`:** no change.
- **Tests (vitest):**
  - `SuggestFieldsModal`: renders suggestions, existing keys unticked, edits
    and unticks carried into the bulk request, error display;
  - the description column and editor input.

## 5. Evaluation harness (dev-only, not shipped)

Location: `apps/backend-services/scripts/label-suggestions-bench/`. It is
written in TypeScript, run with `tsx`, and has a README.

Everything downloaded or generated goes to a git-ignored `.cache/` folder next
to it: forms, filled copies, answer keys, OCR results and reports. Forms and
generated copies are never committed. The repository is public, and the forms'
copyright belongs to their publisher. The harness adds no dependencies: it
uses `pdf-lib`, which is already a dependency, and built-in value lists.

### 5.1 Form collection

`forms.json` lists about 10 public fillable (AcroForm) BC Government forms,
drawn from Provincial Court (small claims, family, criminal) and Residential
Tenancy Branch forms. The harness downloads them at run time.

### 5.2 Generator

For each form, the generator writes N copies (default 20, seeded):

- Every text field gets a value from the built-in lists (names, streets,
  cities, postal codes, phone numbers, dates, amounts, short sentences), kept
  within the field's maximum length.
- Checkboxes, radio groups and dropdowns are set at random.
- The form is flattened with `pdf-lib`.

It also writes an **answer key** per copy: for each field, its name, type,
value, page and rectangle (normalised 0–1). The key name is the field name
normalised to snake_case. The description is the field's tooltip, when the PDF
has one.

### 5.3 Loop 1 — suggestion accuracy (through the platform API)

The harness runs against a running local stack, with the API key taken from
the environment.

1. Create a template model per form and upload the copies, so the platform's
   own OCR runs. Wait for status `extracted`.
2. **Ground truth per copy:**
   - text fields: the OCR words whose centre lies inside the field's rectangle;
   - checkboxes: the selection mark inside it.

   A copy whose words don't join to the answer-key value (for example, clipped
   text) is excluded and counted.
3. **Suggested fields** on copy 1. Match each suggestion to an answer-key field
   by word overlap. Report recall (answer-key fields found), precision
   (suggestions that match a real field) and type accuracy.
4. **Suggested labels** on the remaining copies, with the answer-key field list
   (keys and descriptions). Per field: exact word match, value match, missed,
   wrong. Report per form and overall.
5. **Baseline:** step 4 runs once against the existing engine before it is
   removed.

### 5.4 Loop 2 — training

1. Save the ground-truth labels on K copies (K = 5 and 10) and train a
   template-mode model through the platform.
2. Extract the held-out copies with the trained model and score the field
   values.
3. **Variant runs** build the training files in the harness and call the
   Document Intelligence build API directly, so the product export stays
   unchanged until a variant wins. The variants are:
   - the label word order as saved today versus numeric order;
   - one merged box per field versus one value entry per word.

### 5.5 Engine comparison

The same scoring as step 4 of §5.3, for:

- **Content Understanding.** An analyzer is built from the answer-key fields
  and descriptions (API `2025-11-01`, with `estimateFieldSourceAndConfidence`).
  Each field's `source` polygon is mapped to OCR words.
- **Document Intelligence query fields.** `prebuilt-layout` (API `2024-11-30`)
  with `features=queryFields`, in batches of at most 20 field names. The
  returned field locations are mapped to the stored OCR words by overlap.
- **LLM deployments** through the platform, one run per deployment.

An engine is skipped when its settings are absent from the environment. Only
the winner is proposed for the product.

### 5.6 Availability checks (manual, documented in the README)

- **Models:** read-only `az cognitiveservices model list` and `usage list` for
  the Canadian regions, to see which deployments and quotas are really
  available.
- **Content Understanding in Canada Central:** read-only provider and SKU
  listing first. Creating a test resource and making one API call require
  sign-off.

### 5.7 Reports

A Markdown and a JSON report per run, in `.cache/`, broken down by form,
field and engine. They include totals and usage: pages analysed and LLM
tokens.

### 5.8 Later

Add the VRDU registration-form set (CC BY 4.0, downloaded at run time) as a
check against real scans.

## 6. Documentation

- `docs-md/architecture/TEMPLATE_MODELS.md`: the suggestion endpoints, suggest
  fields, the field description, the LLM settings, and the removal of the old
  engine.
- Wiki pages that describe labelling, updated through the `docs-sync` skill.
- The harness README (§5).

## 7. Risks

- **Pointing at the wrong line.** The LLM can return a wrong tag or retype a
  value. The resolver drops what it cannot match, the harness measures how
  often, and a person checks every suggestion.
- **Latency.** A request takes seconds to tens of seconds. The screen's
  existing loading state covers it.
- **Data handling.** Suggestions send the document text to the configured
  Azure OpenAI deployment. Operators must point the settings at a deployment
  approved for the documents' classification.
- **Long documents** are refused by the limits in §3.1 with a clear message.
