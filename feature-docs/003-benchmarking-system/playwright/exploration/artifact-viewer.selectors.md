# Selectors for Artifact Viewer

## Container
ARTIFACT_VIEWER_DRAWER|Drawer (no specific selector - identified by opened state)

## Header
ARTIFACT_TITLE|text="Artifact Viewer"
ARTIFACT_PATH|Code (first Code component in header Stack)

## Metadata Card
METADATA_CARD|Card:has(Text:has-text("Type:"))
TYPE_LABEL|Text:has-text("Type:")
TYPE_VALUE|Code (first Code after Type label)
MIME_TYPE_LABEL|Text:has-text("MIME Type:")
MIME_TYPE_VALUE|Code (second Code in metadata card)
SAMPLE_ID_LABEL|Text:has-text("Sample ID:")
SAMPLE_ID_VALUE|Code (after Sample ID label)
NODE_ID_LABEL|Text:has-text("Node ID:")
NODE_ID_VALUE|Code (after Node ID label)

## Action Buttons
DOWNLOAD_BUTTON|Button:has([data-icon="download"])
MLFLOW_BUTTON|Button:has([data-icon="external-link"])

## Content Viewers
CONTENT_CARD|Card:has-text("") (second Card in Stack)
LOADING_SPINNER|Loader
ERROR_ALERT|Alert:has-text("Error Loading Artifact")
IMAGE_VIEWER|img (when imageUrl is set)
JSON_VIEWER|JsonInput[readonly]
TEXT_VIEWER|Textarea[readonly]
PDF_NOT_IMPLEMENTED_ALERT|Alert:has-text("PDF viewing is not yet implemented")
UNSUPPORTED_ALERT|Alert:has-text("Preview Not Available")

## Notes on Selectors

### Critical Missing test-ids
The component lacks `data-testid` attributes entirely. Current selectors rely on:
- Text content (fragile, breaks with i18n)
- CSS structure (fragile, breaks with refactoring)
- Icon names (fragile, breaks with icon library changes)
- Component types (not ideal for E2E tests)

### Recommended test-ids to add:
- `artifact-viewer-drawer`
- `artifact-path-display`
- `artifact-type-value`
- `artifact-mime-type-value`
- `artifact-sample-id-value`
- `artifact-node-id-value`
- `download-artifact-btn`
- `open-mlflow-btn`
- `artifact-content-card`
- `artifact-loading-spinner`
- `artifact-error-alert`
- `artifact-image-viewer`
- `artifact-json-viewer`
- `artifact-text-viewer`
- `artifact-pdf-alert`
- `artifact-unsupported-alert`

### State-Based Selectors
The viewer content changes based on detected MIME type:
- Images: Drawer:has(img)
- JSON: Drawer:has(JsonInput)
- Text: Drawer:has(Textarea)
- PDF: Drawer:has(Alert:has-text("PDF viewing"))
- Unsupported: Drawer:has(Alert:has-text("Preview Not Available"))

### Conditional Elements
- **Sample ID / Node ID**: Only visible when artifact has these fields
- **MLflow Button**: Only visible when mlflowExperimentId and mlflowRunId are provided
- **Content Viewers**: Mutually exclusive - only one type shown at a time

### Testing Strategy Without test-ids
Since selectors are fragile without test-ids, tests should:
1. Use role-based selectors where possible: `getByRole('button', { name: /download/i })`
2. Use accessible labels and aria attributes
3. Verify content changes by checking for specific elements (img, JsonInput, Textarea)
4. Use data-icon attributes for icon buttons (more stable than text)

### Priority for Adding test-ids
**High Priority**:
- Action buttons (download, MLflow link)
- Content viewers (image, JSON, text)
- Error/loading states

**Medium Priority**:
- Metadata fields
- Alerts for unsupported types

**Low Priority**:
- Drawer container (can use role="dialog")
- Static labels
