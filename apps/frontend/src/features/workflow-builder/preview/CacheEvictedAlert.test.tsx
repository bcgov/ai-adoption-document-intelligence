/**
 * Unit tests for `CacheEvictedAlert` (US-155 Scenarios 1 → 6).
 *
 * The Alert encapsulates the entire Re-run flow: input-ctx fetch, fresh
 * `/runs` POST, and `RunStateContext` state transitions. Tests stub
 * `globalThis.fetch` so both endpoints are covered without MSW, mirroring
 * the convention used by `PreviewWidget.test.tsx` and the sibling Phase 4
 * hook tests.
 *
 * Scenarios covered (one `describe` block per scenario; multiple `it`s
 * where the scenario demands more than one assertion):
 *
 *   - Scenario 1: default Alert renders with Re-run button.
 *   - Scenario 3: clicking Re-run fetches input-ctx, POSTs `/runs`, and
 *                 toggles `setActiveRunId` + `setIsReplay(false)`.
 *   - Scenario 4: while the requests are in flight the button shows a
 *                 Loader, is disabled, and the Alert text reads
 *                 "Re-running...".
 *   - Scenario 5: a 404 from the input-ctx endpoint flips the Alert into
 *                 the retention-cleaned variant + exposes a Close link
 *                 that restores the default Alert.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRunStateContextValue,
  type RunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "wf-abc";
const RUN_ID = "run-old";
const NODE_ID = "node-1";
const NEW_RUN_ID = "run-new";

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

interface RenderOpts {
  /** Override the run-state context value to inspect setter calls. */
  contextValue?: RunStateContextValue;
}

