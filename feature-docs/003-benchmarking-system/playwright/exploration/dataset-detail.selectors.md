# Selectors for Dataset Detail Page

## Header
PAGE_TITLE|[data-testid="dataset-name-title"]
PAGE_DESCRIPTION|[data-testid="dataset-description"]
UPLOAD_FILES_BTN|[data-testid="upload-files-btn"]

## Tabs
VERSIONS_TAB|[data-testid="versions-tab"]
SAMPLE_PREVIEW_TAB|[data-testid="sample-preview-tab"]
SPLITS_TAB|[data-testid="splits-tab"]

## Versions Table
VERSIONS_TABLE|[data-testid="versions-table"]
VERSION_ROW|[data-testid="version-row-{versionId}"]
VERSION_ACTIONS_BTN|[data-testid="version-actions-btn-{versionId}"]

## Versions Empty State
NO_VERSIONS_MESSAGE|[data-testid="no-versions-message"]

## Samples Table
SAMPLES_TABLE|[data-testid="samples-table"]
SAMPLE_ROW|[data-testid="sample-row-{sampleId}"]
VIEW_GROUND_TRUTH_BTN|[data-testid="view-ground-truth-btn-{sampleId}"]
SAMPLES_PAGINATION|[data-testid="samples-pagination"]

## Samples Empty State
NO_SAMPLES_MESSAGE|[data-testid="no-samples-message"]

## Version Status Badges (via role)
DRAFT_BADGE|role=text >> text=draft
PUBLISHED_BADGE|role=text >> text=published
ARCHIVED_BADGE|role=text >> text=archived

## Actions Menu Items (via text)
VIEW_SAMPLES_MENU_ITEM|role=menuitem >> text=View Samples
VALIDATE_MENU_ITEM|role=menuitem >> text=Validate
PUBLISH_MENU_ITEM|role=menuitem >> text=Publish
ARCHIVE_MENU_ITEM|role=menuitem >> text=Archive

## Table Headers (via role and text)
VERSION_HEADER|role=columnheader >> text=Version
STATUS_HEADER|role=columnheader >> text=Status
DOCUMENTS_HEADER|role=columnheader >> text=Documents
GIT_REVISION_HEADER|role=columnheader >> text=Git Revision
PUBLISHED_HEADER|role=columnheader >> text=Published
CREATED_HEADER|role=columnheader >> text=Created
ACTIONS_HEADER|role=columnheader >> text=Actions
