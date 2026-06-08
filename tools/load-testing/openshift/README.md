# In-cluster k6 (OpenShift)

Job manifests live here; the **Kustomization** is one level up (`tools/load-testing/kustomization.yml`) so `configMapGenerator` can embed `k6/*.js` **inside the same directory tree** (Kustomize rejects file sources outside the kustomization root).

## Apply

From repository root:

```bash
oc create secret generic load-test-k6-secrets \
  --from-literal=LOAD_TEST_API_KEY='<your-api-key>' \
  --from-literal=LOAD_TEST_WORKFLOW_VERSION_ID='<workflow-version-id-for-upload-ocr-job>' \
  --from-literal=LOAD_TEST_BLOB_CLASSIFIER_NAME='<existing-classifier-name-for-blob-job>' \
  -n "$NAMESPACE"

oc apply -k tools/load-testing -n "$NAMESPACE"
```

See also [tools/load-testing/README.md](../README.md) and [docs-md/LOAD_TESTING.md](../../../docs-md/LOAD_TESTING.md).

The blob storage pressure Job uses `BASE_URL=http://backend-services:3002`, uploads generated binary multipart files through `POST /api/azure/classifier/documents`, and deletes only its generated label/folder during teardown. Configure backend-services storage env (`BLOB_STORAGE_PROVIDER`, provider credentials, and bucket/container/root) through the application deployment, not the k6 Job.

For realistic payload-size runs, edit the upload or blob Job env before applying and set `LOAD_TEST_PAYLOAD_SIZE_TIER` (`small`, `medium`, or `large`) plus `LOAD_TEST_BODY_LIMIT` to match backend-services `BODY_LIMIT`. The upload Job exercises JSON/base64 body size and PDF normalization/OCR enqueue; the blob Job exercises multipart storage bandwidth. Both default to generated, license-clear payloads.

The review/HITL Job uses `BASE_URL=http://backend-services:3002` and the shared `LOAD_TEST_API_KEY` Secret. Seed synthetic HITL fixtures first with `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N> --group-id=<group>` from a network path that can reach PostgreSQL, or set `LOAD_TEST_HITL_SESSION_MODE=off` on the Job for read-only queue/analytics pressure.

The Temporal queue saturation harness is a Node/Temporal SDK script, not a k6 Job. For a disposable OpenShift namespace, port-forward the Temporal frontend and run it from repo root:

```bash
oc -n "$NAMESPACE" port-forward svc/temporal-server 7233:7233
TEMPORAL_ADDRESS=localhost:7233 npm run load-test:temporal:saturation
```
