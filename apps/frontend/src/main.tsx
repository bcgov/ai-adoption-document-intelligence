import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { GroupProvider } from "./auth/GroupContext";
import { queryClient } from "./data/queryClient";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import { ErrorBoundary } from "./components";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GroupProvider>
          <QueryClientProvider client={queryClient}>
            <MantineProvider defaultColorScheme="dark">
              <Notifications position="top-right" />
              <App />
            </MantineProvider>
          </QueryClientProvider>
        </GroupProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
