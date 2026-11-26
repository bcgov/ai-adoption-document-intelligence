# Mistral Document AI on Azure AI Hub (E02)

The E02 template and the standard Mistral workflow use the same
`mistralOcr.process` activity and AI Hub transport. See
[Mistral OCR](MISTRAL_OCR.md) for configuration, model selection, annotation
and output mapping. Existing workflow `variant` parameters do not select a
different transport.

The activity posts to `{MISTRAL_DOC_AI_AZURE_ENDPOINT}/providers/mistral/azure/ocr`
using the tenant key in both the `api-key` and authorization headers. The
Foundry request excludes `confidence_scores_granularity`, which the endpoint
rejects. It supports schema-based annotation and the configured OCR 3 options.

The response mapper uses bounding boxes when provided and otherwise leaves
polygons empty. `MOCK_MISTRAL_AZURE_OCR=true` returns a synthetic response with
bounding boxes without a network call.

The E02 graph is
[`experiment-02-mistral-doc-ai-azure-workflow.json`](../../packages/graph-workflow/templates/experiment-02-mistral-doc-ai-azure-workflow.json);
it uses `file.prepare`, `mistralOcr.process` and the shared downstream OCR
activities. `usage_info.pages_processed` is returned by the service; inference
and annotation are billable.
