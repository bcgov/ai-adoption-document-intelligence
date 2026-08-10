import {
  IconAdjustments,
  IconChartBar,
  IconClipboardCheck,
  IconDatabase,
  IconFileText,
  IconFlagQuestion,
  IconFlask,
  IconFolderOpen,
  IconSettings,
  IconTable,
  IconTags,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import { ComponentType, ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useGroup } from "./auth/GroupContext";
import { Permission } from "./auth/NoGroupGuard";
import { useAuth } from "./auth/useAuth";
import { ReviewQueuePage } from "./features/annotation/hitl/pages/ReviewQueuePage";
import { ReviewWorkspacePage } from "./features/annotation/hitl/pages/ReviewWorkspacePage";
import { LabelingWorkspacePage } from "./features/annotation/template-models/pages/LabelingWorkspacePage";
import { ModelDetailPage } from "./features/annotation/template-models/pages/ModelDetailPage";
import { ModelListPage } from "./features/annotation/template-models/pages/ModelListPage";
import {
  ProjectDetailPage as BenchmarkProjectDetailPage,
  ProjectListPage as BenchmarkProjectListPage,
  DatasetDetailPage,
  DatasetListPage,
  DatasetReviewQueuePage,
  RegressionReportPage,
  ResultsDrillDownPage,
  RunComparisonPage,
  RunDetailPage,
} from "./features/benchmarking/pages";
import { TableDetailPage } from "./features/tables/pages/TableDetailPage";
import { TablesListPage } from "./features/tables/pages/TablesListPage";
import ClassifierPage from "./pages/ClassifierPage";
import { ConfusionProfilesPage } from "./pages/ConfusionProfilesPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { GroupsPage } from "./pages/GroupsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UploadPage } from "./pages/UploadPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";

/**
 * Controls which section of the sidebar a nav item appears in.
 * - absent / undefined: rendered in the main nav list
 * - 'benchmarking': rendered as a child of the collapsible Benchmarking group
 * - 'bottom': rendered after the Benchmarking group
 */
export type NavSection = "benchmarking" | "bottom";

export interface NavConfig {
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  navSection?: NavSection;
}

export interface AppRouteConfig {
  /** Set to true for the index (/) route. Mutually exclusive with path. */
  index?: true;
  /** Relative path for React Router (no leading slash). */
  path?: string;
  element: ReactElement;
  /** Required permissions for the active group to access this route/nav item. */
  permissions?: Permission[];
  /** When present the route has a sidebar entry. */
  nav?: NavConfig;
  /**
   * When set, the route is a candidate landing page for `/`. Lower values
   * take priority. HomeRedirect picks the first route the user can access.
   */
  homePriority?: number;
}

/** Redirects `/` to the first accessible route ordered by `homePriority`. */
function HomeRedirect() {
  const { isSystemAdmin } = useAuth();
  const { activeGroup, hasPermissionForGroup } = useGroup();

  const target = appRoutes
    .filter(
      (r): r is AppRouteConfig & { path: string; homePriority: number } =>
        r.homePriority !== undefined && r.path !== undefined,
    )
    .sort((a, b) => a.homePriority - b.homePriority)
    .find((r) => {
      if (!r.permissions || r.permissions.length === 0) return true;
      if (isSystemAdmin) return true;
      if (!activeGroup) return false;
      return hasPermissionForGroup(activeGroup.id, r.permissions);
    });

  // No accessible home candidate — let the group selector / guards handle it.
  if (!target) return null;
  return <Navigate to={`/${target.path}`} replace />;
}

/**
 * Single source of truth for all application routes, permissions, and nav items.
 * App.tsx uses this to build the router and guards; RootLayout uses it to derive
 * the sidebar, filtering each item by the active group's permissions.
 */
