# Selectors for Run Drill-Down Page

## Primary Actions
BACK_TO_RUN_DETAILS|[data-testid="back-to-run-details-btn"]
CLEAR_ALL_FILTERS|[data-testid="clear-all-filters-btn"]
VIEW_SAMPLE_BUTTON|[data-testid^="view-sample-"]

## Filter Controls
FILTER_CUSTOMFIELD|[data-testid="filter-customField"]
FILTER_DOCTYPE|[data-testid="filter-docType"]
FILTER_LANGUAGE|[data-testid="filter-language"]
FILTER_PAGECOUNT|[data-testid="filter-pageCount"]
FILTER_SOURCE|[data-testid="filter-source"]
ACTIVE_FILTER_COUNT|[data-testid="active-filter-count"]

## Results Display
SAMPLE_COUNT_TEXT|[data-testid="sample-count"]
SAMPLES_TABLE|[data-testid="samples-table"]
TOP_PAGINATION|[data-testid="top-pagination"]
BOTTOM_PAGINATION|[data-testid="bottom-pagination"]

## Sample Detail Drawer
SAMPLE_DETAIL_DRAWER|[data-testid="sample-detail-drawer"]
DRAWER_CLOSE_BUTTON|button[aria-label="Close"]

## State Elements
EMPTY_RESULTS_ALERT|[data-testid="empty-results-alert"]
LOADING_SPINNER|.mantine-Loader-root
ERROR_ALERT|[role="alert"]

## Dynamic Selectors
VIEW_SAMPLE_BY_ID|[data-testid="view-sample-{sampleId}"]
FILTER_BY_DIMENSION|[data-testid="filter-{dimensionName}"]
