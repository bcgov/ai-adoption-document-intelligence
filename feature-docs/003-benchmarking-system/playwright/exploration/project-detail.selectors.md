# Selectors for Project Detail Page

## Header Elements
PROJECT_NAME_TITLE|[data-testid="project-name-title"]
PROJECT_DESCRIPTION|[data-testid="project-description"]
MLFLOW_EXPERIMENT_ID|[data-testid="mlflow-experiment-id"]

## Definitions Section
DEFINITIONS_HEADING|[data-testid="definitions-heading"]
CREATE_DEFINITION_BTN|[data-testid="create-definition-btn"]
DEFINITIONS_TABLE|[data-testid="definitions-table"]
DEFINITION_ROW|[data-testid="definition-row-{definitionId}"]
NO_DEFINITIONS_MESSAGE|[data-testid="no-definitions-message"]
CREATE_FIRST_DEFINITION_BTN|[data-testid="create-first-definition-btn"]

## Runs Section
RUNS_HEADING|[data-testid="runs-heading"]
COMPARE_RUNS_BTN|[data-testid="compare-runs-btn"]
RUNS_TABLE|[data-testid="runs-table"]
RUN_ROW|[data-testid="run-row-{runId}"]
RUN_CHECKBOX|[data-testid="run-checkbox-{runId}"]
NO_RUNS_MESSAGE|[data-testid="no-runs-message"]

## Loading States
MAIN_LOADER|Center h={400} Loader
DEFINITIONS_LOADER|Center h={200} Loader
RUNS_LOADER|Center h={200} Loader
DEFINITION_DETAIL_LOADER|Center h={200} Loader

## Status Badges
STATUS_BADGE|Badge with getStatusColor(run.status)
REGRESSION_BADGE|Badge color="red" leftSection IconAlertTriangle

## Navigation Elements
RUN_DETAIL_LINK|Navigate to /benchmarking/projects/${projectId}/runs/${run.id}
COMPARE_LINK|Navigate to /benchmarking/projects/${projectId}/compare?runs=${runIdsParam}
