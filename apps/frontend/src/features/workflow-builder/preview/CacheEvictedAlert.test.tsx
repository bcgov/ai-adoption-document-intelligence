/**
 * Unit tests for `CacheEvictedAlert` (US-155 Scenarios 1 → 6).
 *
 * The Alert encapsulates the entire Re-run flow: input-ctx fetch, fresh
 * `/tries` POST, and `RunStateContext` state transitions. Tests stub
 * `globalThis.fetch` so both endpoints are covered without MSW, mirroring
 * the convention used by `PreviewWidget.test.tsx` and the sibling Phase 4
 * hook tests.
 *
 * Scenarios covered (one `describe` block per scenario; multiple `it`s
 * where the scenario demands more than one assertion):
 *
 *   - Scenario 1: default Alert renders with Re-run button.
 *   - Scenario 3: clicking Re-run fetches input-ctx, POSTs `/tries`, and
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
      "This step completed. Preview unavailable — its output isn't in the preview cache. Re-run to see it.",
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
// This Alert only ever renders for a `succeeded` / `skipped` node, whose card
// carries a green check, so its resting state must not use the failure
// treatment.
// ---------------------------------------------------------------------------

describe("an evicted preview on a succeeded step is not an error", () => {
  it("renders the idle Alert with a neutral tone, not the failure treatment", () => {
    renderAlert();

    const alert = screen.getByTestId(`cache-evicted-alert-${NODE_ID}`);
    expect(alert.getAttribute("data-mode")).toBe("idle");
    expect(alert.getAttribute("data-tone")).toBe("neutral");
    expect(alert.getAttribute("data-tone")).not.toBe("error");
  });

  it("leads with the step's verdict so the copy agrees with the green badge", () => {
    renderAlert();

    // The first thing said is that the STEP is fine; the missing thing is the
    // preview payload, not the result.
    expect(
      screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`).textContent,
    ).toMatch(/^This step completed\./);
  });

  it("keeps the error tone for a re-run that actually failed", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "boom" }, { status: 500 }),
    );

    renderAlert();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));
    });

    const alert = await screen.findByTestId(`cache-evicted-alert-${NODE_ID}`);
    await waitFor(() => {
      expect(alert.getAttribute("data-mode")).toBe("error");
    });
    expect(alert.getAttribute("data-tone")).toBe("error");
  });

  it("retries from an outlined button — a failed re-run is recoverable, not destructive", async () => {
    // Filled red is this UI's destructive treatment. The panel stays red
    // because the re-run failed; the button that repeats it does not, exactly
    // as in `NoOutputNotice`'s `StepFailedAlert`.
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "boom" }, { status: 500 }),
    );

    renderAlert();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));
    });

    const button = await screen.findByTestId(`cache-evicted-rerun-${NODE_ID}`);
    await waitFor(() => {
      expect(button.getAttribute("data-variant")).toBe("outline");
    });
    expect(button.getAttribute("data-variant")).not.toBe("filled");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Re-run fetches input-ctx + POSTs /tries + toggles
// `setActiveRunId` + `setIsReplay(false)`.
// ---------------------------------------------------------------------------

describe("Scenario 3 — Re-run fetches input-ctx then POSTs /tries", () => {
  it("calls the two endpoints in order and updates RunStateContext", async () => {
    const initialCtx = { documentUrl: "blob://group-1/doc-1.pdf" };
    fetchSpy.mockImplementation(
      (url: RequestInfo | URL, init?: RequestInit) => {
        const u = url.toString();
        if (u.includes("/input-ctx")) {
          return Promise.resolve(jsonResponse({ initialCtx }));
        }
        if (
          u.endsWith(`/workflows/${WORKFLOW_ID}/tries`) &&
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
    // Repopulating an evicted preview row is canvas iteration, so it starts
    // a Try (`/tries`), not a production run (`/runs`).
    expect(secondCallUrl).toContain(`/workflows/${WORKFLOW_ID}/tries`);
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
    // Resolve input-ctx instantly; hold the `/tries` POST open so we can
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

    // Only one fetch happened (input-ctx). No `/tries` POST attempted.
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
      "This step completed. Preview unavailable — its output isn't in the preview cache. Re-run to see it.",
    );
    expect(
      screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`),
    ).not.toBeDisabled();
    expect(screen.queryByTestId(`cache-evicted-close-${NODE_ID}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The offered remedy must not compound the problem. A Re-run POSTed with no
// `workflowVersionId` would run against head — which can be a different graph
// from the one being replayed — and appear in history as a new official
// result.
// ---------------------------------------------------------------------------

describe("CacheEvictedAlert — re-run targets the replayed version", () => {
  function replayCtx(): RunStateContextValue {
    return buildRunStateContextValue({
      workflowId: WORKFLOW_ID,
      activeRunId: RUN_ID,
      isReplay: true,
      replayVersion: { id: "v-old", versionNumber: 2 },
    });
  }

  it("re-runs the replayed version, not head", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ initialCtx: { documentId: "d1" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          workflowId: NEW_RUN_ID,
          workflowVersionId: "v-old",
          status: "started",
        }),
      );
    renderAlert({ contextValue: replayCtx() });

    await act(async () => {
      fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    const [, init] = fetchSpy.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      initialCtx: { documentId: "d1" },
      workflowVersionId: "v-old",
    });
  });

  it("names the version it will run so the user is not guessing", () => {
    renderAlert({ contextValue: replayCtx() });
    expect(
      screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`),
    ).toHaveTextContent("Re-run v2");
    expect(
      screen.getByTestId(`cache-evicted-alert-text-${NODE_ID}`),
    ).toHaveTextContent(/the version you are viewing/i);
  });

  it("still targets head when there is no version pin (not replaying)", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ initialCtx: { documentId: "d1" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          workflowId: NEW_RUN_ID,
          workflowVersionId: "v-head",
          status: "started",
        }),
      );
    renderAlert();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    const [, init] = fetchSpy.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      initialCtx: { documentId: "d1" },
    });
  });
});

// ---------------------------------------------------------------------------
// The Re-run says what it runs. It restarts the whole workflow, as the failed
// step's Re-run does, and the button sits on one step's card.
// ---------------------------------------------------------------------------

describe("CacheEvictedAlert — the Re-run's scope", () => {
  it("says next to Re-run that it runs the whole workflow from the start", () => {
    renderAlert();

    expect(
      screen.getByTestId(`cache-evicted-rerun-scope-${NODE_ID}`),
    ).toHaveTextContent(
      "Runs the whole workflow again from the start, with the same input.",
    );
  });

  it("draws that line in gray.7, which reads at more than 4.5:1 on the alert's tint", () => {
    // jsdom computes no colours, so this pins the token; the ratio itself was
    // measured in Chromium.
    renderAlert();

    expect(
      screen
        .getByTestId(`cache-evicted-rerun-scope-${NODE_ID}`)
        .getAttribute("style"),
    ).toContain("color: var(--mantine-color-gray-7)");
  });

  it("drops the line when no re-run can be offered", async () => {
    // A 404 from input-ctx means the run's input is gone: nothing can be
    // re-run, so nothing may promise it.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "not found" }, { status: 404 }),
    );
    renderAlert();

    fireEvent.click(screen.getByTestId(`cache-evicted-rerun-${NODE_ID}`));

    await waitFor(() => {
      expect(
        screen
          .getByTestId(`cache-evicted-alert-${NODE_ID}`)
          .getAttribute("data-mode"),
      ).toBe("retention-cleaned");
    });
    expect(
      screen.queryByTestId(`cache-evicted-rerun-scope-${NODE_ID}`),
    ).toBeNull();
  });
});
