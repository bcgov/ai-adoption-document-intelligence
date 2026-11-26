---
title: "Integrations Guide"
---

# Integrations Guide

This guide covers how to integrate with the Document Intelligence Platform programmatically — sending documents in for processing and retrieving the extracted results. New to the platform? Start with the step-by-step [From Zero to Integration](./integration-tutorial.md) tutorial.

::: info Base URL
All API endpoints in this guide are relative to your environment's API base URL, `<DIP_API_URL>` in the [tutorial](./integration-tutorial.md). Deployed environments serve it over HTTPS on the standard port; a local instance uses `http://localhost:3002`. See the [API Reference](./api-reference.md) for the full OpenAPI specification.
:::

## Authentication

Integrations authenticate with an **API key**, sent in the `X-API-Key` header on every request.

### Generating an API Key

1. **Log in with your IDIR** — Open the Document Intelligence frontend and sign in with your IDIR.
2. **Navigate to Settings** — If you belong to more than one group, first choose the group in the drop-down at the top of the page. Then click the **Settings** tab in the left sidebar. Only a group `ADMIN` sees it.
3. **Generate API Key** — Click the **Generate API key** button. Your new key will be displayed in a modal dialog. Only a group `ADMIN` can generate, regenerate, or delete the group's key.
4. **Copy and store the key** — Copy the key immediately and store it securely. The full key is only shown once at creation time.

::: warning One key per group.
Each group can have one active API key. API keys are group-scoped — requests authenticated with an API key can only access resources belonging to that group. To get a new key, use **Regenerate key** on the Settings page (this invalidates the previous key). If a key is compromised, delete it immediately from Settings and generate a new one.
:::

::: details Using your API Key in requests
Pass your key in the `X-API-Key` header on all API calls:

```bash
curl /api/models \
  -H "X-API-Key: <your-api-key>"
```
:::

## Sending Documents In

Documents are submitted via the upload endpoint as base64-encoded payloads. On upload, the platform stores the file, creates a document record, and automatically starts a processing workflow via Temporal.

### Upload Endpoint

`POST /api/upload`

Accepts a JSON body with the document file encoded as a base64 string. Processing begins immediately after upload — no separate "start" call is needed.

### Upload Request Fields {#upload-fields}

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | Yes | Display name for the document |
| `file` | string | Yes | Base64-encoded file content. The JSON body limit is 50 MB (about a 37 MB file). |
| `file_type` | enum | Yes | `pdf`, `image`, or `scan`. Use `image` for JPEG, PNG, TIFF, WebP or GIF files, which DIP converts to PDF. `pdf` and `scan` both expect a PDF file. |
| `workflow_slug` | string | Yes\* | Stable workflow handle, unique within the group. \*Send this or `workflow_config_id`. |
| `workflow_version` | integer | No | Pins a version number of `workflow_slug`. Defaults to the latest version. Ignored without `workflow_slug`. |
| `workflow_config_id` | string | No | A workflow version id or lineage id (resolved to the latest version). Alternative to `workflow_slug`; don't send both. |
| `model_id` | string | No\* | Model to run (e.g. `prebuilt-layout`). Defaults to the workflow's `ctx.modelId.defaultValue`. \*Required if the workflow has no default. |
| `original_filename` | string | No | Original file name, including its real extension: `/download` uses the extension to set the content type. Defaults to `<title>.<file_type>`. |
| `metadata` | object | No | Arbitrary JSON metadata to attach to the document, such as your own correlation ids |
| `ctx_overrides` | object | No | Sets values of the `ctx` variables the workflow declares with a default value, for this upload, as `{ "<name>": <value> }`. Other keys are ignored, including values DIP sets from the upload itself, such as `modelId` (use `model_id`). A variable changes nothing unless the workflow's steps read it, so ask the DIP team which variables your workflow uses. |
| `group_id` | string | No | Inferred from the API key. If sent, it must match the key's group. |

Any other field is rejected with `400 property … should not exist`.

::: details Upload a PDF document (curl example)
```
# Encode the file and write the request body to a file
FILE_B64=$(base64 -w 0 invoice.pdf)    # on macOS: FILE_B64=$(base64 -i invoice.pdf)
cat > body.json <<EOF
{
  "title": "Invoice Q1-2026",
  "file": "$FILE_B64",
  "file_type": "pdf",
  "workflow_slug": "<workflow-slug>",
  "model_id": "prebuilt-layout",
  "original_filename": "invoice.pdf",
  "metadata": { "department": "finance", "quarter": "Q1" }
}
EOF

# Upload the document
curl -X POST /api/upload \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  --data @body.json
```

Response:

