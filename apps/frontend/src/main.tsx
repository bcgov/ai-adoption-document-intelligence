import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { GroupProvider } from "./auth/GroupContext";
import { queryClient } from "./data/queryClient";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </StrictMode>,
);