export const appRoutes: AppRouteConfig[] = [
  // ── Main nav items ──────────────────────────────────────────────────────────
  { index: true, element: <HomeRedirect /> },
  {
    path: "upload",
    element: <UploadPage />,
    permissions: [Permission.DOCUMENT_CREATE],
    homePriority: 1,
    nav: { label: "Upload", description: "Send new files", icon: IconUpload },
  },
  {
    path: "documents",
    element: <DocumentsPage />,
    permissions: [Permission.DOCUMENT_VIEW, Permission.DOCUMENT_RETRIEVE],
    nav: {
      label: "Documents",
      description: "View all documents",
      icon: IconFileText,
    },
  },
  {
    path: "template-models",
    element: <ModelListPage />,
    permissions: [Permission.TEMPLATE_MODEL_RETRIEVE],
    nav: {
      label: "Template models",
      description: "Manage template models",
      icon: IconTags,
    },
  },
  {
    path: "template-models/:modelId",
    permissions: [Permission.TEMPLATE_MODEL_RETRIEVE],
    element: <ModelDetailPage />,
  },
  {
    path: "template-models/:modelId/document/:documentId",
    permissions: [
      Permission.TEMPLATE_MODEL_DOCUMENT_RETRIEVE,
      Permission.TEMPLATE_MODEL_LABEL_RETRIEVE,
    ],
    element: <LabelingWorkspacePage />,
  },
  {
    path: "tables",
    element: <TablesListPage />,
    permissions: [Permission.TABLE_RETRIEVE],
    nav: {
      label: "Tables",
      description: "Manage reference data tables",
      icon: IconTable,
    },
  },
  {
    path: "tables/:tableId",
    permissions: [Permission.TABLE_RETRIEVE, Permission.TABLE_ROW_RETRIEVE],
    element: <TableDetailPage />,
  },
  {
    path: "review",
    element: <ReviewQueuePage />,
    permissions: [Permission.HITL_QUEUE_RETRIEVE],
    homePriority: 2,
    nav: {
      label: "HITL review",
      description: "Validate OCR results",
      icon: IconClipboardCheck,
    },
  },
  {
    path: "review/:sessionId",
    permissions: [
      Permission.HITL_SESSION_RETRIEVE,
      Permission.HITL_CORRECTION_RETRIEVE,
    ],
    element: <ReviewWorkspacePage />,
  },
  {
    path: "workflows",
    element: <WorkflowListPage />,
    permissions: [Permission.WORKFLOW_RETRIEVE],
    nav: {
      label: "Workflows",
      description: "Manage workflows",
      icon: IconFlask,
    },
  },
  {
    path: "workflows/create",
    permissions: [Permission.WORKFLOW_CREATE],
    element: <WorkflowEditorPage mode="create" />,
  },
  {
    path: "workflows/:workflowId/edit",
    permissions: [Permission.WORKFLOW_RETRIEVE, Permission.WORKFLOW_UPDATE],
    element: <WorkflowEditorPage mode="edit" />,
  },
  {
    path: "classify",
    element: <ClassifierPage />,
    permissions: [Permission.CLASSIFIER_RETRIEVE],
    nav: {
      label: "Classify",
      description: "Build & use classifiers",
      icon: IconFlagQuestion,
    },
  },
  {
    path: "groups",
    element: <GroupsPage />,
    permissions: [Permission.GROUP_RETRIEVE],
    nav: { label: "Groups", description: "Manage groups", icon: IconUsers },
  },
  {
    path: "groups/:groupId",
    permissions: [Permission.GROUP_RETRIEVE],
    element: <GroupDetailPage />,
  },
  {
    path: "confusion-profiles",
    element: <ConfusionProfilesPage />,
    permissions: [Permission.CONFUSION_RETRIEVE],
    nav: {
      label: "Confusion profiles",
      description: "Manage OCR confusion profiles",
      icon: IconAdjustments,
    },
  },

  // ── Benchmarking nav group ───────────────────────────────────────────────────
  {
    path: "benchmarking/datasets",
    element: <DatasetListPage />,
    permissions: [Permission.BENCHMARK_RETRIEVE],
    nav: {
      label: "Datasets",
      description: "Manage benchmark datasets",
      icon: IconDatabase,
      navSection: "benchmarking",
    },
  },
  {
    path: "benchmarking/datasets/:id",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <DatasetDetailPage />,
  },
  {
    path: "benchmarking/datasets/:id/versions/:versionId/review",
    permissions: [
      Permission.BENCHMARK_RETRIEVE,
      Permission.HITL_QUEUE_RETRIEVE,
    ],
    element: <DatasetReviewQueuePage />,
  },
  {
    path: "benchmarking/datasets/:id/versions/:versionId/review/:sessionId",
    permissions: [
      Permission.HITL_SESSION_RETRIEVE,
      Permission.HITL_CORRECTION_RETRIEVE,
    ],
    element: <ReviewWorkspacePage />,
  },
  {
    path: "benchmarking/projects",
    element: <BenchmarkProjectListPage />,
    permissions: [Permission.BENCHMARK_RETRIEVE],
    nav: {
      label: "Projects",
      description: "Benchmark projects",
      icon: IconFolderOpen,
      navSection: "benchmarking",
    },
  },
  {
    path: "benchmarking/projects/:id",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <BenchmarkProjectDetailPage />,
  },
  {
    path: "benchmarking/projects/:id/runs/:runId",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <RunDetailPage />,
  },
  {
    path: "benchmarking/projects/:id/runs/:runId/regression",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <RegressionReportPage />,
  },
  {
    path: "benchmarking/projects/:projectId/runs/:runId/drill-down",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <ResultsDrillDownPage />,
  },
  {
    path: "benchmarking/projects/:id/compare",
    permissions: [Permission.BENCHMARK_RETRIEVE],
    element: <RunComparisonPage />,
  },

  // ── Bottom nav item ──────────────────────────────────────────────────────────
  {
    path: "settings",
    element: <SettingsPage />,
    permissions: [Permission.API_KEY_RETRIEVE],
    nav: {
      label: "Settings",
      description: "API key management",
      icon: IconSettings,
      navSection: "bottom",
    },
  },
];

/** Icon used for the Benchmarking nav group parent (not itself a route). */
export { IconChartBar as BenchmarkingGroupIcon };
