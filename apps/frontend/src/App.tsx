import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Button,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconDatabase,
  IconFlask,
  IconFolderOpen,
  IconList,
  IconLogout,
  IconPlayerPlay,
  IconSettings,
  IconTags,
  IconUpload,
} from "@tabler/icons-react";
import { JSX, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import {
  ProjectDetailPage as BenchmarkProjectDetailPage,
  ProjectListPage as BenchmarkProjectListPage,
  DatasetDetailPage,
  DatasetListPage,
  RegressionReportPage,
  ResultsDrillDownPage,
  RunComparisonPage,
  RunDetailPage,
} from "./features/benchmarking/pages";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowEditorPage } from "./pages/WorkflowEditorPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";
import type { Document } from "./shared/types";

type MainView =
  | "upload"
  | "queue"
  | "workflows"
  | "labeling"
  | "review"
  | "settings";
type WorkflowView = "list" | "create" | "edit";

const NAV_EXPANDED = 240;
const NAV_COLLAPSED = 72;

function AppContent(): JSX.Element {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<MainView>("upload");
  const [workflowView, setWorkflowView] = useState<WorkflowView>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
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

  // Determine if we're on a benchmarking route
  const isBenchmarkingRoute = location.pathname.startsWith("/benchmarking");

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

  const benchmarkingNavItems = useMemo(
    () => [
      {
        path: "/benchmarking/datasets",
        label: "Datasets",
        description: "Manage benchmark datasets",
        icon: IconDatabase,
      },
      {
        path: "/benchmarking/projects",
        label: "Projects",
        description: "Benchmark projects",
        icon: IconFolderOpen,
      },
      {
        path: "/benchmarking/runs",
        label: "Runs",
        description: "Benchmark runs",
        icon: IconPlayerPlay,
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
        navbar={{
          width: navbarOpened ? NAV_EXPANDED : NAV_COLLAPSED,
          breakpoint: "sm",
          collapsed: { mobile: !navbarOpened },
        }}
        padding="md"
        withBorder
        transitionDuration={200}
        transitionTimingFunction="ease"
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

        <AppShell.Navbar p="md" style={{ overflow: "visible" }}>
          {/* Edge handle button */}
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={navbarOpened ? "Collapse sidebar" : "Expand sidebar"}
            onClick={toggleNavbar}
            style={{
              position: "absolute",
              top: "50%",
              right: -14,
              transform: "translateY(-50%)",
              zIndex: 300,
              background: "var(--mantine-color-body)",
            }}
          >
            {navbarOpened ? (
              <IconChevronLeft size={18} />
            ) : (
              <IconChevronRight size={18} />
            )}
          </ActionIcon>

          <Stack gap="xs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = !isBenchmarkingRoute && activeView === item.value;

              return navbarOpened ? (
                <NavLink
                  key={item.value}
                  label={item.label}
                  description={item.description}
                  leftSection={<Icon size={18} />}
                  active={active}
                  variant={active ? "light" : "subtle"}
                  color={active ? "blue" : "gray"}
                  onClick={() => {
                    navigate("/");
                    setActiveView(item.value);
                    if (item.value === "workflows") {
                      setWorkflowView("list");
                      setSelectedWorkflowId(null);
                    }
                  }}
                />
              ) : (
                <Tooltip key={item.value} label={item.label} position="right">
                  <ActionIcon
                    variant={active ? "light" : "subtle"}
                    color={active ? "blue" : "gray"}
                    size="lg"
                    radius="md"
                    onClick={() => {
                      navigate("/");
                      setActiveView(item.value);
                      if (item.value === "workflows") {
                        setWorkflowView("list");
                        setSelectedWorkflowId(null);
                      }
                    }}
                    aria-label={item.label}
                  >
                    <Icon size={18} />
                  </ActionIcon>
                </Tooltip>
              );
            })}

            {/* Benchmarking Section */}
            {navbarOpened ? (
              <NavLink
                label="Benchmarking"
                description="Benchmark management"
                leftSection={<IconChartBar size={18} />}
                active={isBenchmarkingRoute}
                variant={isBenchmarkingRoute ? "light" : "subtle"}
                color={isBenchmarkingRoute ? "blue" : "gray"}
                childrenOffset={28}
                defaultOpened={isBenchmarkingRoute}
              >
                {benchmarkingNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;

                  return (
                    <NavLink
                      key={item.path}
                      label={item.label}
                      description={item.description}
                      leftSection={<Icon size={16} />}
                      active={active}
                      variant={active ? "filled" : "subtle"}
                      color={active ? "blue" : "gray"}
                      onClick={() => navigate(item.path)}
                    />
                  );
                })}
              </NavLink>
            ) : (
              <Tooltip label="Benchmarking" position="right">
                <ActionIcon
                  variant={isBenchmarkingRoute ? "light" : "subtle"}
                  color={isBenchmarkingRoute ? "blue" : "gray"}
                  size="lg"
                  radius="md"
                  onClick={() => navigate("/benchmarking/datasets")}
                  aria-label="Benchmarking"
                >
                  <IconChartBar size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
            <Routes>
              {/* Benchmarking Routes */}
              <Route
                path="/benchmarking/datasets"
                element={<DatasetListPage />}
              />
              <Route
                path="/benchmarking/datasets/:id"
                element={<DatasetDetailPage />}
              />
              <Route
                path="/benchmarking/projects"
                element={<BenchmarkProjectListPage />}
              />
              <Route
                path="/benchmarking/projects/:id"
                element={<BenchmarkProjectDetailPage />}
              />
              <Route
                path="/benchmarking/projects/:id/runs/:runId"
                element={<RunDetailPage />}
              />
              <Route
                path="/benchmarking/projects/:id/runs/:runId/regression"
                element={<RegressionReportPage />}
              />
              <Route
                path="/benchmarking/projects/:projectId/runs/:runId/drill-down"
                element={<ResultsDrillDownPage />}
              />
              <Route
                path="/benchmarking/projects/:id/compare"
                element={<RunComparisonPage />}
              />

              {/* Default Route - Legacy State-Based Navigation */}
              <Route
                path="/"
                element={
                  <>
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
                        <WorkflowEditorPage
                          mode="create"
                          onBack={() => setWorkflowView("list")}
                          onSave={() => setWorkflowView("list")}
                        />
                      ) : workflowView === "edit" && selectedWorkflowId ? (
                        <WorkflowEditorPage
                          mode="edit"
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
                  </>
                }
              />
            </Routes>
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
