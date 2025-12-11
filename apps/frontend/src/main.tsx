import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { queryClient } from "./data/queryClient";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <MantineProvider defaultColorScheme="light">
          <Notifications position="top-right" />
          <App />
        </MantineProvider>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
