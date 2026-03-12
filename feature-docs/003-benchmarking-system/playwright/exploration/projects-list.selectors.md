# Selectors for Projects List Page

## Header & Actions
PROJECTS_HEADER|[data-testid="projects-header"]
PAGE_TITLE|role=heading[level=2] >> text=Benchmark Projects
CREATE_PROJECT_BTN|[data-testid="create-project-btn"]

## Empty State
EMPTY_STATE_CONTAINER|[data-testid="projects-empty-state"]
EMPTY_STATE_TITLE|text=No projects yet
EMPTY_STATE_DESCRIPTION|text=Create your first benchmark project to get started
CREATE_PROJECT_EMPTY_BTN|[data-testid="create-project-empty-btn"]

## Projects Table
PROJECTS_TABLE|[data-testid="projects-table"]
PROJECT_ROW|[data-testid^="project-row-"]
PROJECT_ROW_BY_ID|[data-testid="project-row-{id}"]

## Table Columns (when table has data)
PROJECT_NAME_COLUMN|th >> text=Name
PROJECT_DESCRIPTION_COLUMN|th >> text=Description
DEFINITIONS_COUNT_COLUMN|th >> text=Definitions
RUNS_COUNT_COLUMN|th >> text=Runs
CREATED_DATE_COLUMN|th >> text=Created Date

## Loading State
LOADING_SPINNER|role=generic >> role=generic[name="Loader"]
