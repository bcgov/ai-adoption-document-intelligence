# Selectors for Run Detail Page

## Header Elements
RUN_DEFINITION_NAME|[data-testid="run-definition-name"]
BASELINE_BADGE_HEADER|[data-testid="baseline-badge"]
RUN_ID_TEXT|[data-testid="run-id-text"]

## Action Buttons
CANCEL_RUN_BTN|[data-testid="cancel-run-btn"]
PROMOTE_BASELINE_BTN|[data-testid="promote-baseline-btn"]
PROMOTE_BASELINE_TOOLTIP|[data-testid="promote-baseline-tooltip"]
EDIT_THRESHOLDS_BTN|[data-testid="edit-thresholds-btn"]
RERUN_BTN|[data-testid="rerun-btn"]
VIEW_REGRESSION_REPORT_BTN|[data-testid="view-regression-report-btn"]

## Alerts
RUN_ERROR_ALERT|[data-testid="run-error-alert"]
BASELINE_COMPARISON_ALERT|[data-testid="baseline-comparison-alert"]

## Run Information Section
RUN_INFO_HEADING|[data-testid="run-info-heading"]
RUN_INFO_TABLE|[data-testid="run-info-table"]
MLFLOW_LINK|Anchor href with mlflowUrl
TEMPORAL_LINK|Anchor href with temporalUrl

## Baseline Comparison Section
BASELINE_COMPARISON_HEADING|[data-testid="baseline-comparison-heading"]
BASELINE_COMPARISON_TABLE|[data-testid="baseline-comparison-table"]

## Aggregated Metrics Section
AGGREGATED_METRICS_HEADING|[data-testid="aggregated-metrics-heading"]
AGGREGATED_METRICS_TABLE|[data-testid="aggregated-metrics-table"]

## Parameters & Tags Section
PARAMS_TAGS_HEADING|[data-testid="params-tags-heading"]
PARAMS_TABLE|[data-testid="params-table"]
TAGS_TABLE|[data-testid="tags-table"]

## Artifacts Section
ARTIFACTS_HEADING|[data-testid="artifacts-heading"]
ARTIFACT_TYPE_FILTER|[data-testid="artifact-type-filter"]
ARTIFACTS_TABLE|[data-testid="artifacts-table"]
ARTIFACT_ROW|[data-testid="artifact-row-{artifactId}"]

## Drill-Down Summary Section
DRILL_DOWN_HEADING|[data-testid="drill-down-heading"]
VIEW_ALL_SAMPLES_BTN|[data-testid="view-all-samples-btn"]
WORST_SAMPLES_TABLE|[data-testid="worst-samples-table"]
FIELD_ERROR_BREAKDOWN_TABLE|[data-testid="field-error-breakdown-table"]
ERROR_CLUSTERS_TABLE|[data-testid="error-clusters-table"]

## Loading States
MAIN_LOADER|Center h={400} Loader

## Status Badges
STATUS_BADGE|Badge with getStatusColor(run.status)
BASELINE_BADGE|Badge color="green" or "gray" for Is Baseline
PASS_FAIL_BADGE|Badge color="green" (PASS) or "red" (FAIL)

## Dynamic Elements
REGRESSED_METRIC_BADGE|Badge color="red" in baseline comparison alert
ARTIFACT_TYPE_BADGE|Badge in artifacts table
ERROR_CLUSTER_COUNT_BADGE|Badge in error clusters table
