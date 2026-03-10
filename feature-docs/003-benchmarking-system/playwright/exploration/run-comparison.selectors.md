# Selectors for Run Comparison Page

## Primary Actions
EXPORT_CSV_BUTTON|[data-testid="export-csv-btn"]
EXPORT_JSON_BUTTON|[data-testid="export-json-btn"]
BACK_TO_PROJECT_BUTTON|[data-testid="back-to-project-btn"]

## Page Structure
COMPARISON_PAGE_CONTAINER|[data-testid="run-comparison-page"]
COMPARISON_TITLE|[data-testid="comparison-title"]
RUN_COUNT_TEXT|text=/Comparing \d+ runs?/

## Run Information
RUN_INFO_CARD|[data-testid="run-info-card"]
RUN_INFO_TABLE|[data-testid="run-info-table"]
RUN_HEADER_LINK|[data-testid^="run-header-link-"]
BASELINE_BADGE|[data-testid^="baseline-badge-"]
STATUS_BADGE|[data-testid="run-info-card"] badge

## Metrics Comparison
METRICS_COMPARISON_CARD|[data-testid="metrics-comparison-card"]
METRICS_COMPARISON_TABLE|[data-testid="metrics-comparison-table"]
METRICS_RUN_HEADER_LINK|[data-testid^="metrics-run-header-link-"]
METRICS_BASELINE_BADGE|[data-testid^="metrics-baseline-badge-"]
METRIC_ROW|[data-testid="metrics-comparison-table"] tbody tr
DELTA_POSITIVE|[data-testid="metrics-comparison-table"] code[color="green"]
DELTA_NEGATIVE|[data-testid="metrics-comparison-table"] code[color="red"]

## Parameters Comparison
PARAMETERS_COMPARISON_CARD|[data-testid="parameters-comparison-card"]
PARAMETERS_COMPARISON_TABLE|[data-testid="parameters-comparison-table"]
CHANGED_PARAMETER_BADGE|[data-testid="parameters-comparison-card"] badge:has-text("Changed")

## Tags Comparison
TAGS_COMPARISON_CARD|[data-testid="tags-comparison-card"]
TAGS_COMPARISON_TABLE|[data-testid="tags-comparison-table"]
CHANGED_TAG_BADGE|[data-testid="tags-comparison-card"] badge:has-text("Changed")

## Empty States
NO_RUNS_SELECTED_MESSAGE|text=No runs selected for comparison
NO_RUNS_FOUND_MESSAGE|text=No runs found
EMPTY_STATE_BACK_BUTTON|button:has-text("Back to Project")

## Loading State
LOADING_SPINNER|[role="progressbar"]
