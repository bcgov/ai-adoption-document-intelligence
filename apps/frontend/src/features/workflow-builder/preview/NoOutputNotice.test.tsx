/**
 * Unit tests for `NoOutputNotice` — batch-four items 10 and 11 of the
 * Inderdeep UX review (2026-08-06).
 *
 * Item 11: the only genuine failure on the preview surface rendered as a grey,
 * action-free sentence — dimmer than the (non-failure) cache-evicted Alert
 * next to it, silent about the cause, and offering nothing to do next. These
 * specs pin the three things that changed: the error treatment, the engine's
 * own reason text, and the Re-run action.
 *
 * Item 10: the load-bearing guard is that a step which SUCCEEDED never gets
 * that treatment. `noOutputReasonForNode` maps a succeeded node with no cache
 * row to `evicted`, so this file asserts that reason (and every other
 * non-failure reason) renders without the error tone. The neutral styling of
 * the evicted Alert itself is covered in `CacheEvictedAlert.test.tsx`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRunStateContextValue,
  type RunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import { NoOutputNotice } from "./NoOutputNotice";
import { NO_OUTPUT_REASONS, noOutputReasonForNode } from "./no-output-state";

// React Flow supplies the node id through context to anything rendered inside
// a custom node. Mocking the hook is how a bare render stands in for "mounted
// on a node card" (nodeId set) versus "mounted from an edge's wire-peek
// popover" (nodeId null) without booting a whole ReactFlow instance.
const flow = vi.hoisted(() => ({ nodeId: "node-1" as string | null }));
vi.mock("@xyflow/react", () => ({ useNodeId: () => flow.nodeId }));

const WORKFLOW_ID = "wf-abc";
const RUN_ID = "run-1";
const NODE_ID = "node-1";

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function renderNotice(
  reason: (typeof NO_OUTPUT_REASONS)[number],
  ctx: RunStateContextValue = buildRunStateContextValue({
    workflowId: WORKFLOW_ID,
    activeRunId: RUN_ID,
    nodeStatuses: {
      [NODE_ID]: { status: "failed", errorMessage: "Activity task failed" },
    },
  }),
): void {
  render(
    <MantineProvider>
      <RunStateTestProvider value={ctx}>
        <NoOutputNotice reason={reason} />
      </RunStateTestProvider>
    </MantineProvider>,
  );
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  flow.nodeId = NODE_ID;
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Item 11 — the failure surface
// ---------------------------------------------------------------------------

describe("item 11 — a failed step is drawn as an error, explained, and actionable", () => {
  it("uses the error treatment rather than the dimmed one", () => {
    renderNotice("failed");

    const alert = screen.getByTestId("no-output-failed");
    expect(alert.getAttribute("data-tone")).toBe("error");
    expect(alert).toHaveTextContent("This step failed");
  });

  it("shows the engine's own error message as the reason", () => {
    renderNotice("failed");

    expect(screen.getByTestId("step-failed-reason")).toHaveTextContent(
      "Reason: Activity task failed",
    );
  });

  it("says so plainly when the engine reported no error detail", () => {
    renderNotice(
      "failed",
      buildRunStateContextValue({
        workflowId: WORKFLOW_ID,
        activeRunId: RUN_ID,
        nodeStatuses: { [NODE_ID]: { status: "failed" } },
      }),
    );

    expect(screen.getByTestId("step-failed-reason")).toHaveTextContent(
      "The engine reported no error detail for this step.",
    );
  });

  it("offers a Re-run that refetches the run's input and starts a fresh try", async () => {
    const setActiveRunId = vi.fn();
    const setIsReplay = vi.fn();
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ initialCtx: { documentUrl: "" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          workflowId: "run-2",
          workflowVersionId: "v1",
          status: "started",
        }),
      );

    renderNotice(
      "failed",
      buildRunStateContextValue({
        workflowId: WORKFLOW_ID,
        activeRunId: RUN_ID,
        setActiveRunId,
        setIsReplay,
        nodeStatuses: {
          [NODE_ID]: { status: "failed", errorMessage: "Activity task failed" },
        },
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-failed-rerun"));
    });

    await waitFor(() => {
      expect(setActiveRunId).toHaveBeenCalledWith("run-2");
    });
    expect(setIsReplay).toHaveBeenCalledWith(false);

    const [inputCtxUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(inputCtxUrl).toContain(
      `/workflows/${WORKFLOW_ID}/runs/${RUN_ID}/input-ctx`,
    );
    const [triesUrl, triesInit] = fetchSpy.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(triesUrl).toContain(`/workflows/${WORKFLOW_ID}/tries`);
    expect(triesInit.method).toBe("POST");
  });

  it("reports a re-run that failed, and lets the user dismiss it and try again", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "boom" }, { status: 500 }),
    );

    renderNotice("failed");

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-failed-rerun"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-failed-rerun-error")).toHaveTextContent(
        "Re-run failed: boom",
      );
    });
    expect(screen.getByTestId("step-failed-rerun")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("step-failed-rerun-dismiss"));
    await waitFor(() => {
      expect(screen.queryByTestId("step-failed-rerun-error")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // I5 (2026-08-14) — the CTA is recoverable, so it must not be painted as a
  // destructive one, and it must say what it really re-runs.
  // -------------------------------------------------------------------------

  it("draws the Re-run CTA as an outlined button, not the destructive filled red", () => {
    renderNotice("failed");

    const button = screen.getByTestId("step-failed-rerun");
    expect(button.getAttribute("data-variant")).toBe("outline");
    expect(button.getAttribute("data-variant")).not.toBe("filled");
  });

  it("keeps the whole-workflow label and says the scope in the card", () => {
    // `onRerun` POSTs `/tries`, which starts a fresh execution of the entire
    // graph — there is no re-execute-one-step endpoint — so "Try again" would
    // be a lie and the card carries the scope in words.
    renderNotice("failed");

    expect(screen.getByTestId("step-failed-rerun")).toHaveTextContent(
      "Re-run workflow",
    );
    expect(screen.getByTestId("step-failed-rerun-scope")).toHaveTextContent(
      "Runs the whole workflow again from the start, with the same input.",
    );
  });

  it("omits the per-node reason from the wire peek, where no node owns the popover", () => {
    // The wire-peek popover renders from an edge: there is no node context, so
    // the component must not guess whose error it is.
    flow.nodeId = null;
    renderNotice("failed");

    expect(
      screen.getByTestId("no-output-failed").getAttribute("data-tone"),
    ).toBe("error");
    expect(screen.queryByTestId("step-failed-reason")).toBeNull();
  });

  it("does not offer a Re-run when there is no run to re-run", () => {
    renderNotice(
      "failed",
      buildRunStateContextValue({ workflowId: WORKFLOW_ID, activeRunId: null }),
    );

    expect(screen.queryByTestId("step-failed-rerun")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Item 10 — a succeeded step must never wear the failure treatment
// ---------------------------------------------------------------------------

describe("item 10 — only a failure gets the failure treatment", () => {
  it("maps a succeeded node with no cache row to `evicted`, not `failed`", () => {
    expect(
      noOutputReasonForNode({
        status: "succeeded",
        runFinished: true,
        producesOutput: true,
        hasActiveRun: true,
      }),
    ).toBe("evicted");
  });

  it("renders no error tone for any reason other than `failed`", () => {
    for (const reason of NO_OUTPUT_REASONS) {
      if (reason === "failed") continue;
      const { unmount } = render(
        <MantineProvider>
          <RunStateTestProvider
            value={buildRunStateContextValue({
              workflowId: WORKFLOW_ID,
              activeRunId: RUN_ID,
            })}
          >
            <NoOutputNotice reason={reason} />
          </RunStateTestProvider>
        </MantineProvider>,
      );
      expect(screen.queryByTestId("no-output-failed")).toBeNull();
      const notice = screen.queryByTestId(`no-output-${reason}`);
      if (notice !== null) {
        expect(notice.getAttribute("data-tone")).not.toBe("error");
      }
      unmount();
    }
  });
});
