import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { GroupProvider } from "./auth/GroupContext";
import { queryClient } from "./data/queryClient";
import { appTheme } from "./theme/appTheme";
import { MantineProvider, Notifications } from "./ui";
import "@bcgov/bc-sans/css/BC_Sans.css";
import "@bcgov/design-tokens/css/variables.css";
import "./ui/bcds-button.css";
import "./ui/bcds-status-badge.css";
import "./ui/bcds-divider.css";
import "./ui/bcds-form-field.css";
import "./ui/bcds-select.css";
import "./ui/bcds-modal.css";
import "./ui/bcds-panel-stat.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./ui/bcds-mantine-fallbacks.css";
import "./ui/bcds-upload-panel.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <GroupProvider>
        <QueryClientProvider client={queryClient}>
          <MantineProvider defaultColorScheme="light" theme={appTheme}>
            <Notifications position="top-right" />
            <App />
          </MantineProvider>
        </QueryClientProvider>
      </GroupProvider>
    </AuthProvider>
  </StrictMode>,
);
