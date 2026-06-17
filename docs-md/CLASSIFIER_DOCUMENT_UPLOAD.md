# Classifier document upload limits

`POST /api/azure/classifier/documents` accepts multipart training-document uploads for classifiers.

## File size limit

Each uploaded file may be up to **100 MB**, matching the dataset version upload endpoint in `apps/backend-services/src/benchmark/dataset.controller.ts`.

The route configures multer via `FilesInterceptor` with `limits.fileSize: 100 * 1024 * 1024`. Files larger than 100 MB receive **HTTP 413 Payload Too Large** (via `MulterExceptionFilter` for multer rejections and an explicit controller check as a safeguard).

## Load testing context

Load testing previously reported HTTP 500 for uploads above ~64 KB because the classifier route used `FilesInterceptor("files")` without an explicit limit. The `blob-storage` k6 scenario (256 KB blobs) showed a **20.6 %** failure rate until this limit was aligned with the dataset upload endpoint.

See also:

- [`docs-md/LOAD_TEST_REPORT_2026-05.md`](./LOAD_TEST_REPORT_2026-05.md) — Finding 3
- [`docs-md/LOAD_TESTING.md`](./LOAD_TESTING.md) — blob storage scenario

## Verification

```bash
# Expect HTTP 201 (classifier must exist; replace group/name/label as needed)
curl -H "x-api-key: <api-key>" \
  -F "files=@/path/to/1mb.pdf" \
  -F "name=<classifier>" \
  -F "label=<label>" \
  "http://localhost:3002/api/azure/classifier/documents?group_id=<group>"
```

Files over 100 MB should return **413**, not 500.
