import {
  ActionIcon,
  AppShell,
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
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconFlagQuestion,
  IconFlask,
  IconList,
  IconLogout,
  IconSettings,
  IconTags,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType, JSX } from "react";
import { useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { MembershipPageGuard, NoGroupGuard } from "./auth/NoGroupGuard";
import "./App.css";
import { Login } from "./components";
import { DocumentViewerModal } from "./components/document/DocumentViewerModal";
import { GroupSelector } from "./components/group/GroupSelector";
import { RequestMembershipPage } from "./pages/RequestMembershipPage";
import { AppRoutes } from "./Routes";
import type { Document } from "./shared/types";

interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
}

const NAV_EXPANDED = 240;
const NAV_COLLAPSED = 72;

function MainApp(): JSX.Element {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const [viewerOpened, setViewerOpened] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  );

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        path: "/upload",
        label: "Upload",
        description: "Send new files",
        icon: IconUpload,
      },
      {
        path: "/queue",
        label: "Processing queue",
        description: "Track statuses",
        icon: IconList,
      },
      {
        path: "/labeling",
        label: "Training Labels",
        description: "Create datasets",
        icon: IconTags,
      },
      {
        path: "/review",
        label: "HITL Review",
        description: "Validate OCR results",
        icon: IconClipboardCheck,
      },
      {
        path: "/workflows",
        label: "Workflows",
        description: "Manage workflows",
        icon: IconFlask,
      },
      {
        path: "/classify",
        label: "Classify",
        description: "Build & use classifiers",
        icon: IconFlagQuestion,
      },
      {
        path: "/groups",
        label: "Groups",
        description: "Manage groups",
        icon: IconUsers,
      },
      {
        path: "/settings",
        label: "Settings",
        description: "API key management",
        icon: IconSettings,
      },
    ],
    [],
  );

  const isNavItemActive = (path: string): boolean => {
    if (path === "/upload") {
      return (
        location.pathname === "/" || location.pathname.startsWith("/upload")
      );
    }
    return location.pathname.startsWith(path);
  };

  const openViewer = (doc: Document) => {
    setSelectedDocument(doc);
    setViewerOpened(true);
  };

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
              <Title order={3}>Document Intelligence</Title>
            </Group>
            <Group>
              <GroupSelector />
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {user?.profile?.name ?? "Authenticated user"}
                </Text>
                <Text size="xs" c="dimmed">
                  {user?.profile?.email ?? "Logged in"}
                </Text>
              </Stack>
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
              const active = isNavItemActive(item.path);

              return navbarOpened ? (
                <NavLink
                  key={item.path}
                  label={item.label}
                  description={item.description}
                  leftSection={<Icon size={18} />}
                  active={active}
                  variant={active ? "light" : "subtle"}
                  color={active ? "blue" : "gray"}
                  onClick={() => navigate(item.path)}
                />
              ) : (
                <Tooltip key={item.path} label={item.label} position="right">
                  <ActionIcon
                    variant={active ? "light" : "subtle"}
                    color={active ? "blue" : "gray"}
                    size="lg"
                    radius="md"
                    onClick={() => navigate(item.path)}
                    aria-label={item.label}
                  >
                    <Icon size={18} />
                  </ActionIcon>
                </Tooltip>
              );
            })}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
            <AppRoutes onSelectDocument={openViewer} />
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

function AppContent(): JSX.Element {
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

  return (
    <Routes>
      <Route
        path="/request-membership"
        element={
          <MembershipPageGuard>
            <RequestMembershipPage />
          </MembershipPageGuard>
        }
      />
      <Route
        path="*"
        element={
          <NoGroupGuard>
            <MainApp />
          </NoGroupGuard>
        }
      />
    </Routes>
  );
}

function App(): JSX.Element {
  return <AppContent />;
}

export default App;
