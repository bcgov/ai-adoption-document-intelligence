# Selectors for Project Detail Page

## Header
PROJECT_TITLE|heading[level=2]
PROJECT_DESCRIPTION|paragraph
MLFLOW_EXPERIMENT_ID|paragraph

## Definitions Section
DEFINITIONS_HEADING|heading[level=3]:has-text("Benchmark Definitions")
CREATE_DEFINITION_BTN|[data-testid="create-definition-btn"]
DEFINITIONS_TABLE|table
DEFINITION_ROW|[data-testid^="definition-row-"]
STATUS_BADGE|generic:has-text("Mutable"),generic:has-text("Immutable")

## Recent Runs Section
RUNS_HEADING|heading[level=3]:has-text("Recent Runs")
RUNS_TABLE|table
RUN_SELECT_CHECKBOX|checkbox
STATUS_BADGE_RUNNING|generic:has-text("running")
STATUS_BADGE_FAILED|generic:has-text("failed")
STATUS_BADGE_COMPLETED|generic:has-text("completed")
