# Selectors for Regression Report Page

## Primary Actions
EXPORT_JSON_BUTTON|[data-testid="export-json-btn"]
EXPORT_HTML_BUTTON|[data-testid="export-html-btn"]
BACK_TO_RUN_BUTTON|[data-testid="back-to-run-btn"]

## Page Header
PAGE_TITLE|heading:has-text("Regression Report")
DEFINITION_NAME|paragraph

## Alerts & Status
REGRESSION_ALERT|[data-testid="regression-alert"]
REGRESSED_METRIC_BADGE|[data-testid="regressed-metric-badge"]

## Run Information
RUN_INFO_TABLE|[data-testid="run-info-table"]
RUN_ID_CELL|table >> text=Run ID
BASELINE_RUN_ID_CELL|table >> text=Baseline Run ID
COMPLETED_AT_CELL|table >> text=Completed At
MLFLOW_LINK|[data-testid="mlflow-link"]

## Metric Analysis
METRIC_COMPARISON_TABLE|[data-testid="metric-comparison-table"]
METRIC_ROW|[data-testid="metric-row"]
METRIC_NAME_CELL|[data-testid="metric-row"] >> nth=0
CURRENT_VALUE_CELL|code
BASELINE_VALUE_CELL|code
DELTA_CELL|code
DELTA_PERCENT_CELL|code
THRESHOLD_CELL|paragraph
SEVERITY_BADGE|generic:has-text("Critical"), generic:has-text("Warning")
STATUS_BADGE|generic:has-text("PASS"), generic:has-text("FAIL")

## Historical Trend
HISTORICAL_TREND_SECTION|[data-testid="historical-trend-section"]
TREND_PLACEHOLDER_ALERT|alert:has-text("Historical trend visualization")

## Loading States
LOADING_SPINNER|loader
NOT_FOUND_MESSAGE|text=Run not found
NO_BASELINE_MESSAGE|text=No baseline comparison data available

## Conditional Elements
SUCCESS_ALERT|alert:has-text("All Metrics Passed")
REGRESSION_ALERT_TITLE|generic:has-text("Regression Detected")
