import { Footer, Header } from "@bcgov/design-system-react-components";
import {
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useGroup } from "../auth/GroupContext";
import { useAuth } from "../auth/useAuth";
import { GroupSelector } from "../components/group/GroupSelector";
import { AppRouteConfig, appRoutes } from "../routes.config";
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
  const { logout, user, isSystemAdmin } = useAuth();
  const { activeGroup, userHasRequiredPermissions } = useGroup();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const displayName = user?.profile?.name ?? "Authenticated user";
  const displayIdir = user?.profile?.email?.split("@")[0] ?? "Logged in";
  const userInitials = getUserInitials(
    user?.profile?.name,
    user?.profile?.email,
  );

  const isBenchmarkingRoute = location.pathname.startsWith("/benchmarking");
  const workspaceRoute = isWorkspaceRoute(location.pathname);

  const isNavItemVisible = (route: AppRouteConfig): boolean => {
    if (!route.permissions || route.permissions.length === 0) return true;
    if (isSystemAdmin) return true;
    if (!activeGroup) return false;
    return userHasRequiredPermissions(activeGroup, route.permissions);
  };

  const mainNavItems = useMemo(
    () =>
      appRoutes.filter(
        (r) => r.nav && !r.nav.navSection && isNavItemVisible(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGroup, isSystemAdmin],
  );

  const benchmarkingNavItems = useMemo(
    () =>
      appRoutes.filter(
        (r) => r.nav?.navSection === "benchmarking" && isNavItemVisible(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGroup, isSystemAdmin],
  );

  const bottomNavItems = useMemo(
    () =>
      appRoutes.filter(
        (r) => r.nav?.navSection === "bottom" && isNavItemVisible(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGroup, isSystemAdmin],
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
            {mainNavItems.map((item) => {
              const nav = item.nav!;
              const Icon = nav.icon;
              const navPath = item.index ? "/" : `/${item.path}`;
              const active =
                !isBenchmarkingRoute &&
                (location.pathname === navPath ||
                  (!item.index && location.pathname.startsWith(navPath + "/")));

              return navbarOpened ? (
                <NavLink
                  key={navPath}
                  label={nav.label}
                  description={nav.description}
                  leftSection={<Icon size={18} />}
                  active={active}
                  variant={active ? "light" : "subtle"}
                  color={active ? "blue" : "gray"}
                  onClick={() => navigate(navPath)}
                />
              ) : (
                <Tooltip key={navPath} label={nav.label} position="right">
                  <ActionIcon
                    variant={active ? "light" : "subtle"}
                    color={active ? "blue" : "gray"}
                    size="lg"
                    radius="md"
                    onClick={() => navigate(navPath)}
                    aria-label={nav.label}
                  >
                    <Icon size={18} />
                  </ActionIcon>
                </Tooltip>
              );
            })}

            {benchmarkingNavItems.length > 0 &&
              (navbarOpened ? (
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
                    const nav = item.nav!;
                    const Icon = nav.icon;
                    const navPath = `/${item.path}`;
                    const active =
                      location.pathname === navPath ||
                      location.pathname.startsWith(navPath + "/");

                    return (
                      <NavLink
                        key={navPath}
                        label={nav.label}
                        description={nav.description}
                        leftSection={<Icon size={16} />}
                        active={active}
                        variant={active ? "filled" : "subtle"}
                        color={active ? "blue" : "gray"}
                        onClick={() => navigate(navPath)}
                        data-testid={`${nav.label.toLowerCase()}-nav-link`}
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
              ))}

            {bottomNavItems.map((item) => {
              const nav = item.nav!;
              const Icon = nav.icon;
              const navPath = `/${item.path}`;
              const active =
                !isBenchmarkingRoute && location.pathname.startsWith(navPath);

              return navbarOpened ? (
                <NavLink
                  key={navPath}
                  label={nav.label}
                  description={nav.description}
                  leftSection={<Icon size={18} />}
                  active={active}
                  variant={active ? "light" : "subtle"}
                  color={active ? "blue" : "gray"}
                  onClick={() => navigate(navPath)}
                />
              ) : (
                <Tooltip key={navPath} label={nav.label} position="right">
                  <ActionIcon
                    variant={active ? "light" : "subtle"}
                    color={active ? "blue" : "gray"}
                    size="lg"
                    radius="md"
                    onClick={() => navigate(navPath)}
                    aria-label={nav.label}
                  >
                    <Icon size={18} />
                  </ActionIcon>
                </Tooltip>
              );
            })}
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
