import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import type { JSX } from "react";
import {
  Navigate,
  Route,
  Routes as RouterRoutes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ProcessingQueue } from "./components/queue/ProcessingQueue";
import { DocumentUploadPanel } from "./components/upload/DocumentUploadPanel";
import { ReviewQueuePage } from "./features/annotation/hitl/pages/ReviewQueuePage";
import { ReviewWorkspacePage } from "./features/annotation/hitl/pages/ReviewWorkspacePage";
import { LabelingWorkspacePage } from "./features/annotation/labeling/pages/LabelingWorkspacePage";
import { ProjectDetailPage } from "./features/annotation/labeling/pages/ProjectDetailPage";
import { ProjectListPage } from "./features/annotation/labeling/pages/ProjectListPage";
import ClassifierPage from "./pages/ClassifierPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { GroupsPage } from "./pages/GroupsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";
import type { Document } from "./shared/types";

interface AppRoutesProps {
  onSelectDocument: (doc: Document) => void;
}

/** Renders the Upload page with its header. */
function UploadPage(): JSX.Element {
  return (
    <>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Upload documents</Title>
          <Text c="dimmed" size="sm">
            Add new images and track their ingestion progress.
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          {new Date().toLocaleDateString()}
        </Badge>
      </Group>
      <DocumentUploadPanel />
    </>
  );
}

interface QueuePageProps {
  onSelectDocument: (doc: Document) => void;
}

/** Renders the Processing Queue page with its header. */
function QueuePage({ onSelectDocument }: QueuePageProps): JSX.Element {
  return (
    <>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Processing monitor</Title>
          <Text c="dimmed" size="sm">
            View the OCR pipeline and drill into results.
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          {new Date().toLocaleDateString()}
        </Badge>
      </Group>
      <ProcessingQueue onSelectDocument={onSelectDocument} />
    </>
  );
}

/**
 * Route wrapper for /labeling/:projectId that reads the projectId param and
 * provides navigate-based callbacks to ProjectDetailPage.
 */
function LabelingProjectRoute(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  return (
    <ProjectDetailPage
      projectId={projectId ?? ""}
      onBack={() => navigate("/labeling")}
      onOpenDocument={(documentId) =>
        navigate(`/labeling/${projectId}/${documentId}`)
      }
    />
  );
}

/**
 * Route wrapper for /labeling/:projectId/:documentId that reads URL params and
 * provides navigate-based callbacks to LabelingWorkspacePage.
 */
function LabelingWorkspaceRoute(): JSX.Element {
  const { projectId, documentId } = useParams<{
    projectId: string;
    documentId: string;
  }>();
  const navigate = useNavigate();
  return (
    <LabelingWorkspacePage
      projectId={projectId ?? ""}
      documentId={documentId ?? ""}
      onBack={() => navigate(`/labeling/${projectId}`)}
    />
  );
}

/**
 * Route wrapper for /review/:sessionId that reads the sessionId param and
 * the optional readOnly query param, then renders ReviewWorkspacePage.
 */
function ReviewWorkspaceRoute(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const readOnly = searchParams.get("readOnly") === "true";
  return (
    <ReviewWorkspacePage
      sessionId={sessionId ?? ""}
      onBack={() => navigate("/review")}
      readOnly={readOnly}
    />
  );
}

/** Route wrapper for /workflows/create that navigates back to /workflows on back/save. */
function WorkflowCreateRoute(): JSX.Element {
  const navigate = useNavigate();
  return (
    <WorkflowEditorPage
      mode="create"
      onBack={() => navigate("/workflows")}
      onSave={() => navigate("/workflows")}
    />
  );
}

/**
 * Route wrapper for /workflows/:workflowId/edit that reads the workflowId param
 * and navigates back to /workflows on back/save.
 */
function WorkflowEditRoute(): JSX.Element {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  return (
    <WorkflowEditorPage
      mode="edit"
      workflowId={workflowId}
      onBack={() => navigate("/workflows")}
      onSave={() => navigate("/workflows")}
    />
  );
}

/**
 * Defines all application routes rendered inside the main AppShell content area.
 * Each sidebar nav item maps to a distinct URL path.
 *
 * @param props.onSelectDocument - Callback invoked when a document is selected for viewing.
 */
export function AppRoutes({ onSelectDocument }: AppRoutesProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <RouterRoutes>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route
        path="/queue"
        element={<QueuePage onSelectDocument={onSelectDocument} />}
      />
      <Route
        path="/labeling"
        element={
          <ProjectListPage
            onSelectProject={(id) => navigate(`/labeling/${id}`)}
          />
        }
      />
      <Route path="/labeling/:projectId" element={<LabelingProjectRoute />} />
      <Route
        path="/labeling/:projectId/:documentId"
        element={<LabelingWorkspaceRoute />}
      />
      <Route
        path="/review"
        element={
          <ReviewQueuePage
            onStartSession={(sessionId, readOnly) =>
              navigate(
                `/review/${sessionId}${readOnly ? "?readOnly=true" : ""}`,
              )
            }
          />
        }
      />
      <Route path="/review/:sessionId" element={<ReviewWorkspaceRoute />} />
      <Route
        path="/workflows"
        element={
          <WorkflowListPage
            onEdit={(id) => navigate(`/workflows/${id}/edit`)}
            onCreate={() => navigate("/workflows/create")}
          />
        }
      />
      <Route path="/workflows/create" element={<WorkflowCreateRoute />} />
      <Route
        path="/workflows/:workflowId/edit"
        element={<WorkflowEditRoute />}
      />
      <Route path="/classify" element={<ClassifierPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/groups/:groupId" element={<GroupDetailPage />} />
      <Route path="*" element={<Navigate to="/upload" replace />} />
    </RouterRoutes>
  );
}
