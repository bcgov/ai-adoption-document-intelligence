import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { GroupProvider } from "./GroupContext";
import { GroupPermissionGuard } from "./NoGroupGuard";
import { Permission } from "./permissions";
import { useAuth } from "./useAuth";

/** A GET /api/auth/me response for a user with one group holding `permissions`. */
function meResponse(isAdmin: boolean, permissions: Permission[]) {
  return {
    data: {
      sub: "user-1",
      actorId: "actor-1",
      name: "Test User",
      preferred_username: "test",
      email: "test@example.com",
      isAdmin,
      expires_in: 3600,
      groups: [
        { id: "group-1", name: "Group One", role: "EDITOR", permissions },
      ],
    },
  };
}

/** Same gating as App.tsx: the router mounts only once /me has resolved. */
function App({ router }: { router: ReturnType<typeof createMemoryRouter> }) {
  const { isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <RouterProvider router={router} />;
}

/**
 * Starts the app fresh at `path`, as a page reload or a pasted link does, with
 * the real auth and group providers and only the /me request stubbed.
 */
async function loadAt(path: string, me: ReturnType<typeof meResponse>) {
  vi.spyOn(axios, "get").mockResolvedValue(me);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Outlet />,
        children: [
          { index: true, element: <div>home page</div> },
          {
            path: "documents",
            element: (
              <GroupPermissionGuard
                requiredPermissions={[Permission.DOCUMENT_RETRIEVE]}
              >
                <div>documents page</div>
              </GroupPermissionGuard>
            ),
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AuthProvider>
      <GroupProvider>
        <App router={router} />
      </GroupProvider>
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.queryByText("loading")).toBeNull());
  return router;
}

describe("GroupPermissionGuard on a full page load", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps a user who holds the required permission on the page", async () => {
    const router = await loadAt(
      "/documents",
      meResponse(false, [Permission.DOCUMENT_RETRIEVE]),
    );

    expect(await screen.findByText("documents page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/documents");
  });

  it("redirects a user without the required permission to /", async () => {
    const router = await loadAt(
      "/documents",
      meResponse(false, [Permission.HITL_QUEUE_RETRIEVE]),
    );

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("lets a system admin through without group permissions", async () => {
    const router = await loadAt("/documents", meResponse(true, []));

    expect(await screen.findByText("documents page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/documents");
  });
});
