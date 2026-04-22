The requirements document for this feature is available here: `feature-docs/010-classifier-deletion/REQUIREMENTS.md`.

All user story files are located in `feature-docs/010-classifier-deletion/user_stories/`.

Read both the requirements document and individual user story files for implementation details.

After implementing a user story, check it off at the bottom of this file.

## Phase 1: Shared Service & Backend API

| File | Title |
|---|---|
| `US-001-list-azure-classifiers-service.md` | List Azure DI classifiers service method |
| `US-002-delete-classifier-api-endpoint.md` | Delete classifier API endpoint |
| `US-003-workflow-usage-check-on-deletion.md` | Block deletion when referenced by workflow versions |

## Phase 2: Frontend UI

| File | Title |
|---|---|
| `US-004-delete-button-confirmation-ui.md` | Delete button and confirmation dialog in classifier details |
| `US-005-display-workflow-conflict-ui.md` | Display workflow conflict error on deletion |

## Phase 3: Automated Cleanup

| File | Title |
|---|---|
| `US-006-orphan-classifier-cleanup-cron.md` | Automated orphan classifier cleanup cron job |

## Acceptance Checklist
- [x] US-001-list-azure-classifiers-service.md
- [x] US-002-delete-classifier-api-endpoint.md
- [x] US-003-workflow-usage-check-on-deletion.md
- [x] US-004-delete-button-confirmation-ui.md
- [x] US-005-display-workflow-conflict-ui.md
- [ ] US-006-orphan-classifier-cleanup-cron.md
