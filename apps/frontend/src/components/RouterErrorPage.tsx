import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useRouteError } from "react-router-dom";
import { apiService } from "../data/services/api.service";

/**
 * React Router error page rendered via the `errorElement` prop on route
 * definitions. Catches errors thrown during route component rendering —
 * i.e. anything inside RootLayout and its children. It does NOT catch errors
 * in providers above the router (AuthProvider, GroupProvider,
 * QueryClientProvider); those are handled by the React ErrorBoundary in
 * main.tsx.
 *
 * Reports the error to the backend logging endpoint and navigates the user
 * back to the home page.
 */
export const RouterErrorPage = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  const message = error instanceof Error ? error.message : String(error);
  const errorStack =
    error instanceof Error ? (error.stack ?? undefined) : undefined;

  useEffect(() => {
    void apiService.post("client-errors", {
      message,
      errorStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }, [message, errorStack]);

  return (
    <Center style={{ height: "100vh" }}>
      <Stack align="center" gap="md">
        <Title order={2}>Something went wrong</Title>
        <Text c="dimmed">
          An unexpected error occurred. Please try again or contact support if
          the problem persists.
        </Text>
        <Button variant="filled" onClick={() => navigate("/")}>
          Go to home page
        </Button>
      </Stack>
    </Center>
  );
};