```json
{
  "success": true,
  "document": {
    "id": "ef2dd8b2-cbed-4b30-a958-3c2484479ca4",
    "title": "Invoice Q1-2026",
    "original_filename": "invoice.pdf",
    "normalized_file_path": "...",
    "file_type": "pdf",
    "file_size": 245782,
    "status": "ongoing_ocr",
    "created_at": "2026-02-19T10:30:00.000Z"
  }
}
```
:::

::: details Upload an image document (curl example)
```
FILE_B64=$(base64 -w 0 receipt.jpg)    # on macOS: FILE_B64=$(base64 -i receipt.jpg)
cat > body.json <<EOF
{
  "title": "Expense Receipt",
  "file": "$FILE_B64",
  "file_type": "image",
  "original_filename": "receipt.jpg",
  "workflow_slug": "<workflow-slug>"
}
EOF

curl -X POST /api/upload \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  --data @body.json
```
:::

::: details List available models
Query the available OCR models before uploading:

```bash
curl /api/models \
  -H "X-API-Key: <your-api-key>"
```

Response:

```json
{
  "models": ["prebuilt-layout", "prebuilt-invoice", "custom-model-v2"]
}
```
:::

### Creating Your Own Workflow (Optional)

For advanced processing pipelines, create a workflow configuration using the Workflows API. Workflows are DAG-based graphs with 30+ built-in activities including OCR, validation, classification, HITL routing, and more. Reference the workflow when uploading documents (by `workflow_slug`, or by `workflow_config_id`) to route them through your custom pipeline. List the workflows in your group with `GET /api/workflows?groupId=<group-id>`.

::: details Create a workflow configuration (curl example)
```bash
curl -X POST /api/workflows \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d "{
    \"groupId\": \"<group-id>\",
    \"name\": \"Invoice Processing\",
    \"description\": \"OCR + validation + review pipeline\",
    \"config\": {
      \"schemaVersion\": \"1.0\",
      \"metadata\": { ... },
      \"entryNodeId\": \"...\",
      \"ctx\": { ... },
      \"nodes\": { ... },
      \"edges\": [ ... ]
    }
  }"
```

`groupId` is required. The response contains the new `workflow`, including its `id` and a `slug` generated from the name, plus a `validation` result for the config.

Then reference it during upload:

```
FILE_B64=$(base64 -w 0 invoice.pdf)    # on macOS: FILE_B64=$(base64 -i invoice.pdf)
cat > body.json <<EOF
{
  "title": "Invoice",
  "file": "$FILE_B64",
  "file_type": "pdf",
  "model_id": "prebuilt-layout",
  "workflow_slug": "<workflow-slug>"
}
EOF

curl -X POST /api/upload \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  --data @body.json
```
:::

## Retrieving Processed Data

The platform processes documents asynchronously. After uploading, poll the document status until processing completes, then retrieve the extracted data.

### Processing Flow

Documents uploaded through the API move through the following statuses:

<Badge type="info" text="ongoing_ocr" /> → <Badge type="warning" text="extracted" /> → <Badge type="tip" text="complete" />

If the workflow includes a human review step, low-confidence documents pause before completing:

<Badge type="warning" text="extracted" /> → <Badge type="tip" text="awaiting_review" /> → <Badge type="tip" text="complete" /> or <Badge type="tip" text="rejected" />

### Document Statuses {#document-statuses}

