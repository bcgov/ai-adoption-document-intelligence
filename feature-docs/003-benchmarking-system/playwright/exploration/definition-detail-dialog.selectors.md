# Selectors for Definition Detail Dialog

## Dialog
DIALOG_TITLE|heading[level=2]:has-text("Definition Details")
DIALOG_CLOSE_BTN|button >> img

## Header
DEFINITION_NAME|heading[level=3]
START_RUN_BTN|button:has-text("Start Run")
REVISION_BADGE|generic:has-text("Revision")

## Configuration Table
CONFIG_TABLE|table
DATASET_VERSION_ROW|row:has-text("Dataset Version")
SPLIT_ROW|row:has-text("Split")
WORKFLOW_ROW|row:has-text("Workflow")
WORKFLOW_HASH_ROW|row:has-text("Workflow Config Hash")
EVALUATOR_TYPE_ROW|row:has-text("Evaluator Type")
CONFIG_HASH_CODE|code

## Configuration Sections
EVALUATOR_CONFIG_HEADING|heading[level=4]:has-text("Evaluator Configuration")
EVALUATOR_CONFIG_JSON|generic >> nth=0
RUNTIME_SETTINGS_HEADING|heading[level=4]:has-text("Runtime Settings")
RUNTIME_SETTINGS_JSON|generic >> nth=1
ARTIFACT_POLICY_HEADING|heading[level=4]:has-text("Artifact Policy")
ARTIFACT_POLICY_JSON|generic >> nth=2

## Schedule Section
SCHEDULE_HEADING|heading[level=4]:has-text("Schedule Configuration")
SCHEDULE_TOGGLE|switch
SCHEDULE_TOGGLE_LABEL|text="Enable automatic scheduled runs"
SAVE_SCHEDULE_BTN|button:has-text("Save Schedule")

## Run History
RUN_HISTORY_HEADING|heading[level=4]:has-text("Run History")
RUN_HISTORY_TABLE|table
MLFLOW_RUN_ID|code
STATUS_BADGE_RUNNING|generic:has-text("running")
STATUS_BADGE_FAILED|generic:has-text("failed")
STATUS_BADGE_COMPLETED|generic:has-text("completed")
