/**
 * Unit tests for `NodeResultStrip` + `IdleNodeResultStrip` (UX walkthrough
 * 2026-08-06, item 9, Option C).
 *
 * The headline assertion is CONSTANT HEIGHT. Item 9 is a reflow bug: the card
 * mounted the full `PreviewWidget` inline, so pressing Try grew it by up to
 * 200px into dagre's 60px `nodesep` — twice, once for the loading skeleton and
 * again for the content — and the nodes visibly overlapped. The fix is that
 * every state of the strip renders through one shell at exactly
 * `PREVIEW_STRIP_HEIGHT_PX`, so the height table below is written to fail the
 * moment a new state builds its own wrapper.
 *
 * jsdom runs no layout, so the assertions read the inline `style` the shell
 * sets, not `offsetHeight`.
 *
 * Provider harness + fetch spy follow `PreviewWidget.test.tsx`; the popover's
 * body is a stub, because this file is about the strip and the selection it
 * shares with the popover, not about the widget inside it.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import {
  IdleNodeResultStrip,
  NodeResultStrip,
  type NodeResultStripProps,
  PREVIEW_STRIP_HEIGHT_PX,
  PREVIEW_STRIP_MARGIN_TOP_PX,
  type ResultDetailArgs,
} from "./NodeResultStrip";
import { NO_OUTPUT_REASONS, type PreviewState } from "./no-output-state";
import type {
  ActivityOutputPreview,
  PreviewOutputBinding,
} from "./preview.types";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "wf-abc";
const NODE_ID = "node-1";
const RUN_ID = "run-xyz";

const STRIP_TESTID = `node-result-strip-${NODE_ID}`;

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function buildRow(
  outputKind: ActivityOutputPreview["outputKind"],
  outputCtx: Record<string, unknown>,
): ActivityOutputPreview {
  return {
    outputCtx,
    outputKind,
    createdAt: "2026-08-08T12:00:00.000Z",
    expiresAt: "2026-08-09T12:00:00.000Z",
  };
}

/** The batch endpoint's body: `{ previews: { [nodeId]: row } }`. */
function rowResponse(row: ActivityOutputPreview): Response {
  return jsonResponse({ previews: { [NODE_ID]: row } });
}

/** The batch endpoint's "no fresh row for this node" signal. */
function emptyBatchResponse(): Response {
  return jsonResponse({ previews: {} });
}

function renderWithProviders(children: ReactNode): { unmount: () => void } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value = buildRunStateContextValue({
    workflowId: WORKFLOW_ID,
    activeRunId: RUN_ID,
  });
  const view = render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RunStateTestProvider value={value}>{children}</RunStateTestProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { unmount: view.unmount };
}

const NODE_OUT: PreviewOutputBinding[] = [
  { port: "out", label: "out", ctxKey: "nodeOut" },
];

const TWO_OUTPUTS: PreviewOutputBinding[] = [
  {
    port: "first",
    label: "document",
    ctxKey: "firstOut",
    kind: "Document",
  },
  {
    port: "second",
    label: "label",
    ctxKey: "secondOut",
    kind: "Classification",
  },
];

/** The popover body, stubbed — this file tests the strip, not the widget. */
const detailStub = (): ReactNode => <div data-testid="detail" />;

