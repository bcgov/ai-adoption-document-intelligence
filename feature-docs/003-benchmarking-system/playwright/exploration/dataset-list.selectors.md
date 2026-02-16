# Selectors for Dataset List Page

## Navigation
BENCHMARKING_NAV|[data-testid="benchmarking-nav"]
DATASETS_NAV_LINK|[data-testid="datasets-nav-link"]

## Page Header
DATASETS_HEADER|[data-testid="datasets-header"]
PAGE_TITLE|heading:has-text("Datasets")
CREATE_DATASET_BTN|[data-testid="create-dataset-btn"]

## Empty State
EMPTY_STATE|[data-testid="datasets-empty-state"]
EMPTY_MESSAGE|text=No datasets yet
EMPTY_CREATE_BTN|[data-testid="create-dataset-empty-btn"]

## Datasets Table
DATASETS_TABLE|[data-testid="datasets-table"]
DATASET_ROW|[data-testid^="dataset-row-"]
DATASET_ROW_BY_ID|[data-testid="dataset-row-${id}"]

## Create Dataset Dialog
CREATE_DIALOG|[data-testid="create-dataset-dialog"]
DIALOG_TITLE|heading:has-text("Create New Dataset")
DIALOG_CLOSE_BTN|button[aria-label="Close"]

## Dialog Form Fields
DATASET_NAME_INPUT|[data-testid="dataset-name-input"]
DATASET_DESCRIPTION_INPUT|[data-testid="dataset-description-input"]
DATASET_REPOSITORY_URL_INPUT|[data-testid="dataset-repository-url-input"]

## Metadata Section
METADATA_SECTION|[data-testid="dataset-metadata-section"]
METADATA_KEY_INPUT|[data-testid="metadata-key-input"]
METADATA_VALUE_INPUT|[data-testid="metadata-value-input"]
ADD_METADATA_BTN|[data-testid="add-metadata-btn"]
METADATA_ITEM|[data-testid^="metadata-item-"]
METADATA_ITEM_BY_KEY|[data-testid="metadata-item-${key}"]
REMOVE_METADATA_BTN|[data-testid^="remove-metadata-"]
REMOVE_METADATA_BY_KEY|[data-testid="remove-metadata-${key}-btn"]

## Dialog Actions
CANCEL_DATASET_BTN|[data-testid="cancel-dataset-btn"]
SUBMIT_DATASET_BTN|[data-testid="submit-dataset-btn"]

## Error Messages
NAME_ERROR|text=Dataset name is required
REPOSITORY_URL_ERROR|text=Repository URL is required

## Loading State
LOADING_SPINNER|[role="status"]
