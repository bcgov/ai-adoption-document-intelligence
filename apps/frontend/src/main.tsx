import { ModalsProvider } from "@mantine/modals";
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
import { ErrorBoundary } from "./components";

/**
 * How far down the viewport a toast starts, in px.
 *
 * Mantine pins a `top-right` toast 16px from the top, which put it ON TOP of
 * the chrome it was reporting on. Found in the workflow editor (Inderdeep UX
 * review batch four): the orphaned-delete toast covered the top bar's Save /
 * Try / Run / More group for its whole 8-second life, and the e2e caught it as
 * `topbar-more-button` being intercepted. Because this component is global, the
 * same toast also sat over the app header's user menu on EVERY page.
 *
 * Measured in Chromium at 1280x720 and 1280x800 — identical at both, because
 * all of this chrome is fixed-height:
 *
 *   app header (`.mantine-AppShell-header`)   0 →  65
 *   workflow editor top bar                  65 → 112
 *   toast, before this change                16 → 110   ← covers both
 *
 * So 112 + an 8px gap. On pages with no action bar of their own the toast just
 * starts a little lower, which costs nothing; a toast that hides a live control
 * costs a click the user cannot make.
 */
const NOTIFICATIONS_TOP_OFFSET = 120;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GroupProvider>
          <QueryClientProvider client={queryClient}>
            <MantineProvider defaultColorScheme="light" theme={appTheme}>
              <ModalsProvider>
                <Notifications
                  position="top-right"
                  style={{
                    top: NOTIFICATIONS_TOP_OFFSET,
                    // The container is a 440px-wide `position: fixed` box that
                    // exists whether or not anything is in it. Sitting at 16px
                    // it overlapped only the app header; moved down to clear
                    // the page action bar it lands ON the canvas, and the
                    // workflow-builder e2e caught it immediately — node clicks
                    // and wire hovers in the top-right quadrant were being
                    // swallowed by an EMPTY toast container. The container must
                    // never take a pointer event; the toasts inside it must,
                    // because they carry a close button and an Undo link.
                    pointerEvents: "none",
                  }}
                  styles={{ notification: { pointerEvents: "auto" } }}
                />
                <App />
              </ModalsProvider>
            </MantineProvider>
          </QueryClientProvider>
        </GroupProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
