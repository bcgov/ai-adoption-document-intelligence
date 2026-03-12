# Selectors for Datasets List Page

## Header & Actions
DATASETS_HEADER|[data-testid="datasets-header"]
PAGE_TITLE|role=heading[level=2] >> text=Datasets
CREATE_DATASET_BTN|[data-testid="create-dataset-btn"]

## Empty State
EMPTY_STATE_CONTAINER|[data-testid="datasets-empty-state"]
EMPTY_STATE_TITLE|text=No datasets yet
EMPTY_STATE_DESCRIPTION|text=Create your first benchmark dataset to get started
CREATE_DATASET_EMPTY_BTN|[data-testid="create-dataset-empty-btn"]

## Datasets Table
DATASETS_TABLE|[data-testid="datasets-table"]
DATASET_ROW|[data-testid^="dataset-row-"]
DATASET_ROW_BY_ID|[data-testid="dataset-row-{id}"]

## Table Columns (when table has data)
DATASET_NAME_COLUMN|th >> text=Name
DATASET_DESCRIPTION_COLUMN|th >> text=Description
VERSION_COUNT_COLUMN|th >> text=Version Count
CREATED_DATE_COLUMN|th >> text=Created Date

## Loading State
LOADING_SPINNER|role=generic >> role=generic[name="Loader"]