function renderStrip(props: Partial<NodeResultStripProps> = {}): {
  unmount: () => void;
} {
  return renderWithProviders(
    <NodeResultStrip
      workflowId={WORKFLOW_ID}
      nodeId={NODE_ID}
      renderDetail={detailStub}
      {...props}
    />,
  );
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The height contract — the whole point of item 9
// ---------------------------------------------------------------------------

/** How each case's batch fetch behaves. */
type FetchMode = "never-resolves" | "fails" | "no-row" | "row";

interface StripCase {
  label: string;
  fetch: FetchMode;
  props: Partial<NodeResultStripProps>;
  state: PreviewState;
}

/**
 * Every state the strip can render, including one per `NoOutputReason` except
 * `not-previewable` (which renders nothing — see its own test below). The
 * exhaustiveness guard underneath keeps this table honest as reasons are
 * added.
 */
const STRIP_CASES: StripCase[] = [
  {
    label: "loading",
    fetch: "never-resolves",
    props: { runId: RUN_ID, outputs: NODE_OUT },
    state: "loading",
  },
  {
    label: "error",
    fetch: "fails",
    props: { runId: RUN_ID, outputs: NODE_OUT },
    state: "error",
  },
  {
    label: "ready",
    fetch: "row",
    props: { runId: RUN_ID, outputs: NODE_OUT },
    state: "ready",
  },
  {
    label: "a row that holds nothing at the bound key",
    fetch: "row",
    props: { runId: RUN_ID, outputs: [] },
    state: "empty",
  },
  {
    label: "no run selected",
    fetch: "no-row",
    props: { outputs: NODE_OUT },
    state: "no-run",
  },
  {
    label: "the run has not reached this step",
    fetch: "no-row",
    props: { runId: RUN_ID, outputs: NODE_OUT },
    state: "not-started",
  },
  {
    label: "running now",
    fetch: "no-row",
    props: { runId: RUN_ID, outputs: NODE_OUT, nodeStatus: "running" },
    state: "running",
  },
  {
    label: "a branch the run never took",
    fetch: "no-row",
    props: { runId: RUN_ID, outputs: NODE_OUT, isReplay: true },
    state: "branch-not-taken",
  },
  {
    label: "failed",
    fetch: "no-row",
    props: {
      runId: RUN_ID,
      outputs: NODE_OUT,
      isReplay: true,
      nodeStatus: "failed",
    },
    state: "failed",
  },
  {
    label: "cancelled",
    fetch: "no-row",
    props: {
      runId: RUN_ID,
      outputs: NODE_OUT,
      isReplay: true,
      nodeStatus: "cancelled",
    },
    state: "cancelled",
  },
  {
    label: "finished but the cache row is still in flight",
    fetch: "no-row",
    props: { runId: RUN_ID, outputs: NODE_OUT, nodeStatus: "succeeded" },
    state: "awaiting-cache",
  },
  {
    label: "a genuine TTL eviction in replay",
    fetch: "no-row",
    props: {
      runId: RUN_ID,
      outputs: NODE_OUT,
      isReplay: true,
      nodeStatus: "succeeded",
    },
    state: "evicted",
  },
  {
    label: "an activity that never caches its output",
    fetch: "no-row",
    props: {
      runId: RUN_ID,
      outputs: NODE_OUT,
      nodeStatus: "succeeded",
      neverCached: true,
    },
    state: "not-cached",
  },
];

function mockFetch(mode: FetchMode): void {
  switch (mode) {
    case "never-resolves":
      fetchSpy.mockImplementation(
        () =>
          new Promise<Response>(() => {
            // never resolves, so the hook stays in isLoading
          }),
      );
      return;
    case "fails":
      // 403 — non-transient, so the hook surfaces it without retrying.
      fetchSpy.mockImplementation(() =>
        Promise.resolve(jsonResponse({ message: "Boom" }, { status: 403 })),
      );
      return;
    case "no-row":
      fetchSpy.mockImplementation(() => Promise.resolve(emptyBatchResponse()));
      return;
    case "row":
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          rowResponse(buildRow("Document", { nodeOut: "a scanned invoice" })),
        ),
      );
      return;
  }
}

