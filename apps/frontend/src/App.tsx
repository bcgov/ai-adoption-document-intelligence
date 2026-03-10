import { Stack, Text, Title } from "@mantine/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { MembershipPageGuard, NoGroupGuard } from "./auth/NoGroupGuard";
import { useAuth } from "./auth/useAuth";
import "./App.css";
import { Login } from "./components";
import { ReviewQueuePage } from "./features/annotation/hitl/pages/ReviewQueuePage";
import { ReviewWorkspacePage } from "./features/annotation/hitl/pages/ReviewWorkspacePage";
import { LabelingWorkspacePage } from "./features/annotation/labeling/pages/LabelingWorkspacePage";
import { ProjectDetailPage } from "./features/annotation/labeling/pages/ProjectDetailPage";
import { ProjectListPage } from "./features/annotation/labeling/pages/ProjectListPage";
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
import { RootLayout } from "./layouts/RootLayout";
import ClassifierPage from "./pages/ClassifierPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { GroupsPage } from "./pages/GroupsPage";
import { QueuePage } from "./pages/QueuePage";
import { RequestMembershipPage } from "./pages/RequestMembershipPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UploadPage } from "./pages/UploadPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";

const router = createBrowserRouter([
  {
    path: "/request-membership",
    element: (
      <MembershipPageGuard>
        <RequestMembershipPage />
      </MembershipPageGuard>
    ),
  },
  {
    path: "/",
    element: (
      <NoGroupGuard>
        <RootLayout />
      </NoGroupGuard>
    ),
    children: [
      { index: true, element: <UploadPage /> },
      { path: "queue", element: <QueuePage /> },
      { path: "classify", element: <ClassifierPage /> },
      { path: "settings", element: <SettingsPage /> },

      // Workflows with nested routes
      { path: "workflows", element: <WorkflowListPage /> },
      {
        path: "workflows/create",
        element: <WorkflowEditorPage mode="create" />,
      },
      {
        path: "workflows/:workflowId/edit",
        element: <WorkflowEditorPage mode="edit" />,
      },

      // Labeling with nested routes
      { path: "labeling", element: <ProjectListPage /> },
      { path: "labeling/:projectId", element: <ProjectDetailPage /> },
      {
        path: "labeling/:projectId/document/:documentId",
        element: <LabelingWorkspacePage />,
      },

      // Review with nested routes
      { path: "review", element: <ReviewQueuePage /> },
      { path: "review/:sessionId", element: <ReviewWorkspacePage /> },

      // Groups
      { path: "groups", element: <GroupsPage /> },
      { path: "groups/:groupId", element: <GroupDetailPage /> },

      // Benchmarking routes
      { path: "benchmarking/datasets", element: <DatasetListPage /> },
      { path: "benchmarking/datasets/:id", element: <DatasetDetailPage /> },
      {
        path: "benchmarking/datasets/:id/versions/:versionId/review",
        element: <DatasetReviewQueuePage />,
      },
      {
        path: "benchmarking/datasets/:id/versions/:versionId/review/:sessionId",
        element: <ReviewWorkspacePage />,
      },
      {
        path: "benchmarking/projects",
        element: <BenchmarkProjectListPage />,
      },
      {
        path: "benchmarking/projects/:id",
        element: <BenchmarkProjectDetailPage />,
      },
      {
        path: "benchmarking/projects/:id/runs/:runId",
        element: <RunDetailPage />,
      },
      {
        path: "benchmarking/projects/:id/runs/:runId/regression",
        element: <RegressionReportPage />,
      },
      {
        path: "benchmarking/projects/:projectId/runs/:runId/drill-down",
        element: <ResultsDrillDownPage />,
      },
      {
        path: "benchmarking/projects/:id/compare",
        element: <RunComparisonPage />,
      },
    ],
  },
]);

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="100vh">
        <Title order={3}>Loading…</Title>
        <Text c="dimmed">Checking authentication status</Text>
      </Stack>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <RouterProvider router={router} />;
}

export default App;
