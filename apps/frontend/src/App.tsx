import { createBrowserRouter, RouterProvider } from "react-router-dom";
import {
  GroupPermissionGuard,
  MembershipPageGuard,
  NoGroupGuard,
} from "./auth/NoGroupGuard";
import { useAuth } from "./auth/useAuth";
import { Stack, Text, Title } from "./ui";
import "./App.css";
import { Login, RouterErrorPage } from "./components";
import { RootLayout } from "./layouts/RootLayout";
import { RequestMembershipPage } from "./pages/RequestMembershipPage";
import { appRoutes } from "./routes.config";

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
    errorElement: <RouterErrorPage />,
    children: appRoutes.map(({ nav: _nav, permissions, ...r }) => ({
      ...r,
      element: permissions?.length ? (
        <GroupPermissionGuard requiredPermissions={permissions}>
          {r.element}
        </GroupPermissionGuard>
      ) : (
        r.element
      ),
    })),
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
