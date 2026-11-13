---
title: "From Zero to Integration"
---

# From Zero to Integration

This step-by-step tutorial is for a developer on an outside team who wants to send documents to the Document Intelligence Platform (DIP) and get extracted data back. It starts from nothing and assumes **your application and DIP run on different machines and networks**. Your app talks to DIP only over HTTPS with an API key. You don't need any DIP-specific code or libraries.

Each step uses `curl`, so you can confirm every call works from the machine that will host your integration before you write any code. The last step explains how to move the same calls into your own service, in any language.

::: tip Integrations Guide
Looking for a reference of the upload fields, document statuses, workflow configuration, or the human-in-the-loop review API instead of a walkthrough?

[Go to the Integrations Guide →](./integrations.md)
:::

::: info Placeholders used on this page
Values in angle brackets are placeholders for this guide only, not environment variables that DIP or your system defines. Replace each one with your own value before you run a command:

- `<DIP_API_URL>`: the base URL of the DIP backend (API) for the environment you target.
- `<DIP_UI_URL>`: the base URL of the DIP web UI for that environment.
- `<API_KEY>`, `<GROUP_ID>` and `<WORKFLOW_SLUG>`: the values you get in [Step 1](#step-1).
- `<DOCUMENT_ID>`: the id the upload returns in [Step 4](#step-4).

Ask the DIP team for both URLs for each environment (dev, test, prod). Each environment is a **separate instance with its own database**, so API keys and group ids from one environment don't work in another, and the DIP team sets up your workflow in each environment separately. Swagger UI for an environment is at `<DIP_API_URL>/api`, and the full spec is on the [API Reference](./api-reference.md) page.
:::

## Table of Contents

- [How It Works](#how-it-works)
- [Before You Start](#prerequisites)
- [Step 1: Get Access and an API Key](#step-1)
- [Step 2: Check the Network Path](#step-2)
- [Step 3: Check Your Key and Pick a Workflow](#step-3)
- [Step 4: Upload a Document](#step-4)
- [Step 5: Poll Until the Status Is Final](#step-5)
- [Step 6: Get the Result](#step-6)
- [Step 7: Move It Into Your Service](#step-7)
- [Troubleshooting](#troubleshooting)
- [Security Checklist](#security)
- [Appendix: Trying This Against a Local DIP Instance](#local-dip)

## How It Works {#how-it-works}

An integration makes four kinds of calls. Processing runs in the background after the upload, so your app pulls status and results. DIP never needs inbound access to your network.

### 1. Discover

`GET /api/models`
`GET /api/workflows`

Optional. See which models and workflows your key can use.

### 2. Upload

`POST /api/upload`

Send a base64 file and a workflow slug. Get back a document id.

### 3. Poll

`GET /api/documents/{id}`

Check the status every few seconds until it is final.

### 4. Fetch Result

`GET /api/documents/{id}/ocr`

Read the extracted fields and text.

## Before You Start {#prerequisites}

| What | Why |
| --- | --- |
| A DIP **group** | Documents, workflows, and API keys all belong to a group. If your area doesn't have one yet, the DIP team creates it (see [Step 1](#step-1)). |
| An **API key** for that group | Server-to-server authentication through the `x-api-key` header. |
| A **workflow slug** in that group | Every upload must name a workflow, which defines the processing steps. The DIP team sets up a workflow in your group and gives you its slug. |
| The `<DIP_API_URL>` for your target environment | Supplied by the DIP team. |
| **Network reachability** from your server to `<DIP_API_URL>` over HTTPS (443) | See [Step 2](#step-2). Production DIP only accepts callers from an IP allow-list. |

## Step 1: Get Access and an API Key {#step-1}

1. **Sign in** — In a browser, go to `<DIP_UI_URL>` and sign in with your IDIR.
2. **Get into a group** — If your area already has a DIP group, request to join it: open **Groups → All groups** and click **Join**, and a group admin approves the request. If you aren't in any group yet, DIP shows the **Request group membership** page when you sign in. If your area has no group, ask the DIP team to create one. **Only a group `ADMIN` can create API keys.** If you aren't an admin, ask your group admin to generate the key and share it with you securely.
3. **Get your workflow slug** — A new group has no workflows. The DIP team sets up the workflow your documents run through and gives you its `slug`, the name you send with each upload. This is your `<WORKFLOW_SLUG>`.
4. **Generate the key** — If you belong to more than one group, first choose this one in the group drop-down at the top of the page, which shows your current group's name. Then go to **Settings → API key → Generate API key**. **Copy the key right away.** It is shown only once, because DIP doesn't keep the full key. This is your `<API_KEY>`.
5. **Note your group id** — You need it only to list workflows; uploads infer the group from the key. Open **Groups** in the DIP UI and click your group. The id is the last part of the page URL (`<DIP_UI_URL>/groups/<GROUP_ID>`). This is your `<GROUP_ID>`.
6. **Store the key** — Put it in your application's secret store (for example a vault or a Kubernetes/OpenShift secret). Don't store it in source code.

::: warning One key per group, per environment.
**Regenerate key** replaces the group's key, so the old key stops working immediately. Repeat this step in each DIP environment you integrate with.
:::

## Step 2: Check the Network Path {#step-2}

Run the commands in this tutorial from the machine (or a machine on the same network) that will host your integration. That confirms the network path works before you write any code. Start with a request that needs no key:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" <DIP_API_URL>/api
```

`200` means your machine reaches DIP: that address serves the API's Swagger page. If the command times out, or the connection is refused or reset, the problem is the network path rather than your key. Work through the considerations below with your network team and the DIP team.

DIP is deployed as OpenShift routes behind an HAProxy router. Confirm the details for your target environment with the DIP team.

::: details Network and hosting considerations
| Topic | What to know |
| --- | --- |
| **HTTPS only** | DIP routes terminate TLS at the edge and redirect plain HTTP to HTTPS. Always call `https://…`. A redirected `POST` can arrive as a `GET` or lose its body, which looks like a confusing 404/400. This doesn't apply when you run DIP locally and call `http://localhost:3002`. |
| **Production IP allow-list** | The **production** API and UI routes only accept connections from BC Government public address ranges (`142.22.0.0/16` – `142.36.0.0/16`). That includes the gov VPN and the OpenShift Silver/Gold/Gold-DR egress pools. If your app is hosted elsewhere (for example a public cloud or a vendor network), requests are refused before they reach DIP. The same applies to the production UI, where you create your key. |
| **Your own egress** | Make sure your firewall or cluster egress policy (for example an OpenShift `NetworkPolicy` or an egress firewall) allows outbound HTTPS to the DIP host. |
| **Rate limits count your public IP** | Each public IP can make about **2,000 requests per minute** to any one endpoint in production, and about **100 per minute** in test. Polling different documents counts as the same endpoint. Separately, 20 failed API-key attempts in a row within a minute block that IP for the rest of the minute, valid keys included. If several of your services or pods share one NAT egress IP, **they share these limits**, as do other callers behind the same address. |
| **Request size** | The DIP API accepts JSON bodies up to **50 MB**. Base64 adds about 33%, so the practical file limit is about **37 MB**. |
| **Timeouts** | The upload call converts the file to PDF before it responds, so give uploads a generous client timeout (60 s or more). OpenShift routes time out idle requests at 30 s by default unless DIP has configured otherwise. All other calls are quick. |
| **No callbacks** | DIP doesn't push results or webhooks. Your app pulls status and results. |
| **File retention** | A workflow may purge stored files after processing. After a purge, `/view` and `/download` return `410 Gone`, but `/ocr` still returns the extracted result. Keep your own copy of the original file if you need it. |
:::

## Step 3: Check Your Key and Pick a Workflow {#step-3}

The first call checks your key. The second lists the workflows you can upload to.

```
# Model ids this environment offers, plus any models your group trained
curl -s -H "x-api-key: <API_KEY>" <DIP_API_URL>/api/models

# Workflows in your group (slug, name, config)
curl -s -H "x-api-key: <API_KEY>" "<DIP_API_URL>/api/workflows?groupId=<GROUP_ID>"
```

::: info Reading the result
A `401` from the first call means the key is missing or wrong (see [Troubleshooting](#troubleshooting)). If it hangs instead, go back to [Step 2](#step-2). An empty workflow list, `{"workflows":[]}`, means no workflow has been set up for your group yet: ask the DIP team.
:::

Find the workflow the DIP team set up for you, and check its `slug`. Workflows belong to a group, so a slug works only with that group's key.

A workflow can declare a default model in `config.ctx.modelId.defaultValue`, and uploads use it unless you send `model_id`. If the workflow declares no default, every upload must send `model_id`. Ask the DIP team which model fits your documents: `prebuilt-layout` returns the text, page by page, and the key-value pairs it finds; `prebuilt-read` returns the text page by page, without key-value pairs.

## Step 4: Upload a Document {#step-4}

Send `POST /api/upload` with a JSON body. The `file` field is the file content **base64-encoded**. Writing the body to a file avoids shell argument-length limits for larger documents.

```
B64=$(base64 -w0 invoice.pdf)        # on macOS: B64=$(base64 -i invoice.pdf)
cat > body.json <<EOF
{
  "title": "Invoice 123",
  "file": "$B64",
  "file_type": "pdf",
  "original_filename": "invoice.pdf",
  "workflow_slug": "<WORKFLOW_SLUG>",
  "metadata": { "externalRef": "my-system-123" }
}
EOF

curl -s -X POST <DIP_API_URL>/api/upload \
  -H "x-api-key: <API_KEY>" -H "content-type: application/json" \
  --max-time 120 \
  --data @body.json
```

Use `file_type` `pdf` for PDFs and `image` for JPEG, PNG, TIFF, WebP or GIF files, which DIP converts to PDF. Send `original_filename` with the file's real extension, because `/download` uses it to set the file type. Add `model_id` only to use a different model from the workflow's default.

Response `201`:

```json
{ "success": true,
  "document": { "id": "5098b5ee-...", "title": "Invoice 123", "original_filename": "invoice.pdf",
                "normalized_file_path": "...", "file_type": "pdf", "file_size": 2200,
                "status": "ongoing_ocr", "created_at": "..." } }
```

The upload starts processing automatically, so the status is already `ongoing_ocr`. `normalized_file_path` is DIP's internal storage key, which you don't need.

::: tip Save `document.id` in your own system.
You need it for every later call. Because processing continues after the upload returns, your app can restart and resume polling later with the saved id.
:::

For every upload field, including `workflow_version` and `ctx_overrides`, see [Upload Request Fields](./integrations.md#upload-fields) in the Integrations Guide.

## Step 5: Poll Until the Status Is Final {#step-5}

```bash
curl -s -H "x-api-key: <API_KEY>" <DIP_API_URL>/api/documents/<DOCUMENT_ID>
```

Stop polling when `status` is final: `complete`, `awaiting_review`, `failed`, `conversion_failed`, or `rejected`. `awaiting_review` means the document is waiting for a person in DIP's review queue; it becomes `complete` or `rejected` after the review, which can take hours or days. See [Document Statuses](./integrations.md#document-statuses) for what each status means.

Poll every 3–5 seconds, and always stop after an overall timeout. A single page usually finishes in seconds, but it can take longer when DIP is busy. Remember that the rate limit is shared per public IP (see [Step 2](#step-2)).

## Step 6: Get the Result {#step-6}

```bash
curl -s -H "x-api-key: <API_KEY>" <DIP_API_URL>/api/documents/<DOCUMENT_ID>/ocr
```

```
{
  "document_id": "5098b5ee-...",
  "status": "complete",
  "model_id": "prebuilt-layout",
  "ocr_result": {
    "keyValuePairs": {                     // null for prebuilt-read
      "Date:": { "type": "string", "valueString": "2026-07-12", "content": "2026-07-12",
                 "confidence": 0.996, "boundingRegions": [ ... ], "spans": [ ... ] },
      ...
    },
    "content": {
      "format": "text",
      "text": "full document text ...",
      "pages": [ { "pageNumber": 1, "content": "...", "lines": [ ... ] } ]
    },
    "processed_at": "..."
  }
}
```

### Custom Models and Prebuilt Layout

Read fields from `ocr_result.keyValuePairs`. Custom models key them by the field names they were trained on; `prebuilt-layout` keys them by the labels it finds on the page, such as `Date:`. Each value is an object: read `valueString`, and `confidence` if you need it.

### Prebuilt Read

`prebuilt-read` returns text only, and `keyValuePairs` is `null`. Read `ocr_result.content.text`, or `content.pages` for the text page by page.

For a document that went through review, `/ocr` still returns what OCR extracted. The reviewer's corrections are stored separately: see [Reading Reviewer Corrections](./integrations.md#reviewer-corrections). While a document is `awaiting_review`, workflows built from DIP's Standard OCR templates have already stored the result; a workflow that stores results only after review returns `"ocr_result": null` until then.

## Step 7: Move It Into Your Service {#step-7}

Once each `curl` call works, your service makes the same HTTPS calls with any HTTP client. No DIP library is needed.

| In your service | What to do |
| --- | --- |
| **Configuration** | Provide `<DIP_API_URL>`, the API key, and the workflow slug as environment variables from your secret store. Send the key in the `x-api-key` header on every call. |
| **Upload** | Base64-encode the file, call `POST /api/upload` ([Step 4](#step-4)) with a generous client timeout, and save `document.id` with your own record. |
| **Poll** | Call `GET /api/documents/{id}` every 3–5 seconds until the status is final ([Step 5](#step-5)), with an overall timeout. |
| **Read the result** | Unless the status is `failed` or `conversion_failed`, call `GET /api/documents/{id}/ocr` ([Step 6](#step-6)) and store what you need. |
| **Errors** | Treat non-2xx responses as errors and log the response's `message`, never the API key. See [Troubleshooting](#troubleshooting). |

In a long-running service, consider polling from a background job keyed on the saved document id rather than holding a request open, so a restart doesn't lose track of in-flight documents.

## Troubleshooting {#troubleshooting}

| Symptom | Cause / fix |
| --- | --- |
| `401 Invalid API key` / `401 Unauthorized` | `Invalid API key`: the key is wrong, it was regenerated, or it belongs to a different DIP environment. `Unauthorized`: no key was sent. Send it in the `x-api-key` header. |
| `429` rate limited | Too many requests from your public IP to one endpoint, or 20 failed API keys in a row within a minute; the production and test limits are in [Step 2](#step-2), under **Network and hosting considerations**. Poll less often or spread the load, and fix a wrong key before retrying. |
| `403 group_id does not match the API key's group` | Remove `group_id` from the upload, or use the matching key. |
| `403` on `GET /api/workflows` | `groupId` is not the key's group. |
| `404 Workflow not found: slug "…"` | The slug doesn't exist in the key's group in this environment. List the available workflows with `GET /api/workflows` ([Step 3](#step-3)). |
| `400 model_id is required…` | The workflow has no default model, so pass `model_id`. |
| `404 Model not found: …` | The model belongs to another group. Pass a `model_id` your group can use, or ask the DIP team to change the workflow's default. |
| `400 The file is not a valid PDF or is corrupted.` | `file_type` is `pdf` or `scan`, but the file isn't a readable PDF. Send images with `file_type` `image`. No document is created. |
| `400 The file is not a valid image…` / `400 The image format is not supported…` | `file_type` is `image`, but the file isn't a JPEG, PNG, TIFF, WebP or GIF image. No document is created. |
| `400 property … should not exist` | The body has a field the API doesn't accept. Check the names against [Upload Request Fields](./integrations.md#upload-fields). |
| `413` / body too large | The JSON body is over 50 MB (about a 37 MB file). |
| `422` with code `password_protected` or `conversion_failed` | The file is password-protected, or DIP couldn't convert it. The document is stored with status `conversion_failed` and isn't processed. For `password_protected`, upload an unlocked copy. For `conversion_failed`, check that the file opens, then send it again, or send the DIP team the `document.id` from the response. |
| `504` / gateway timeout on upload | A large file took longer than the route timeout. DIP keeps converting it and may still create the document, which appears only once conversion finishes. Wait a few minutes, then check `GET /api/documents?group_id=<GROUP_ID>` before you send it again, so you don't create a duplicate. Otherwise retry with a smaller file, or ask the DIP team. |
| `410 Gone` on `/view` or `/download` | The file was purged per the workflow's retention policy. Use `/ocr` for the result. |
| Document doesn't reach a final status within your timeout | Send the DIP team the `document.id`. |
| Browser `fetch` blocked by CORS | Expected. Call DIP from your backend. |
| Any other error | Report it to the DIP team with the time of the request and, if you have one, the `document.id`. |

## Security Checklist {#security}

- Keep the API key **server-side only**, in a secret store or environment variable. Never put it in front-end code or commit it.
- The key acts for the **whole group**, with editor rights. Anyone who has it can read, upload, and delete that group's documents, change its workflows, and approve or reject its reviews.
- Use a separate key and group per environment. Never reuse a production key in dev/test.
- Rotate the key with **Settings → Regenerate key**, then update your secret store. The old key stops working immediately, so plan the switch to avoid downtime.
- Always use HTTPS, and don't turn off certificate verification in your HTTP client.
- Don't log the `x-api-key` header, base64 file content, or OCR text if documents contain personal information.

## Appendix: Trying This Against a Local DIP Instance {#local-dip}

This applies only if you run DIP yourself for evaluation (for example from the [DIP source repo](https://github.com/bcgov/ai-adoption-document-intelligence)). It is not part of a normal integration.

::: details Local DIP setup notes
- Use `http://localhost:3002` as `<DIP_API_URL>`. The UI is at `http://localhost:3000`.
- Seeding the DIP database (`npm run db:seed`) creates a group named `Default` (id `seeddefaultgroup`) with a test API key and sample workflows such as `standard-ocr`. The key is the value of `TEST_API_KEY` in the DIP repo's `.env` when the seed ran, or the development default in `apps/shared/prisma/seed.ts` if that was unset.
- If documents stay at `ongoing_ocr`, the Temporal worker isn't running. In the DIP repo, run `npm run dev:temporal-worker`.
- If uploads fail with `table … does not exist`, the database is behind on migrations. Run `npm run db:migrate` in `apps/backend-services`.
:::

::: tip You're integrated.
For every request and response schema, see the [API Reference](./api-reference.md). For workflow configuration and the human-in-the-loop review API, see the [Integrations Guide](./integrations.md).
:::