| Status | Meaning | Final? |
| --- | --- | --- |
| `pre_ocr` | Stored, waiting to start. Documents sent to `POST /api/upload` start at `ongoing_ocr` instead. | No |
| `ongoing_ocr` | Workflow running | No |
| `extracted` | OCR result stored, workflow continuing | No |
| `awaiting_review` | Low confidence. A person must review it in the HITL queue, which can take hours or days; it then becomes `complete` or `rejected`. Workflows built from DIP's Standard OCR templates store the result before review, so `/ocr` already returns it; a workflow that stores results after review returns `"ocr_result": null` until then. | Yes, for most callers |
| `complete` | Done (OCR and any review). After a review, `/ocr` still returns what OCR extracted; see [Reading Reviewer Corrections](#reviewer-corrections). | **Yes** |
| `failed` | Processing error | Yes |
| `conversion_failed` | The original was stored but could not be converted to PDF, for example because it is password-protected | Yes |
| `rejected` | A reviewer rejected it at the human review step | Yes |

::: info Polling Pattern
The platform does not currently support webhooks. Poll `GET /api/documents/:id` until the status is final, then fetch the result. A reasonable interval is every 3-5 seconds. Rate limits are counted per public IP address; the tutorial's [Step 2](./integration-tutorial.md#step-2) gives the production and test limits, under **Network and hosting considerations**.
:::

### Checking Document Status

Get a single document to check its status, or list the documents in your group.

::: details Get one document (curl example)
```bash
curl /api/documents/ef2dd8b2-cbed-4b30-a958-3c2484479ca4 \
  -H "X-API-Key: <your-api-key>"
```

Returns the document record, including `status`.
:::

::: details List documents in a group (curl example)
```bash
curl "/api/documents?group_id=<group-id>&status=complete&limit=50" \
  -H "X-API-Key: <your-api-key>"
```

`group_id` is required, even with an API key. Optional filters include `status` (`failed` also matches `conversion_failed`), `source` (`api` covers everything sent to `POST /api/upload`, including uploads from the DIP web UI), `search`, `limit` (default 50, max 200), and `offset`.

Response (paginated):

```json
{
  "documents": [
    {
      "id": "ef2dd8b2-cbed-4b30-a958-3c2484479ca4",
      "title": "Invoice Q1-2026",
      "original_filename": "invoice.pdf",
      "file_type": "pdf",
      "file_size": 245782,
      "status": "complete",
      "created_at": "2026-02-19T10:30:00.000Z",
      "updated_at": "2026-02-19T10:31:15.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```
:::

### Retrieving OCR Results

Once a document reaches a final status (usually `complete` or `awaiting_review`), retrieve the structured extraction data.

::: details Get OCR results (curl example)
```bash
curl /api/documents/ef2dd8b2-cbed-4b30-a958-3c2484479ca4/ocr \
  -H "X-API-Key: <your-api-key>"
```

Response:

```
{
  "document_id": "ef2dd8b2-cbed-4b30-a958-3c2484479ca4",
  "status": "complete",
  "title": "Invoice Q1-2026",
  "original_filename": "invoice.pdf",
  "file_type": "pdf",
  "file_size": 245782,
  "created_at": "2026-02-19T10:30:00.000Z",
  "updated_at": "2026-02-19T10:31:15.000Z",
  "model_id": "prebuilt-layout",
  "ocr_result": {
    "id": "result-uuid",
    "document_id": "ef2dd8b2-cbed-4b30-a958-3c2484479ca4",
    "keyValuePairs": {
      "Invoice No:": { "type": "string", "valueString": "INV-2026-001", "content": "INV-2026-001",
                       "confidence": 0.98, "boundingRegions": [ ... ], "spans": [ ... ] },
      "Total:": { "type": "string", "valueString": "$1,234.56", "content": "$1,234.56",
                  "confidence": 0.97, "boundingRegions": [ ... ], "spans": [ ... ] }
    },
    "content": {
      "format": "text",
      "text": "full document text ...",
      "pages": [ { "pageNumber": 1, "content": "...", "lines": [ ... ] } ]
    },
    "processed_at": "2026-02-19T10:31:15.000Z"
  }
}
```

The `keyValuePairs` object contains the extracted fields, each as an object: read `valueString` for the value and `confidence` for how sure the model was. Custom models return the fields defined during training. `prebuilt-layout` returns the key-value pairs it finds on the page, keyed by their labels (for example `Date:`). `prebuilt-read` returns text only, with `keyValuePairs` set to `null`, so read `content.text` and `content.pages`. `content.format` is `text`, or `markdown` when the workflow asks Azure for Markdown output; the Markdown is then in `content.markdown`, and `content.text` stays plain text. `ocr_result` is `null` until a result is stored.
:::

### Other Document Endpoints

| Call | Purpose |
| --- | --- |
| `GET /api/documents/:id/download` | The file exactly as uploaded, under its `original_filename`. The content type comes from that name's extension (`410` if purged by the workflow's retention policy) |
| `GET /api/documents/:id/view` | The PDF that DIP converted the upload into and ran OCR on. Always `application/pdf` (`410` if purged) |
| `POST /api/documents/:id/reprocess` | Re-run a document that is `failed`, or stuck in `ongoing_ocr`. Returns `202` |
| `DELETE /api/documents/:id` | Delete a document |

::: details Download original document (curl example)
```bash
curl -o invoice.pdf \
  /api/documents/ef2dd8b2-cbed-4b30-a958-3c2484479ca4/download \
  -H "X-API-Key: <your-api-key>"
```

Returns the file with a `Content-Type` based on its filename's extension, and a `Content-Disposition` header. For an image upload, `/download` returns the image and `/view` returns the converted PDF.
:::

## Human-in-the-Loop Review

When workflows include confidence-based routing, documents that fall below confidence thresholds are routed to a human review queue and wait in the `awaiting_review` status. The HITL API enables building custom review interfaces or integrating review into existing tools. The queue, statistics, and analytics endpoints require a `group_id` query parameter.

### Review Queue

`GET /api/hitl/queue?group_id=<group-id>`

Paginated list of documents requiring review. Supports filtering by `reviewStatus` (`pending`, `claimed`, `reviewed`, `flagged`, `all`), `modelId`, `workflowId`, and filename `search`, with `sortBy`/`sortDir`, `limit`, and `offset`.

