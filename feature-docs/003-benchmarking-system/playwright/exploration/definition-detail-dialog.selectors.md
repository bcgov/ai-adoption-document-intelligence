# Selectors for Definition Detail Dialog

## Dialog
DIALOG_TITLE|heading[level=2]:has-text("Definition Details")
DIALOG_CLOSE_BTN|button >> img

## Header
DEFINITION_NAME|[data-testid="definition-name-title"]
START_RUN_BTN|[data-testid="start-run-btn"]
IMMUTABLE_BADGE|[data-testid="immutable-badge"]
REVISION_BADGE|[data-testid="revision-badge"]

## Configuration Table
CONFIG_TABLE|[data-testid="definition-info-table"]
DATASET_VERSION_ROW|row:has-text("Dataset Version")
SPLIT_ROW|row:has-text("Split")
WORKFLOW_ROW|row:has-text("Workflow")
WORKFLOW_HASH_ROW|row:has-text("Workflow Config Hash")
EVALUATOR_TYPE_ROW|row:has-text("Evaluator Type")
CONFIG_HASH_CODE|code

## Configuration Sections
EVALUATOR_CONFIG_HEADING|[data-testid="evaluator-config-heading"]
EVALUATOR_CONFIG_JSON|[data-testid="evaluator-config-json"]
RUNTIME_SETTINGS_HEADING|[data-testid="runtime-settings-heading"]
RUNTIME_SETTINGS_JSON|[data-testid="runtime-settings-json"]
ARTIFACT_POLICY_HEADING|[data-testid="artifact-policy-heading"]
ARTIFACT_POLICY_JSON|[data-testid="artifact-policy-json"]

## Schedule Section
SCHEDULE_HEADING|[data-testid="schedule-config-heading"]
SCHEDULE_TOGGLE|switch
SCHEDULE_TOGGLE_LABEL|text="Enable automatic scheduled runs"
SAVE_SCHEDULE_BTN|button:has-text("Save Schedule")

## Run History
RUN_HISTORY_HEADING|[data-testid="run-history-heading"]
RUN_HISTORY_TABLE|[data-testid="run-history-table"]
RUN_HISTORY_ROW|[data-testid^="run-history-row-"]
MLFLOW_RUN_ID|code
STATUS_BADGE|[data-testid^="run-status-badge-"]
STATUS_BADGE_RUNNING|generic:has-text("running")
STATUS_BADGE_FAILED|generic:has-text("failed")
STATUS_BADGE_COMPLETED|generic:has-text("completed")
