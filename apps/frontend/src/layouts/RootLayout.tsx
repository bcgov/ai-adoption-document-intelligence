import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Button,
  Group,
  NavLink,
  ScrollArea,
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
  IconFlagQuestion,
  IconFlask,
  IconFolderOpen,
  IconList,
  IconLogout,
  IconSettings,
  IconTags,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { GroupSelector } from "../components/group/GroupSelector";

const NAV_EXPANDED = 240;
const NAV_COLLAPSED = 72;

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);

  const isBenchmarkingRoute = location.pathname.startsWith("/benchmarking");

  const navItems = useMemo(
    () => [
      {
        path: "/",
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
        path: "/template-models",
        label: "Template Models",
        description: "Manage template models",
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
            <GroupSelector />
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
              data-testid="logout-btn"
            >
              Logout
            </Button>
          </Group>
        </Group>
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

      <AppShell.Main>
        <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
