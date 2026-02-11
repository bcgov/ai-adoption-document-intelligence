import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconClipboardCheck,
  IconFlask,
  IconList,
  IconLogout,
  IconSettings,
  IconTags,
  IconUpload,
} from "@tabler/icons-react";
import { JSX, useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import "./App.css";
import { Login } from "./components";
import { DocumentViewerModal } from "./components/document/DocumentViewerModal";
import { ProcessingQueue } from "./components/queue/ProcessingQueue";
import { DocumentUploadPanel } from "./components/upload/DocumentUploadPanel";
import { ReviewQueuePage } from "./features/annotation/hitl/pages/ReviewQueuePage";
import { ReviewWorkspacePage } from "./features/annotation/hitl/pages/ReviewWorkspacePage";
import { LabelingWorkspacePage } from "./features/annotation/labeling/pages/LabelingWorkspacePage";
import { ProjectDetailPage } from "./features/annotation/labeling/pages/ProjectDetailPage";
import { ProjectListPage } from "./features/annotation/labeling/pages/ProjectListPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowEditPage } from "./pages/WorkflowEditPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";
import { WorkflowPage } from "./pages/WorkflowPage";
import type { Document } from "./shared/types";

type MainView =
  | "upload"
  | "queue"
  | "workflows"
  | "labeling"
  | "review"
  | "settings";
type WorkflowView = "list" | "create" | "edit";

function AppContent(): JSX.Element {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const [activeView, setActiveView] = useState<MainView>("upload");
  const [workflowView, setWorkflowView] = useState<WorkflowView>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [viewerOpened, setViewerOpened] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedProjectDocumentId, setSelectedProjectDocumentId] = useState<
    string | null
  >(null);
  const [activeReviewSessionId, setActiveReviewSessionId] = useState<
    string | null
  >(null);
  const [reviewSessionReadOnly, setReviewSessionReadOnly] = useState(false);

  const navItems = useMemo(
    () => [
      {
        value: "upload" as MainView,
        label: "Upload",
        description: "Send new files",
        icon: IconUpload,
      },
      {
        value: "queue" as MainView,
        label: "Processing queue",
        description: "Track statuses",
        icon: IconList,
      },
      {
        value: "labeling" as MainView,
        label: "Training Labels",
        description: "Create datasets",
        icon: IconTags,
      },
      {
        value: "review" as MainView,
        label: "HITL Review",
        description: "Validate OCR results",
        icon: IconClipboardCheck,
      },
      {
        value: "workflows" as MainView,
        label: "Workflows",
        description: "Manage workflows",
        icon: IconFlask,
      },
      {
        value: "settings" as MainView,
        label: "Settings",
        description: "API key management",
        icon: IconSettings,
      },
    ],
    [],
  );

  const openViewer = (doc: Document) => {
    setSelectedDocument(doc);
    setViewerOpened(true);
  };

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

  return (
    <>
      <AppShell
        header={{ height: 64 }}
        navbar={{ width: 240, breakpoint: "sm" }}
        padding="md"
        withBorder
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Title order={3}>Document intelligence</Title>
              <Badge variant="light" color="blue">
                Live OCR
              </Badge>
            </Group>
            <Group>
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {user?.profile?.name ?? "Authenticated user"}
                </Text>
                <Text size="xs" c="dimmed">
                  {user?.profile?.email ?? "Logged in"}
                </Text>
              </Stack>
              <Avatar radius="xl">{user?.profile?.name?.[0] ?? "U"}</Avatar>
              <Button
                variant="light"
                color="red"
                leftSection={<IconLogout size={16} />}
                onClick={() => logout()}
              >
                Logout
              </Button>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Stack gap="xs">
            {navItems.map((item) => (
              <Button
                key={item.value}
                variant={activeView === item.value ? "light" : "subtle"}
                color={activeView === item.value ? "blue" : "gray"}
                justify="space-between"
                leftSection={<item.icon size={18} />}
                onClick={() => {
                  setActiveView(item.value);
                  if (item.value === "workflows") {
                    setWorkflowView("list");
                    setSelectedWorkflowId(null);
                  }
                }}
              >
                <Stack gap={0} align="flex-start">
                  <Text size="sm" fw={600}>
                    {item.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.description}
                  </Text>
                </Stack>
              </Button>
            ))}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
            {activeView === "settings" ? (
              <SettingsPage />
            ) : activeView === "labeling" ? (
              selectedProjectId ? (
                selectedProjectDocumentId ? (
                  <LabelingWorkspacePage
                    projectId={selectedProjectId}
                    documentId={selectedProjectDocumentId}
                    onBack={() => setSelectedProjectDocumentId(null)}
                  />
                ) : (
                  <ProjectDetailPage
                    projectId={selectedProjectId}
                    onBack={() => setSelectedProjectId(null)}
                    onOpenDocument={(documentId) =>
                      setSelectedProjectDocumentId(documentId)
                    }
                  />
                )
              ) : (
                <ProjectListPage
                  onSelectProject={(projectId) =>
                    setSelectedProjectId(projectId)
                  }
                />
              )
            ) : activeView === "review" ? (
              activeReviewSessionId ? (
                <ReviewWorkspacePage
                  sessionId={activeReviewSessionId}
                  onBack={() => {
                    setActiveReviewSessionId(null);
                    setReviewSessionReadOnly(false);
                  }}
                  readOnly={reviewSessionReadOnly}
                />
              ) : (
                <ReviewQueuePage
                  onStartSession={(sessionId, readOnly) => {
                    setActiveReviewSessionId(sessionId);
                    setReviewSessionReadOnly(readOnly || false);
                  }}
                />
              )
            ) : activeView === "workflows" ? (
              workflowView === "list" ? (
                <WorkflowListPage
                  onEdit={(workflowId) => {
                    setSelectedWorkflowId(workflowId);
                    setWorkflowView("edit");
                  }}
                  onCreate={() => setWorkflowView("create")}
                />
              ) : workflowView === "create" ? (
                <WorkflowPage />
              ) : workflowView === "edit" && selectedWorkflowId ? (
                <WorkflowEditPage
                  workflowId={selectedWorkflowId}
                  onBack={() => {
                    setWorkflowView("list");
                    setSelectedWorkflowId(null);
                  }}
                  onSave={() => {
                    setWorkflowView("list");
                    setSelectedWorkflowId(null);
                  }}
                />
              ) : null
            ) : (
              <>
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Title order={2}>
                      {activeView === "upload"
                        ? "Upload documents"
                        : "Processing monitor"}
                    </Title>
                    <Text c="dimmed" size="sm">
                      {activeView === "upload"
                        ? "Add new images and track their ingestion progress."
                        : "View the OCR pipeline and drill into results."}
                    </Text>
                  </Stack>
                  <Badge variant="outline" size="lg">
                    {new Date().toLocaleDateString()}
                  </Badge>
                </Group>

                {activeView === "upload" ? (
                  <DocumentUploadPanel />
                ) : (
                  <ProcessingQueue onSelectDocument={openViewer} />
                )}
              </>
            )}
          </Stack>
        </AppShell.Main>
      </AppShell>

      <DocumentViewerModal
        document={selectedDocument}
        opened={viewerOpened}
        onClose={() => setViewerOpened(false)}
      />
    </>
  );
}

function App(): JSX.Element {
  return <AppContent />;
}

export default App;
