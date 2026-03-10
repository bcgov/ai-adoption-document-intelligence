# Selectors for Create Definition Form

## Dialog
DIALOG_TITLE|heading[level=2]:has-text("Create Benchmark Definition")
DIALOG_CLOSE_BTN|button >> img

## Form Fields - Required
NAME_INPUT|[data-testid="definition-name-input"]
DATASET_VERSION_SELECT|[data-testid="dataset-version-select"]
SPLIT_SELECT|[data-testid="split-select"]
WORKFLOW_SELECT|[data-testid="workflow-select"]
EVALUATOR_TYPE_SELECT|[data-testid="evaluator-type-select"]

## Form Fields - Optional
EVALUATOR_CONFIG_TEXTAREA|[data-testid="evaluator-config-textarea"]

## Runtime Settings
MAX_PARALLEL_DOCS_INPUT|[data-testid="max-parallel-documents-input"]
PER_DOC_TIMEOUT_INPUT|[data-testid="per-document-timeout-input"]
PRODUCTION_QUEUE_RADIO|[data-testid="production-queue-radio"]
PRODUCTION_QUEUE_NO|[data-testid="production-queue-no"]
PRODUCTION_QUEUE_YES|[data-testid="production-queue-yes"]

## Artifact Policy
ARTIFACT_POLICY_RADIO|[data-testid="artifact-policy-radio"]
ARTIFACT_POLICY_FULL|[data-testid="artifact-policy-full"]
ARTIFACT_POLICY_FAILURES|[data-testid="artifact-policy-failures"]
ARTIFACT_POLICY_SAMPLED|[data-testid="artifact-policy-sampled"]

## Action Buttons
CANCEL_BTN|[data-testid="cancel-definition-btn"]
CREATE_BTN|[data-testid="submit-definition-btn"]

## Validation Messages
NAME_ERROR|text="Name is required"
JSON_ERROR|text="Invalid JSON"