### Queue Statistics

`GET /api/hitl/queue/stats?group_id=<group-id>`

Returns counts and metrics for the review queue — useful for dashboards and monitoring.

### Review Session Lifecycle

Reviews follow a session-based model. Starting a session locks the document to the reviewer:

1. **Start a session** — `POST /api/hitl/sessions` with a `documentId`, or `POST /api/hitl/sessions/next?group_id=<group-id>` to claim the next eligible document from the queue (a `201` with an empty body means nothing is waiting)
2. **Keep the lock alive** — `POST /api/hitl/sessions/:id/heartbeat` extends the lock while the reviewer is working. Without a heartbeat the lock expires after 10 minutes, and other reviewers can pick the document up again
3. **Submit corrections** — `POST /api/hitl/sessions/:id/corrections` to confirm, correct, flag, or delete extracted fields
4. **Finish the review** — choose one of:
    - `POST /api/hitl/sessions/:id/approve` — approve the document; it becomes `complete`
    - `POST /api/hitl/sessions/:id/reject` — reject the document with a `rejectionReason` (`INPUT_QUALITY`, `OCR_FAILURE`, `MODEL_MISMATCH`, `CONFIDENCE_TOO_LOW`, or `SYSTEMIC_ERROR`) and optional `comments`; it becomes `rejected`
    - `POST /api/hitl/sessions/:id/skip` — release the lock and return the document to the pending queue. A session that was flagged with a note and picked up again with `reopen` goes back to the flagged list instead, note and corrections included
    - `POST /api/hitl/sessions/:id/flag` — flag the session for follow-up, with an optional `note`. This releases the lock and moves the document from the pending queue to the flagged list (`reviewStatus=flagged`), and `sessions/next` doesn't serve it. To pick it up again, call `POST /api/hitl/sessions/:id/reopen`

With an API key, every request acts as the same reviewer, so the lock can't keep two of your workers apart. Coordinate them on your side.

::: details Review session workflow (curl examples)
```
# 1. Get the review queue
curl "/api/hitl/queue?group_id=<group-id>&reviewStatus=pending" \
  -H "X-API-Key: <your-api-key>"

# 2. Start a review session
curl -X POST /api/hitl/sessions \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d "{ \"documentId\": \"ef2dd8b2-...\" }"

# 3. Submit corrections
curl -X POST /api/hitl/sessions/<session-id>/corrections \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d "{
    \"corrections\": [
      {
        \"field_key\": \"Invoice No:\",
        \"original_value\": \"INV-2026-001\",
        \"corrected_value\": \"INV-2026-002\",
        \"action\": \"corrected\"
      }
    ]
  }"

# 4. Approve the document
curl -X POST /api/hitl/sessions/<session-id>/approve \
  -H "X-API-Key: <your-api-key>"
```

Each correction's `action` is one of `confirmed`, `corrected`, `flagged`, or `deleted`.
:::

### Reading Reviewer Corrections {#reviewer-corrections}

Approving a review doesn't change the OCR result: `GET /api/documents/:id/ocr` still returns what OCR extracted. The reviewers' corrections are stored separately, and you read them through a review session:

1. **Find the session** — `GET /api/hitl/queue?group_id=<group-id>&reviewStatus=reviewed` lists approved documents, each with `lastSession.id`, the approving session.
2. **Read the corrections** — `GET /api/hitl/sessions/<session-id>/corrections` returns every correction saved on the document, in any of its review sessions, so corrections a reviewer saved before a session was skipped or timed out are included

```
{
  "sessionId": "<session-id>",
  "corrections": [
    { "fieldKey": "Invoice No:", "originalValue": "INV-2026-001", "correctedValue": "INV-2026-002",
      "action": "corrected", "author": { "type": "api_key" }, ... }
  ]
}
```

Corrections are listed oldest first, with one entry per change, so for a field corrected more than once the last entry is the current value. `author` says who made each one: `user` with the reviewer's `email`, `api_key` for a correction submitted with your group's API key, as in the example above, or `unknown` for corrections saved before authors were recorded.

### Analytics

Track review performance and throughput with the analytics endpoint. Filter by `startDate`, `endDate`, and `reviewerId`:

::: details Get HITL analytics (curl example)
```bash
curl "/api/hitl/analytics?group_id=<group-id>&startDate=2026-01-01&endDate=2026-02-19" \
  -H "X-API-Key: <your-api-key>"
```
:::

## Step-by-Step Tutorial

::: tip From Zero to Integration
Want to see these calls put together? Follow a complete walkthrough, from getting an API key to uploading, polling, and reading results, with `curl` examples you can run before moving the calls into your own service.

[Start the tutorial →](./integration-tutorial.md)
:::
