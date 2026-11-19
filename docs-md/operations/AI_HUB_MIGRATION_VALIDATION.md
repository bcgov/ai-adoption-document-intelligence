# AI Hub migration

Move Document Intelligence, Azure Mistral Document AI and Azure OpenAI traffic
from developer APIM to the `sdpr-invoice-automation` AI Landing Zone **TEST**
tenant. Azure Content Understanding is deferred. Database and storage services
are unchanged. Successful TEST-tenant checks are not a production promotion gate.

## Existing environment keys, new values

Let **B** = `https://test.aihub.gov.bc.ca/sdpr-invoice-automation`.
Use this tenant root without a service suffix.

| Existing key | Replacement value | Runtime |
| --- | --- | --- |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | B | Backend and worker |
| `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` | Tenant APIM subscription key | Both |
| `MISTRAL_DOC_AI_AZURE_ENDPOINT` | B | Worker |
| `MISTRAL_DOC_AI_AZURE_KEY` | Tenant APIM subscription key | Worker |
| `AZURE_OPENAI_ENDPOINT` | B | Both |
| `AZURE_OPENAI_API_KEY` | Tenant APIM subscription key | Both |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-5.6-sol` | Both |
| `AZURE_OPENAI_API_VERSION` | `2025-03-01-preview` (live-confirmed) | Both |

Operators update local runtime settings, normally the root `.env`, or the existing
OpenShift `[instance-]backend-services-config` / `-secrets` and
`[instance-]temporal-worker-config` / `-secrets`. Confirm the worker's Mistral
wiring separately. Restart both runtimes after replacing values. No environment
files or deployment configuration are changed by this migration patch.
Do not change database, MinIO/blob storage or `AZURE_STORAGE_*` values.

`AZURE_OPENAI_*` serves the agent, enrichment, format suggestions, benchmark
recommendations and both vision extractors. Select Azure for the agent.
Workflow ctx deployment parameters override the environment: historical E04/E05
versions pin `gpt-5.4`. Publish new versions selecting `gpt-5.6-sol` rather than
rewriting historical versions. Azure Mistral uses `mistral-document-ai-2512`;
the native Mistral transport is unchanged.

## Compatibility and test wiring

- DI submission takes its polling result ID from `Operation-Location`, not the
  gateway's unrelated `apim-request-id`. The configured tenant/model path is
  validated, and backend operation polling preserves the tenant prefix.
- Azure Mistral adds APIM's `api-key` header alongside its existing authorization
  header. Existing Azure OpenAI clients already use tenant-scoped Chat Completions.
- E01/E02/E04/E05 templates bind to `ocrResponseRef`, `ocrResultRef` and
  `cleanedResultRef`, the keys returned to benchmark evaluation. Synchronous
  providers persist mapped/raw outputs as refs. Existing tests assert the actual
  extracted fields through those refs; they do not count empty predictions as
  evidence of working extraction.
- The existing live agent scenario includes `groupId` in its workflow lookup.

## Validate using existing tests and benchmarks

Run offline regression and installed-SDK contract tests first:

```bash
# apps/temporal; CI=true skips local Temporal integration cases
CI=true npx jest --runInBand --testPathPattern='(azure-analyze-result-id|di-sdk-hub-contract|activities/(submit-to-azure-ocr|poll-ocr-results|mistral-ocr-process)|ocr-providers/|experiment-(01|02|04|05))'
# apps/backend-services
npx jest --runInBand --testPathPatterns='(azure.service.spec|provider-resolver|template-model-ocr.service.spec)'
```

With an approved local database/Temporal stack, run the existing E01/E02/E04/E05
integration tests without `CI=true`. Those tests mock paid transports; they
validate workflow wiring, not live connectivity. Do not run database-resetting
test setup against shared data.

For live validation, use the existing benchmark UI/APIs and
[extraction experiments](../EXTRACTION_EXPERIMENTS.md), not the all-experiment
command (which includes deferred CU). Disable the existing provider mocks and
set `DOCUMENT_INTELLIGENCE_MODE=live`. Use three approved, non-sensitive,
single-page images with frozen ground truth. Keep the dataset version, split,
evaluator rules and pass thresholds identical across providers. Publish test
workflow versions with canonical refs and one activity attempt; run one sample
at a time. DI and Mistral each require one inference submission per sample;
direct requires one and hybrid requires two. Do not create paid old-provider
baselines or retrain/copy models for this check.

Space Mistral submissions at least **30 seconds after the previous sample
completes**, following the observed `retry-after-ms: 30000` guidance. Serial
execution alone previously hit HTTP 429. This is operator/test pacing, not a new
application rate limiter. Preserve failures; do not retry automatically.

Download each run's existing export once and compare predictions against the
original evaluator and saved baseline. Isolate outputs across runs: existing
benchmark wrappers use `benchmark-<sample-id>` OCR blob paths, so later runs of
the same sample can overwrite those blobs. Save exports before another run,
and do not reconstruct historical scores from mutable blob refs. Missing
baseline evidence is unverified, not passed.

Reuse `tests/e2e/workflow-builder/specs/tier3-agent-live.spec.ts` for an Azure
agent check with the existing live-test opt-in. Avoid normal Playwright global
setup when it would reset shared data. Keep credentials and exported document
content out of Git and logs; no additional validation runner is required.

## References

- [AI Hub documentation](https://bcgov.github.io/ai-hub-tracking/)
- [TEST tenant declaration](https://github.com/bcgov/ai-hub-tracking/blob/main/infra-ai-hub/params/test/tenants/sdpr-invoice-automation/tenant.tfvars)
- [Agent configuration and shared OpenAI consumers](../workflows/AGENT_SETUP.md)
- [OCR result-reference contract](../workflows/TEMPORAL_PAYLOAD_FOOTPRINT.md)
- [Environment ownership](ENVIRONMENT_CONFIGURATION.md)
