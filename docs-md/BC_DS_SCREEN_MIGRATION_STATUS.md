# BC Design System — screen migration status

Track queue-pattern rollout per route. Reference: [BC_DESIGN_SYSTEM_MIGRATION.md](./BC_DESIGN_SYSTEM_MIGRATION.md) (Screen migration checklist).

| Route | Page / entry | Status | Notes |
|-------|----------------|--------|-------|
| `/queue` | QueuePage + ProcessingQueue | Done | Figma reference (US-004) |
| `/` | UploadPage + DocumentUploadPanel | Done | Panel composite + page shell |
| `/review` | ReviewQueuePage | Done | StatCard, PanelCard, DataTable |
| `/workflows` | WorkflowListPage | Done | PanelCard, DataTable |
| `/groups` | GroupsPage + GroupsTable | Done | |
| `/groups/:groupId` | GroupDetailPage, MembersTab, GroupRequestsTab | Done | |
| `/tables` | TablesListPage | Done | |
| `/tables/:tableId` | TableDetailPage, tabs | Done | |
| `/template-models` | ModelListPage | Done | Page shell |
| `/template-models/:modelId` | ModelDetailPage, panels | Done | |
| `/template-models/.../document/:id` | LabelingWorkspacePage | Done | Toolbar polish only |
| `/classify` | ClassifierPage | Done | |
| `/settings` | SettingsPage | Done | |
| `/review/:sessionId` | ReviewWorkspacePage | Done | Toolbar IconActionButton |
| `/workflows/create`, `.../edit` | WorkflowEditorPage | Done | Shell only |
| `/benchmarking/datasets` | DatasetListPage | Done | |
| `/benchmarking/datasets/:id` | DatasetDetailPage | Done | |
| `/benchmarking/datasets/.../review` | DatasetReviewQueuePage | Done | |
| `/benchmarking/projects` | ProjectListPage | Done | |
| `/benchmarking/projects/:id` | ProjectDetailPage | Done | |
| `/benchmarking/.../runs/:runId` | RunDetailPage | Done | |
| `/benchmarking/.../regression` | RegressionReportPage | Done | |
| `/benchmarking/.../drill-down` | ResultsDrillDownPage | Done | |
| `/benchmarking/.../compare` | RunComparisonPage | Done | |
| Benchmarking panels/dialogs | Various components | Done | DataTable where tabular |
| `/request-membership` | RequestMembershipPage | Done | |
| (auth) | Login | Done | |
| (setup) | SetupPage | Done | |
| — | DocumentViewerModal, DocumentDetailDrawer | Done | DataTable field grids |

**Not routed:** `WorkflowPage.tsx`, `WorkflowEditPage.tsx` — unchanged unless routes re-enabled.