function renderAlert(opts: RenderOpts = {}): {
  unmount: () => void;
  ctx: RunStateContextValue;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ctx =
    opts.contextValue ??
    buildRunStateContextValue({
      workflowId: WORKFLOW_ID,
      activeRunId: RUN_ID,
      isReplay: true,
    });
  const ui: ReactNode = (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RunStateTestProvider value={ctx}>
          <CacheEvictedAlert
            workflowId={WORKFLOW_ID}
            runId={RUN_ID}
            nodeId={NODE_ID}
          />
        </RunStateTestProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
  const view = render(ui);
  return { unmount: view.unmount, ctx };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — default Alert renders + Re-run button visible
// ---------------------------------------------------------------------------

describe("Scenario 1 — default Alert + Re-run button", () => {
  it("renders the default text + the Re-run button", () => {
    renderAlert();

    const text = screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`);
    expect(text).toHaveTextContent(
      "Preview unavailable — cache evicted. Re-run to repopulate.",
    );

    const button = screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`);
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Re-run");
    expect(button).not.toBeDisabled();

    // Initial mode is `idle` so no Close link should render yet.
    expect(screen.queryByTestId(`cache-evicted-close-${NODE_ID}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Re-run fetches input-ctx + POSTs /runs + toggles
// `setActiveRunId` + `setIsReplay(false)`.
// ---------------------------------------------------------------------------

describe("Scenario 3 — Re-run fetches input-ctx then POSTs /runs", () => {
  it("calls the two endpoints in order and updates RunStateContext", async () => {
    const initialCtx = { documentUrl: "blob://group-1/doc-1.pdf" };
    fetchSpy.mockImplementation(
      (url: RequestInfo | URL, init?: RequestInit) => {
        const u = url.toString();
        if (u.includes("/input-ctx")) {
          return Promise.resolve(jsonResponse({ initialCtx }));
        }
        if (
          u.endsWith(`/workflows/${WORKFLOW_ID}/runs`) &&
          init?.method === "POST"
        ) {
          return Promise.resolve(
            jsonResponse({
              workflowId: NEW_RUN_ID,
              workflowVersionId: "wv-1",
              status: "started",
            }),
          );
        }
        return Promise.reject(new Error(`unexpected URL: ${u}`));
      },
    );

    const setActiveRunId = vi.fn();
    const setIsReplay = vi.fn();
    const ctx = buildRunStateContextValue({
      workflowId: WORKFLOW_ID,
      activeRunId: RUN_ID,
      isReplay: true,
      setActiveRunId,
      setIsReplay,
    });

    renderAlert({ contextValue: ctx });

    const button = screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`);
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(setActiveRunId).toHaveBeenCalledWith(NEW_RUN_ID);
    });
    expect(setIsReplay).toHaveBeenCalledWith(false);

    // Both endpoints were called.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstCallUrl = String(fetchSpy.mock.calls[0][0]);
    const firstCallInit = fetchSpy.mock.calls[0][1];
    expect(firstCallUrl).toContain(
      `/workflows/${WORKFLOW_ID}/runs/${RUN_ID}/input-ctx`,
    );
    expect(firstCallInit?.method).toBe("GET");

    const secondCallUrl = String(fetchSpy.mock.calls[1][0]);
    const secondCallInit = fetchSpy.mock.calls[1][1];
    expect(secondCallUrl).toContain(`/workflows/${WORKFLOW_ID}/runs`);
    expect(secondCallInit?.method).toBe("POST");
    expect(secondCallInit?.body).toBe(JSON.stringify({ initialCtx }));

    // After the success path the Alert returns to idle.
    const alert = screen.getByTestId(`cache-evicted-alert-${NODE_ID}`);
    expect(alert.getAttribute("data-mode")).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — loading state shows Loader + disables the button
// ---------------------------------------------------------------------------

describe("Scenario 4 — loading state on Re-run", () => {
  it("shows a Loader, disables the button, and flips the text to 'Re-running...'", async () => {
    // Resolve input-ctx instantly; hold `/runs` POST open so we can
    // inspect the in-flight UI state without races.
    let resolveRunsPost: (value: Response) => void = () => undefined;
    const runsPostPromise = new Promise<Response>((res) => {
      resolveRunsPost = res;
    });
    fetchSpy.mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("/input-ctx")) {
        return Promise.resolve(jsonResponse({ initialCtx: { foo: "bar" } }));
      }
      return runsPostPromise;
    });

    renderAlert();

    const button = screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`);
    await act(async () => {
      fireEvent.click(button);
    });

    // After the click, the Alert transitions to `rerunning` mode.
    const alert = await screen.findByTestId(`cache-evicted-alert-${NODE_ID}`);
    await waitFor(() => {
      expect(alert.getAttribute("data-mode")).toBe("rerunning");
    });

    // Text flips, button disabled, Loader rendered inside the button.
    expect(
      screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`),
    ).toHaveTextContent("Re-running...");
    expect(button).toBeDisabled();

    // Release the held POST so the test cleanup doesn't warn about an
    // open promise.
    await act(async () => {
      resolveRunsPost(
        jsonResponse({
          workflowId: NEW_RUN_ID,
          workflowVersionId: "wv-1",
          status: "started",
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — 404 path shows the retention-cleaned message + Close link
// ---------------------------------------------------------------------------

describe("Scenario 5 — 404 input-ctx path", () => {
  it("flips into retention-cleaned mode + disables the button", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        { message: "Input not available — run too old or never captured" },
        { status: 404 },
      ),
    );

    renderAlert();

    const button = screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`);
    await act(async () => {
      fireEvent.click(button);
    });

    const alert = await screen.findByTestId(`cache-evicted-alert-${NODE_ID}`);
    await waitFor(() => {
      expect(alert.getAttribute("data-mode")).toBe("retention-cleaned");
    });
    expect(
      screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`),
    ).toHaveTextContent(
      "Re-run unavailable — historical input has been retention-cleaned",
    );
    expect(button).toBeDisabled();

    // The Close link is exposed only in this mode.
    const closeLink = screen.getByTestId(`cache-evicted-close-${NODE_ID}`);
    expect(closeLink).toBeInTheDocument();

    // Only one fetch happened (input-ctx). No `/runs` POST attempted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Close link clears the indicator + returns to the default Alert", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 404 }));

    renderAlert();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));
    });

    const alert = await screen.findByTestId(`cache-evicted-alert-${NODE_ID}`);
    await waitFor(() => {
      expect(alert.getAttribute("data-mode")).toBe("retention-cleaned");
    });

    fireEvent.click(screen.getByTestId(`cache-evicted-close-${NODE_ID}`));

    await waitFor(() => {
      expect(alert.getAttribute("data-mode")).toBe("idle");
    });
    expect(
      screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`),
    ).toHaveTextContent(
      "Preview unavailable — cache evicted. Re-run to repopulate.",
    );
    expect(
      screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`),
    ).not.toBeDisabled();
    expect(screen.queryByTestId(`cache-evicted-close-${NODE_ID}`)).toBeNull();
  });
});
