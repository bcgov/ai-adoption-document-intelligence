import { Footer, Header } from "@bcgov/design-system-react-components";
import {
  IconAdjustments,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconDatabase,
  IconFileText,
  IconFlagQuestion,
  IconFlask,
  IconFolderOpen,
  IconLogout,
  IconSettings,
  IconTable,
  IconTags,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { GroupSelector } from "../components/group/GroupSelector";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Tooltip,
  useDisclosure,
} from "../ui";

const NAV_EXPANDED = 240;
const NAV_COLLAPSED = 72;

const MAIN_CONTENT_ID = "main-content";

function getUserInitials(name?: string, email?: string): string {
  const source = name?.trim();

  if (source) {
    const cleaned = source.replace(/[^a-zA-Z,\s-]/g, " ").trim();

    // Handle "Last, first ..." identity-provider format.
    if (cleaned.includes(",")) {
      const [lastRaw, firstRaw = ""] = cleaned.split(",", 2);
      const last = lastRaw.split(/\s+/).find(Boolean);
      const first = firstRaw
        .split(/\s+/)
        .find((token) => token && !/^[A-Z]{2,}$/.test(token));

      if (first && last) {
        return `${first[0]}${last[0]}`.toUpperCase();
      }
    }

    const tokens = cleaned
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !/^[A-Z]{2,}$/.test(token));

    if (tokens.length >= 2) {
      return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
    }

    if (tokens.length === 1) {
      return tokens[0].slice(0, 2).toUpperCase();
    }
  }

  const idir = email?.split("@")[0]?.replace(/[^a-zA-Z]/g, "") || "User";
  return idir.slice(0, 2).toUpperCase();
}

/** Routes that use a fixed viewport workspace (document + field panel). */
function isWorkspaceRoute(pathname: string): boolean {
  return (
    /^\/template-models\/[^/]+\/document\/[^/]+$/.test(pathname) ||
    /^\/review\/[^/]+$/.test(pathname) ||
    /^\/benchmarking\/datasets\/[^/]+\/versions\/[^/]+\/review\/[^/]+$/.test(
      pathname,
    )
  );
}

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const displayName = user?.profile?.name ?? "Authenticated user";
  const displayIdir = user?.profile?.email?.split("@")[0] ?? "Logged in";
  const userInitials = getUserInitials(
    user?.profile?.name,
    user?.profile?.email,
  );

  const isBenchmarkingRoute = location.pathname.startsWith("/benchmarking");
  const workspaceRoute = isWorkspaceRoute(location.pathname);

  const navItems = useMemo(
    () => [
      {
        path: "/",
        label: "Upload",
        description: "Send new files",
        icon: IconUpload,
      },
      {
        path: "/documents",
        label: "Documents",
        description: "View all documents",
        icon: IconFileText,
      },
      {
        path: "/template-models",
        label: "Template models",
        description: "Manage template models",
        icon: IconTags,
      },
      {
        path: "/tables",
        label: "Tables",
        description: "Manage reference data tables",
        icon: IconTable,
      },
      {
        path: "/review",
        label: "HITL review",
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
        path: "/confusion-profiles",
        label: "Confusion profiles",
        description: "Manage OCR confusion profiles",
        icon: IconAdjustments,
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
    ],
    [],
  );

  return (
    <AppShell
      header={{ height: 65 }}
      navbar={{
        width: navbarOpened ? NAV_EXPANDED : NAV_COLLAPSED,
        breakpoint: "sm",
        collapsed: { mobile: !navbarOpened },
      }}
      padding="md"
      transitionDuration={200}
      transitionTimingFunction="ease"
    >
      <AppShell.Header p={0} className="app-shell-bcds-header">
        <Header
          title="Document Intelligence"
          skipLinks={[
            <a key="skip-main" href={`#${MAIN_CONTENT_ID}`}>
              Skip to main content
            </a>,
          ]}
        >
          <div className="app-shell-header-actions">
            <Group gap="sm">
              <GroupSelector />
              <Menu shadow="md" width={260} position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    radius="xl"
                    aria-label="User menu"
                  >
                    <Avatar radius="xl">{userInitials}</Avatar>
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>{displayName}</Menu.Label>
                  <Menu.Item disabled>{displayIdir}</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={16} />}
                    onClick={() => logout()}
                    data-testid="logout-btn"
                  >
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>
        </Header>
      </AppShell.Header>

      <AppShell.Navbar style={{ overflow: "visible" }}>
        <ActionIcon
          variant="default"
          size="sm"
          aria-label={navbarOpened ? "Collapse sidebar" : "Expand sidebar"}
          onClick={toggleNavbar}
          data-testid="sidebar-toggle-btn"
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

        <ScrollArea flex={1} p="md">
          <Stack gap="xs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                !isBenchmarkingRoute &&
                (location.pathname === item.path ||
                  (item.path !== "/" &&
                    location.pathname.startsWith(item.path)));

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
                data-testid="benchmarking-nav"
              >
                {benchmarkingNavItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + "/");

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
                      data-testid={`${item.label.toLowerCase()}-nav-link`}
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
                  data-testid="benchmarking-nav-collapsed"
                >
                  <IconChartBar size={18} />
                </ActionIcon>
              </Tooltip>
            )}

            {navbarOpened ? (
              <NavLink
                label="Settings"
                description="API key management"
                leftSection={<IconSettings size={18} />}
                active={
                  !isBenchmarkingRoute &&
                  location.pathname.startsWith("/settings")
                }
                variant={
                  !isBenchmarkingRoute &&
                  location.pathname.startsWith("/settings")
                    ? "light"
                    : "subtle"
                }
                color={
                  !isBenchmarkingRoute &&
                  location.pathname.startsWith("/settings")
                    ? "blue"
                    : "gray"
                }
                onClick={() => navigate("/settings")}
              />
            ) : (
              <Tooltip label="Settings" position="right">
                <ActionIcon
                  variant={
                    !isBenchmarkingRoute &&
                    location.pathname.startsWith("/settings")
                      ? "light"
                      : "subtle"
                  }
                  color={
                    !isBenchmarkingRoute &&
                    location.pathname.startsWith("/settings")
                      ? "blue"
                      : "gray"
                  }
                  size="lg"
                  radius="md"
                  onClick={() => navigate("/settings")}
                  aria-label="Settings"
                >
                  <IconSettings size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main
        id={MAIN_CONTENT_ID}
        className={workspaceRoute ? "app-shell-main--workspace" : undefined}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {workspaceRoute ? (
          <>
            <div className="app-shell-workspace-outlet">
              <Outlet />
            </div>
            <div className="app-shell-bcds-footer app-shell-bcds-footer--workspace">
              <Footer hideLogoAndLinks />
            </div>
          </>
        ) : (
          <>
            <Stack gap="lg" style={{ minHeight: "100dvh" }}>
              <Outlet />
            </Stack>
            <div className="app-shell-bcds-footer">
              <Footer hideLogoAndLinks />
            </div>
          </>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
