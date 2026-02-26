# Group-Based Resource Authorization — User Stories

The requirements document for this feature is available at: `feature-docs/004-group-resource-authorization/REQUIREMENTS.md`

All user story files are located in `feature-docs/004-group-resource-authorization/user_stories/`.

Read both the requirements document and individual user story files for implementation details.

After implementing a user story, check it off in the Acceptance Checklist at the bottom of this file.

---

## Phase 1: Schema Changes (US-001 – US-005)

Add `group_id` foreign keys to all top-level resource tables. Must be completed before any enforcement work.

| File | Title |
|---|---|
| `US-001-add-group-id-to-document.md` | Add group_id to Document |
| `US-002-add-group-id-to-workflow.md` | Add group_id to Workflow |
| `US-003-add-group-id-to-labeling-project.md` | Add group_id to LabelingProject |
| `US-004-add-group-id-to-labeling-document.md` | Add group_id to LabelingDocument |
| `US-005-add-group-id-to-api-key.md` | Add group_id to ApiKey |

---

## Phase 2: Authorization Infrastructure (US-006 – US-007)

Build shared, reusable authorization components used by all enforcement stories.

| File | Title |
|---|---|
| `US-006-route-level-identity-resolution-guard.md` | Route-level guard for requestor identity resolution |
| `US-007-shared-group-authorization-helper.md` | Shared service-level group authorization helper |

---

## Phase 3: Resource Creation Enforcement (US-008)

Validate group membership when creating any top-level resource.

| File | Title |
|---|---|
| `US-008-enforce-group-membership-on-resource-creation.md` | Enforce group membership on top-level resource creation |

---

## Phase 4: Read/Write Enforcement per Resource (US-009 – US-012)

Apply group authorization enforcement to existing CRUD operations for each top-level resource.

| File | Title |
|---|---|
| `US-009-enforce-group-authorization-on-document.md` | Enforce group authorization on Document read/write operations |
| `US-010-enforce-group-authorization-on-workflow.md` | Enforce group authorization on Workflow read/write operations |
| `US-011-enforce-group-authorization-on-labeling-project.md` | Enforce group authorization on LabelingProject read/write operations |
| `US-012-enforce-group-authorization-on-labeling-document.md` | Enforce group authorization on LabelingDocument read/write operations |

---

## Phase 5: Sub-Resource Enforcement (US-013)

Enforce group authorization on sub-resources by traversing to their parent's `group_id`.

| File | Title |
|---|---|
| `US-013-enforce-group-authorization-on-sub-resources.md` | Enforce group authorization on sub-resources via parent traversal |

---

## Phase 6: API Key Changes (US-014 – US-015)

Update API key functionality to be group-scoped.

| File | Title |
|---|---|
| `US-014-api-key-group-scoped-access-enforcement.md` | API key group-scoped access enforcement |
| `US-015-user-requests-api-key-for-group.md` | User requests a new API key for a group |

---

## Phase 7: Orphaned Record Handling (US-016)

Ensure legacy records without a `group_id` are inaccessible.

| File | Title |
|---|---|
| `US-016-block-access-to-orphaned-records.md` | Block access to orphaned records with no group_id |

---

## Acceptance Checklist

- [x] US-001-add-group-id-to-document.md
- [x] US-002-add-group-id-to-workflow.md
- [x] US-003-add-group-id-to-labeling-project.md
- [x] US-004-add-group-id-to-labeling-document.md
- [x] US-005-add-group-id-to-api-key.md
- [x] US-006-route-level-identity-resolution-guard.md
- [ ] US-007-shared-group-authorization-helper.md
- [ ] US-008-enforce-group-membership-on-resource-creation.md
- [ ] US-009-enforce-group-authorization-on-document.md
- [ ] US-010-enforce-group-authorization-on-workflow.md
- [ ] US-011-enforce-group-authorization-on-labeling-project.md
- [ ] US-012-enforce-group-authorization-on-labeling-document.md
- [ ] US-013-enforce-group-authorization-on-sub-resources.md
- [ ] US-014-api-key-group-scoped-access-enforcement.md
- [ ] US-015-user-requests-api-key-for-group.md
- [ ] US-016-block-access-to-orphaned-records.md
