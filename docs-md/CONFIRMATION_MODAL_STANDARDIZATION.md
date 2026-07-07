# Confirmation Modal Standardization

## Summary
- Introduced a shared confirmation modal component for destructive and high-impact actions.
- Standardized confirmation dialog structure and button layout to align with BCDS patterns used in the app shell:
  - Clear action title
  - Short, explicit impact message
  - Secondary `Cancel` action on the left, primary destructive action on the right
  - Consistent spacing and modal structure via shared UI adapter

## New Shared Component
- `apps/frontend/src/ui/ConfirmActionModal.tsx`
- Exported through `apps/frontend/src/ui/index.tsx`

## Migrated Flows
- Template model detail page:
  - Remove document confirmation
  - Delete field confirmation
  - `apps/frontend/src/features/annotation/template-models/pages/ModelDetailPage.tsx`
- Settings page:
  - Delete API key confirmation
  - `apps/frontend/src/pages/SettingsPage.tsx`
- Confusion profiles panel:
  - Delete confusion profile confirmation
  - `apps/frontend/src/features/benchmarking/components/ConfusionProfilesPanel.tsx`
- Groups page:
  - Leave group confirmation
  - Cancel membership request confirmation
  - Approve membership request confirmation
  - `apps/frontend/src/pages/GroupsPage.tsx`
- Group detail page:
  - Delete group confirmation
  - Leave group confirmation
  - `apps/frontend/src/pages/GroupDetailPage.tsx`
- Workflow list page:
  - Delete workflow confirmation
  - `apps/frontend/src/pages/WorkflowListPage.tsx`
- Documents page:
  - Delete document confirmation
  - `apps/frontend/src/pages/DocumentsPage.tsx`

## Validation
- `npm run -w apps/frontend type-check` passed.
- `npm run -w apps/frontend lint` passed with only existing warning-level `!important` style notices in app CSS files.
