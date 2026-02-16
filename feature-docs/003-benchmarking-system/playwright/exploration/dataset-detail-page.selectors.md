# Selectors for Dataset Detail Page

## Header Actions
DATASET_NAME|[data-testid="dataset-name-title"]
DATASET_DESCRIPTION|[data-testid="dataset-description"]
UPLOAD_FILES_BTN|[data-testid="upload-files-btn"]

## Navigation Tabs
VERSIONS_TAB|[data-testid="versions-tab"]
SAMPLE_PREVIEW_TAB|[data-testid="sample-preview-tab"]
SPLITS_TAB|[data-testid="splits-tab"]

## Version Table Elements
VERSIONS_TABLE|[data-testid="versions-table"]
VERSION_ROW|[data-testid="version-row-{versionId}"]
VERSION_STATUS_BADGE|[data-testid="version-status-badge-{versionId}"]
VERSION_ACTIONS_BTN|[data-testid="version-actions-btn-{versionId}"]

## Version Actions Menu
VIEW_SAMPLES_MENU_ITEM|[data-testid="view-samples-menu-item-{versionId}"]
VALIDATE_MENU_ITEM|[data-testid="validate-menu-item-{versionId}"]
PUBLISH_MENU_ITEM|[data-testid="publish-menu-item-{versionId}"]
ARCHIVE_MENU_ITEM|[data-testid="archive-menu-item-{versionId}"]

## Sample Preview Elements
SAMPLES_TABLE|[data-testid="samples-table"]
SAMPLE_ROW|[data-testid="sample-row-{sampleId}"]
VIEW_GROUND_TRUTH_BTN|[data-testid="view-ground-truth-btn-{sampleId}"]
SAMPLES_PAGINATION|[data-testid="samples-pagination"]

## Empty States
NO_VERSIONS_MESSAGE|[data-testid="no-versions-message"]
NO_SAMPLES_MESSAGE|[data-testid="no-samples-message"]

## File Upload Dialog
UPLOAD_FILES_DIALOG|[data-testid="upload-files-dialog"]
FILE_DROPZONE|[data-testid="file-dropzone"]
SELECTED_FILES_LIST|[data-testid="selected-files-list"]
FILE_ITEM|[data-testid="file-item-{index}"]
REMOVE_FILE_BTN|[data-testid="remove-file-btn-{index}"]
UPLOAD_PROGRESS|[data-testid="upload-progress"]
UPLOAD_SUCCESS_MESSAGE|[data-testid="upload-success-message"]
UPLOAD_CANCEL_BTN|[data-testid="upload-cancel-btn"]
UPLOAD_SUBMIT_BTN|[data-testid="upload-submit-btn"]

## Ground Truth Viewer
GROUND_TRUTH_VIEWER|[data-testid="ground-truth-viewer"]
GROUND_TRUTH_JSON|[data-testid="ground-truth-json"]

## Validation Report - Overall Status
VALIDATION_STATUS_CARD|[data-testid="validation-status-card"]
VALIDATION_RESULT_TITLE|[data-testid="validation-result-title"]
VALIDATION_SAMPLE_INFO|[data-testid="validation-sample-info"]
VALIDATION_STATUS_BADGE|[data-testid="validation-status-badge"]

## Validation Report - Issue Summary
VALIDATION_ISSUE_SUMMARY_CARD|[data-testid="validation-issue-summary-card"]
ISSUE_SUMMARY_TITLE|[data-testid="issue-summary-title"]
ISSUE_SUMMARY_TABLE|[data-testid="issue-summary-table"]
SCHEMA_VIOLATIONS_ROW|[data-testid="schema-violations-row"]
SCHEMA_VIOLATIONS_COUNT|[data-testid="schema-violations-count"]
MISSING_GROUND_TRUTH_ROW|[data-testid="missing-ground-truth-row"]
MISSING_GROUND_TRUTH_COUNT|[data-testid="missing-ground-truth-count"]
DUPLICATES_ROW|[data-testid="duplicates-row"]
DUPLICATES_COUNT|[data-testid="duplicates-count"]
CORRUPTION_ROW|[data-testid="corruption-row"]
CORRUPTION_COUNT|[data-testid="corruption-count"]
TOTAL_ISSUES_ROW|[data-testid="total-issues-row"]
TOTAL_ISSUES_COUNT|[data-testid="total-issues-count"]

## Validation Report - Detailed Issues
VALIDATION_DETAILED_ISSUES_CARD|[data-testid="validation-detailed-issues-card"]
DETAILED_ISSUES_TITLE|[data-testid="detailed-issues-title"]
ISSUES_LIST|[data-testid="issues-list"]
ISSUE_CARD|[data-testid="issue-card-{index}"]
ISSUE_SAMPLE_ID|[data-testid="issue-sample-id-{index}"]
ISSUE_CATEGORY|[data-testid="issue-category-{index}"]
ISSUE_SEVERITY|[data-testid="issue-severity-{index}"]
ISSUE_MESSAGE|[data-testid="issue-message-{index}"]
ISSUE_FILE_PATH|[data-testid="issue-file-path-{index}"]
ISSUE_DETAILS|[data-testid="issue-details-{index}"]
