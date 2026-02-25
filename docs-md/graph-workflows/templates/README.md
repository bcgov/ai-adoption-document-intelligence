# Graph Workflow Templates

This folder holds example [graph workflow](../DAG_WORKFLOW_ENGINE.md) configuration files. Each JSON file is a valid `GraphWorkflowConfig` that can be used as a starting point or reference.

| File | Description |
|------|-------------|
| `standard-ocr-workflow.json` | Standard OCR processing: file prepare → Azure OCR submit/poll → result cleaning and confidence checks. Equivalent to the legacy single-document OCR workflow. |
| `multi-page-report-workflow.json` | Multi-page report: initial full-document OCR, keyword-based split/classify, type-specific child workflows per segment, and field validation. Demonstrates map/join and switch patterns. |

These templates are validated by the graph schema validator tests in `apps/backend-services`.
