# Page: Baseline Threshold Dialog
**Trigger**: Click "Promote to Baseline" button (for non-baseline runs) or "Edit Thresholds" button (for baseline runs) on Run Detail Page
**Purpose**: Configure or edit metric thresholds for baseline runs used in regression detection

## Key Elements

### Dialog Header
- **Dialog Title**:
  - "Configure Baseline Thresholds" (when promoting)
  - "Edit Baseline Thresholds" (when editing)
- **Close Button**: `[data-testid="baseline-threshold-dialog"] button[aria-label="Close"]` - Closes dialog

### Warning Alert (Conditional)
- **Existing Baseline Warning**: `[data-testid="existing-baseline-warning"]` - Only shown when promoting (not when editing)
- Appears if definition already has a baseline
- Shows message: "Existing baseline will be demoted"
- Lists the current baseline definition name

### Instructions
- **Description Text**: Explains that thresholds will be used for future run comparisons
  - When promoting: "Set threshold limits for each metric. Future runs will be compared against these thresholds to detect regressions."
  - When editing: "Update threshold limits for each metric. Future runs will be compared against these thresholds to detect regressions."
- Static text, no interaction

### Threshold Configuration Fields
For each metric in the run:

- **Metric Name Label**: Shows metric name and current value (e.g., "field_accuracy (current: 0.9600)")
- **Threshold Type Dropdown**: `[data-testid="threshold-type-{metricName}"]`
  - Options: "Relative (%)" or "Absolute"
  - Default: "Relative (%)"
- **Threshold Value Input**: `[data-testid="threshold-value-{metricName}"]`
  - Type: number
  - Default: 0.95 for relative
  - Validation: 0-1 for relative, non-negative for absolute
- **Help Text**: Displays below input, shows interpretation (e.g., "Must not drop below 95% of baseline")

### Action Buttons
- **Cancel Button**: `[data-testid="cancel-threshold-btn"]` - Closes dialog without saving
- **Submit Button**: `[data-testid="submit-threshold-btn"]`
  - Text: "Promote to Baseline" (when promoting) or "Update Thresholds" (when editing)
  - Shows loading state during submission
  - Disabled during submission

## State Behaviors

### Initial State
- All metrics from the run are listed
- **When promoting**: Each metric defaults to Relative type with 0.95 value (95% of baseline)
- **When editing**: Each metric shows existing threshold configuration from baseline run
- Submit button is enabled

### Validation States
- **Invalid Relative Threshold**: Shows error if value < 0 or > 1
  - Error message: "Relative threshold must be between 0 and 1"
- **Invalid Absolute Threshold**: Shows error if value < 0
  - Error message: "Absolute threshold must be non-negative"
- **Invalid Number**: Shows error if value is NaN
  - Error message: "Must be a valid number"
- Submit button remains enabled, validation occurs on submit attempt

### Submission States
- **Submitting**: Submit button shows loading spinner, Cancel button disabled
- **Success**: Dialog closes automatically, run detail page refreshes
- **Error**: Dialog remains open with error message (handled by API layer)

### Interaction States
- **Type Change**: Switching between Relative/Absolute updates help text and validation rules
- **Value Change**: Clearing an error for that metric when user types

## Validation Logic

### Relative Thresholds (0.95 = 95%)
- Value must be between 0 and 1
- Interpreted as: "Must not drop below {value * 100}% of baseline"
- Example: 0.95 means new run metric must be >= baseline * 0.95

### Absolute Thresholds
- Value must be non-negative
- Interpreted as: "Must not drop below {value}"
- Example: 0.9 means new run metric must be >= 0.9

## Navigation Flows

### Opening - Promote Mode
- **From**: Run Detail Page (completed, non-baseline run)
- **Trigger**: Click "Promote to Baseline" button
- **Result**: Dialog opens with default threshold configuration (95% relative for all metrics)

### Opening - Edit Mode
- **From**: Run Detail Page (baseline run with existing thresholds)
- **Trigger**: Click "Edit Thresholds" button
- **Result**: Dialog opens with existing threshold configuration pre-filled

### Closing
- **Cancel**: Click Cancel button or X icon → Dialog closes, no changes
- **Submit Success**: Thresholds validated and saved → Dialog closes, page refreshes to show updated baseline
- **Submit Error**: Shows error message, dialog remains open for retry

## API Integration
- **POST /api/benchmark/projects/:projectId/runs/:runId/baseline**
  - Used for both promoting and editing thresholds
  - Request body: `{ thresholds: MetricThreshold[] }`
  - Response: `{ runId, isBaseline, previousBaselineId, thresholds }`
  - On success: Invalidates run detail queries, dialog closes
  - On error: Shows error notification, dialog stays open

## Notes
- All metrics from the run are included in threshold configuration
- Thresholds are stored with the baseline run and used for all future comparisons
- **When promoting**: Previous baseline is automatically demoted
- **When editing**: Same baseline remains, only thresholds are updated
- Dialog behavior:
  - Promoting mode: Pre-fills conservative defaults (95% relative) for all metrics
  - Editing mode: Pre-fills existing threshold values from baseline run
- Users can configure different threshold types per metric (some relative, some absolute)
- Validation happens on submit, not on input change
- Help text updates dynamically based on threshold type and value
- Dialog resets to initial state when opened/closed to prevent stale data
