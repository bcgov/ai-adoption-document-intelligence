# Temporal payload footprint

Two mechanisms keep large OCR/extraction data out of Temporal's event history so
workflow histories stay small and replay-safe:

1. **OCR payload refs** — large OCR JSON is written to blob storage and only a
   small reference object travels through workflow `ctx` and activity ports.
2. **Gzip payload codec** — everything that still flows through Temporal
   (arguments, results, signals) is gzip-compressed on the wire.

For the graph-engine context in which these run, see
[DAG_WORKFLOW_ENGINE.md](./DAG_WORKFLOW_ENGINE.md) (§5.0, §7.4). The original
design and rollout notes are archived under
[TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md](../archive/TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md).

## 1. OCR payload refs

Instead of carrying full Azure OCR responses / results inline, OCR activities
persist the JSON to blob storage and pass an `OcrPayloadRef`.

**Type** (`apps/temporal/src/ocr-payload-ref-types.ts`, workflow-safe — no Node,
Prisma, or blob imports):

```ts
interface OcrPayloadRef {
  documentId: string;
  blobPath: string;
  storage: "blob";
  byteLength?: number;
  pageCount?: number;
  status?: string; // running | succeeded | failed — used by pollUntil conditions
}
```

`isOcrPayloadRef(value)` is the runtime guard.

**I/O helpers** (`apps/temporal/src/ocr-payload-ref.ts` — used by activities,
may touch Prisma/blob):

| Helper | Purpose |
|--------|---------|
| `resolveGroupId(documentId)` / `resolveGroupIdForOcr(documentId, groupId?)` | Resolve the owning group (explicit or from the `documents` row) |
| `azureResponseBlobPath` / `ocrResultBlobPath` / `cleanedResultBlobPath` | Build the blob keys (`azure-response.json`, `ocr-result.json`, `cleaned-result.json`) under `{groupId}/ocr/{documentId}/` via `@ai-di/blob-storage-paths` |
| `writeOcrPayloadBlob(groupId, documentId, fileName, json)` | Serialize + write JSON, returns `{ blobPath, byteLength }` |
| `readOcrPayloadBlob<T>(ref)` | Read + parse the JSON a ref points to |
| `makeOcrPayloadRef(documentId, blobPath, status, byteLength?)` | Construct a ref |
| `persistOcrArtifactRef(groupId, documentId, fileName, body, status?)` | Write an artifact and return its ref in one call |
| `loadOcrResultFromPort(value)` / `loadOcrResponseFromPort(value)` | Accept either an inline value or a ref and return the full payload (transparent to callers) |
| `requireDocumentId(params)` | Assert `documentId` was injected into the activity |

**Activity adapters** (`apps/temporal/src/ocr-activity-ref-utils.ts`):
`resolveOcrResultInput`, `toOcrResultPort`, `finalizeCorrectionResult` — bridge
between activity ports and refs.

**Workflow ctx keys:** OCR graphs use `*Ref` ctx keys (`ocrResponseRef`,
`ocrResultRef`, `cleanedResultRef`) holding `OcrPayloadRef`. Activity **port
names** stay `ocrResponse` / `ocrResult` / `cleanedResult`; edge bindings map the
ports to the `*Ref` ctx keys. Poll conditions reference ref status
(`ctx.ocrResponseRef.status`), and `transform` / `fieldMapping` templates use
`{{ocrResultRef.*}}` etc. Structured fields for the UI still land in
`ocr_results` (see [OCR_RESULT_VIEWS.md](../extraction/OCR_RESULT_VIEWS.md)).

On document delete, `DocumentService.deleteDocument` best-effort deletes the
whole `{groupId}/ocr/{documentId}/` prefix.

## 2. Gzip payload codec

`@ai-di/temporal-payload-codec` (`packages/temporal-payload-codec/`) provides a
Temporal `PayloadCodec` that gzip-compresses payload bytes after the
`PayloadConverter` serializes them.

**Exports** (`packages/temporal-payload-codec/src/index.ts`):

| Export | Purpose |
|--------|---------|
| `GzipPayloadCodec` | The codec: `encode` gzips non-empty payload data; `decode` gunzips only payloads tagged with the gzip encoding |
| `GZIP_PAYLOAD_CODEC_ENCODING` | Metadata encoding label (`"binary/gzip"`) |
| `GZIP_ORIGINAL_ENCODING_METADATA_KEY` | Stores the pre-gzip `encoding` so `decode` can restore it (otherwise the converter fails with `Unknown encoding:`) |

Empty payloads pass through untouched; on decode, payloads not tagged
`binary/gzip` pass through, so mixed histories decode correctly.

**Wiring.** Both apps export a shared `temporalDataConverter`
(`payloadConverter: DefaultPayloadConverter`, `payloadCodecs: [new GzipPayloadCodec()]`):

- `apps/temporal/src/temporal-data-converter.ts` — used by the worker (`apps/temporal/src/worker.ts`).
- `apps/backend-services/src/temporal/temporal-data-converter.ts` — used by
  `TemporalClientService` and `BenchmarkTemporalService`.

Every `Connection`/`Client`/`Worker` sets `dataConverter: temporalDataConverter`,
so clients and worker agree on the codec. The package has no inter-package
dependencies and is copied/built directly in each Dockerfile (see
[SHARED_PACKAGES.md](../architecture/SHARED_PACKAGES.md)).
