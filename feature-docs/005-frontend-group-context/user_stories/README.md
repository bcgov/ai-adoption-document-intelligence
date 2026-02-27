# Feature 005 — User Stories

User stories for **Frontend Group Context & Active Group Selector**.

---

## Phase 1 — Backend: Extend `/me` Endpoint

| # | Story | Status |
|---|-------|--------|
| US-001 | [Extend `/me` Endpoint to Include Group Memberships](./US-001-extend-me-endpoint-with-groups.md) | - [x] |

---

## Phase 2 — Frontend Core: Context & Header Selector

| # | Story | Status |
|---|-------|--------|
| US-002 | [Create `GroupContext` to Manage Active Group State](./US-002-group-context.md) | - [x] |
| US-003 | [Add Searchable Group Selector to the App Header](./US-003-group-selector-ui.md) | - [x] |

---

## Phase 3 — Frontend Routing: Guard & Membership Request Page

| # | Story | Status |
|---|-------|--------|
| US-004 | [Block Navigation for Users with No Group Membership](./US-004-no-group-route-guard.md) | - [x] |
| US-005 | [Group Membership Request Page](./US-005-membership-request-page.md) | - [x] |

---

## Phase 4 — Frontend Integration: Hook Updates

| # | Story | Status |
|---|-------|--------|
| US-006 | [Inject Active Group into Document Upload Hook](./US-006-document-upload-active-group.md) | - [x] |
| US-007 | [Inject Active Group into `useCreateWorkflow` Hook](./US-007-create-workflow-active-group.md) | - [x] |

---

## Phase 5 — Frontend & Backend: Remaining Group Context Gaps

| # | Story | Status |
|---|-------|--------|
| US-008 | [Remove Hardcoded Group Selection from Classifier Page](./US-008-classifier-page-active-group.md) | - [x] |
| US-009 | [Filter Labeling Projects by Active Group](./US-009-labeling-projects-active-group-filter.md) | - [x] |
| US-010 | [Inject Active Group into Labeling Project Creation](./US-010-create-labeling-project-active-group.md) | - [x] |
| US-011 | [Inject Active Group into API Key Management Hooks](./US-011-api-key-hooks-active-group.md) | - [x] |
| US-012 | [Filter Documents List by Active Group](./US-012-documents-list-active-group-filter.md) | - [x] |
| US-013 | [Filter Workflows List by Active Group](./US-013-workflows-list-active-group-filter.md) | - [x] |
| US-014 | [Filter Classifiers List by Active Group](./US-014-classifiers-list-active-group-filter.md) | - [ ] |
| US-015 | [Filter HITL Queue by Active Group](./US-015-hitl-queue-active-group-filter.md) | - [ ] |