describe("NodeResultStrip — the card's height never changes", () => {
  it.each(
    STRIP_CASES,
  )("is exactly PREVIEW_STRIP_HEIGHT_PX tall for $label", async ({
    fetch,
    props,
    state,
  }) => {
    mockFetch(fetch);
    renderStrip(props);

    const strip = await screen.findByTestId(STRIP_TESTID);
    await waitFor(() => {
      expect(strip).toHaveAttribute("data-state", state);
    });
    // Inline style, not offsetHeight: jsdom runs no layout. A state that
    // built its own wrapper instead of `StripShell` would fail here — which
    // is how the 200px inline preview reflowed the graph in the first place.
    expect(strip.style.height).toBe(`${PREVIEW_STRIP_HEIGHT_PX}px`);
    expect(strip.style.marginTop).toBe(`${PREVIEW_STRIP_MARGIN_TOP_PX}px`);
    // No min-height / max-height escape hatch: those are how a "fixed"
    // height silently becomes content-driven again.
    expect(strip.style.minHeight).toBe("");
    expect(strip.style.maxHeight).toBe("");
    /*
     * And the same guarantee sideways. A node card is shrink-to-fit, so a
     * child with `width: 100%` still reports its CONTENT as its preferred
     * width and drags the card out with it: measured in Chromium, the
     * try-in-place demo's upload card went 200px → 606px the moment a long
     * DocumentRef landed in the strip. `width: 0` contributes nothing to the
     * card's intrinsic width; `minWidth: 100%` fills whatever the card's
     * other rows settled on.
     */
    expect(strip.style.width).toBe("0px");
    expect(strip.style.minWidth).toBe("100%");
  });

  it("is the same height at idle, before any run exists", () => {
    renderWithProviders(<IdleNodeResultStrip nodeId={NODE_ID} />);
    const strip = screen.getByTestId(STRIP_TESTID);
    expect(strip.style.height).toBe(`${PREVIEW_STRIP_HEIGHT_PX}px`);
    expect(strip.style.marginTop).toBe(`${PREVIEW_STRIP_MARGIN_TOP_PX}px`);
  });

  it("covers every NoOutputReason that draws a strip", () => {
    // The reasons are a closed union; this keeps the table above from silently
    // missing one added later, whose shell nobody would then be testing.
    const covered = new Set(STRIP_CASES.map((testCase) => testCase.state));
    const missing = NO_OUTPUT_REASONS.filter(
      // `not-previewable` is `silent` — it renders nothing at all.
      (reason) => reason !== "not-previewable" && !covered.has(reason),
    );
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The state is observable
// ---------------------------------------------------------------------------

describe("NodeResultStrip — states are named on the element", () => {
  it("carries the node id in its test id and the PreviewState in data-state", async () => {
    mockFetch("row");
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    const strip = await screen.findByTestId(STRIP_TESTID);
    await waitFor(() => {
      expect(strip).toHaveAttribute("data-state", "ready");
    });
  });

  it("spends the whole line on the value when a node has one output", async () => {
    mockFetch("row");
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    expect(
      await screen.findByTestId(`strip-summary-${NODE_ID}`),
    ).toHaveTextContent("a scanned invoice");
    // The kind is on the card already (the output port's kind pill, and the
    // port rows on an activity card). Repeating it here cost the value its
    // room: on the try-in-place demo's 200px upload card, "DocumentRef" left
    // the DocumentRef itself rendering as "seedd…".
    expect(screen.queryByTestId(`strip-port-${NODE_ID}`)).toBeNull();
  });

  it("collapses a multi-line value onto the single line", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        rowResponse(
          buildRow("Document", { nodeOut: "\n\n  first   line\nsecond line" }),
        ),
      ),
    );
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    const summary = await screen.findByTestId(`strip-summary-${NODE_ID}`);
    expect(summary).toHaveTextContent("first line");
    expect(summary.textContent).not.toContain("second line");
  });

  it("names the port when a node has several outputs", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        rowResponse(
          buildRow("Document", {
            firstOut: "alpha value",
            secondOut: "beta value",
          }),
        ),
      ),
    );
    renderStrip({ runId: RUN_ID, outputs: TWO_OUTPUTS });

    // With a port selection in play — the popover's chips can change it — the
    // author has to know WHICH output this line is describing.
    expect(
      await screen.findByTestId(`strip-port-${NODE_ID}`),
    ).toHaveTextContent("document");
  });

  it("still summarises a value whose kind nothing declares", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(rowResponse(buildRow(null, { nodeOut: "plain text" }))),
    );
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    expect(
      await screen.findByTestId(`strip-summary-${NODE_ID}`),
    ).toHaveTextContent("plain text");
    expect(screen.queryByTestId(`strip-port-${NODE_ID}`)).toBeNull();
  });

  it("renders NOTHING for a control-flow node rather than an empty band", async () => {
    mockFetch("no-row");
    renderStrip({
      runId: RUN_ID,
      isReplay: true,
      nodeStatus: "succeeded",
      producesOutput: false,
    });

    // `not-previewable` is `silent`: a row of identical "doesn't produce
    // output" bands would paper the canvas. Zero height is as constant as
    // 24px is, so the no-reflow guarantee still holds.
    await waitFor(() => {
      expect(screen.queryByTestId(STRIP_TESTID)).toBeNull();
    });
    expect(screen.queryByTestId(`strip-label-${NODE_ID}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The idle strip — the reserved space, and the reason it must not fetch
// ---------------------------------------------------------------------------

describe("IdleNodeResultStrip", () => {
  it("says the workflow has not been run, and fires no request", () => {
    renderWithProviders(<IdleNodeResultStrip nodeId={NODE_ID} />);

    const strip = screen.getByTestId(STRIP_TESTID);
    expect(strip).toHaveAttribute("data-state", "no-run");
    expect(strip).toHaveTextContent("Not run yet");
    // `useActivityOutputPreview` with no runId returns each node's most-recent
    // row from a PRIOR run; showing last week's output as current state is
    // worse than showing nothing, so the idle strip calls no hook at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens its own explanation in the popover", async () => {
    renderWithProviders(<IdleNodeResultStrip nodeId={NODE_ID} />);

    fireEvent.click(screen.getByTestId(STRIP_TESTID));
    const detail = await screen.findByTestId(`node-result-detail-${NODE_ID}`);
    expect(detail).toHaveTextContent("Run this workflow");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The popover — where the full preview went
// ---------------------------------------------------------------------------

describe("NodeResultStrip — the popover behind the strip", () => {
  it("opens on click and closes on the next one", async () => {
    mockFetch("row");
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    const strip = await screen.findByTestId(STRIP_TESTID);
    expect(screen.queryByTestId("detail")).toBeNull();

    fireEvent.click(strip);
    // Mantine renders the dropdown in a portal, so query the whole document.
    expect(await screen.findByTestId("detail")).toBeInTheDocument();

    fireEvent.click(strip);
    await waitFor(() => {
      expect(screen.queryByTestId("detail")).toBeNull();
    });
  });

  it("labels the strip for screen readers and flips aria-expanded", async () => {
    mockFetch("row");
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT });

    const strip = await screen.findByTestId(STRIP_TESTID);
    await waitFor(() => {
      expect(strip).toHaveAttribute("data-state", "ready");
    });
    // The strip is a button whose visible text is a truncated one-liner, so
    // the accessible name has to carry the state and the summary itself.
    expect(strip.getAttribute("aria-label")).toContain("a scanned invoice");
    expect(strip).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(strip);
    await waitFor(() => {
      expect(strip).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("names the no-output state in the aria-label too", async () => {
    mockFetch("no-row");
    renderStrip({ runId: RUN_ID, outputs: NODE_OUT, nodeStatus: "failed" });

    const strip = await screen.findByTestId(STRIP_TESTID);
    await waitFor(() => {
      expect(strip).toHaveAttribute("data-state", "failed");
    });
    expect(strip.getAttribute("aria-label")).toContain("Failed");
  });

  /**
   * The reason `selectedPort` lives on the STRIP and is passed down, rather
   * than being a second `useState` inside the popover: the card's one-line
   * summary and the panel it opens must always be describing the same port.
   */
  it("re-summarises the port the popover selects", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        rowResponse(
          buildRow("Document", {
            firstOut: "alpha value",
            secondOut: "beta value",
          }),
        ),
      ),
    );

    renderWithProviders(
      <NodeResultStrip
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        outputs={TWO_OUTPUTS}
        renderDetail={({ selectedPort, onSelectPort }: ResultDetailArgs) => (
          <div data-testid="detail" data-selected-port={selectedPort ?? ""}>
            <button
              type="button"
              data-testid="pick-second"
              onClick={() => onSelectPort("second")}
            >
              second
            </button>
          </div>
        )}
      />,
    );

    const strip = await screen.findByTestId(STRIP_TESTID);
    expect(
      await screen.findByTestId(`strip-summary-${NODE_ID}`),
    ).toHaveTextContent("alpha value");

    fireEvent.click(strip);
    fireEvent.click(await screen.findByTestId("pick-second"));

    await waitFor(() => {
      expect(screen.getByTestId(`strip-summary-${NODE_ID}`)).toHaveTextContent(
        "beta value",
      );
    });
    // Kind follows the same selection — the two can never disagree.
    expect(screen.getByTestId(`strip-port-${NODE_ID}`)).toHaveTextContent(
      "label",
    );
    expect(screen.getByTestId("detail")).toHaveAttribute(
      "data-selected-port",
      "second",
    );
  });
});
