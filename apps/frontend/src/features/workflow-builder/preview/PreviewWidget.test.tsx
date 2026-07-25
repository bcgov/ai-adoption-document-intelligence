/**
 * Unit tests for the `PreviewWidget` dispatch shell + `NodePreviewOverlay`
 * (US-141 Scenarios 4 + 5 + 6).
 *
 * The 4 widget components (`DocumentPreview`, `SegmentArrayPreview`,
 * `OcrResultPreview`, `ClassificationPreview`) are stubbed via
 * `vi.mock` so the shell's dispatch logic is exercised in isolation
 * from US-142 → US-145's widget bodies (which arrive in parallel).
 *
 * Fetch is stubbed via `vi.spyOn(globalThis, 'fetch')` per the
 * frontend's existing convention (no MSW in the toolkit).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import {
  NodePreviewOverlay,
  PreviewWidget,
  type PreviewWidgetProps,
} from "./PreviewWidget";
import type { ActivityOutputPreview } from "./preview.types";

// ---------------------------------------------------------------------------
// Widget stubs — each renders a single sentinel `<div>` so the test
// can assert the dispatch routed to the correct widget AND that the
// `value` prop got the right ctx slot.
// ---------------------------------------------------------------------------

vi.mock("./DocumentPreview", () => ({
  DocumentPreview: ({ value }: { value: unknown }) => (
    <div data-testid="stub-document-preview" data-value={JSON.stringify(value)}>
      DOCUMENT
    </div>
  ),
}));
vi.mock("./SegmentArrayPreview", () => ({
  SegmentArrayPreview: ({ value }: { value: unknown }) => (
    <div
      data-testid="stub-segment-array-preview"
      data-value={JSON.stringify(value)}
    >
      SEGMENTS
    </div>
  ),
}));
vi.mock("./OcrResultPreview", () => ({
  OcrResultPreview: ({ value }: { value: unknown }) => (
    <div
      data-testid="stub-ocr-result-preview"
      data-value={JSON.stringify(value)}
    >
      OCR
    </div>
  ),
}));
vi.mock("./ClassificationPreview", () => ({
  ClassificationPreview: ({ value }: { value: unknown }) => (
    <div
      data-testid="stub-classification-preview"
      data-value={JSON.stringify(value)}
    >
      CLASSIFICATION
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "wf-abc";
const NODE_ID = "node-1";
const RUN_ID = "run-xyz";

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
    createdAt: "2026-05-24T12:00:00.000Z",
    expiresAt: "2026-05-25T12:00:00.000Z",
  };
}

/**
 * The preview hook now reads the batch endpoint, whose body is a
 * `{ previews: { [nodeId]: row } }` map. Wrap a single row as this node's
 * entry so the existing dispatch-shell assertions keep working.
 */
function rowResponse(row: ActivityOutputPreview): Response {
  return jsonResponse({ previews: { [NODE_ID]: row } });
}

/** An empty batch map — the node has no fresh cache row (the batch
 * endpoint's "no row" signal, replacing the old per-node 404). */
function emptyBatchResponse(): Response {
  return jsonResponse({ previews: {} });
}

function renderWithProviders(
  children: ReactNode,
  opts?: { workflowId?: string; activeRunId?: string | null },
): { unmount: () => void; queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value = buildRunStateContextValue({
    workflowId: opts?.workflowId ?? WORKFLOW_ID,
    activeRunId: opts?.activeRunId ?? null,
  });
  const view = render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RunStateTestProvider value={value}>{children}</RunStateTestProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { unmount: view.unmount, queryClient };
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 4 — dispatch shell
// ---------------------------------------------------------------------------

describe("Scenario 4 — dispatch shell routes outputKind → widget", () => {
  const DOC_CASES: Array<ActivityOutputPreview["outputKind"]> = [
    "Document",
    "MultiPageDocument",
    "SinglePageDocument",
  ];

  for (const kind of DOC_CASES) {
    it(`routes outputKind=${kind} to DocumentPreview with ctx.document`, async () => {
      const doc = { blob: { storage_key: "abc" }, pageCount: 1 };
      fetchSpy.mockResolvedValue(rowResponse(buildRow(kind, { nodeOut: doc })));

      renderWithProviders(
        <PreviewWidget
          workflowId={WORKFLOW_ID}
          nodeId={NODE_ID}
          outputCtxKey="nodeOut"
        />,
      );

      const stub = await screen.findByTestId("stub-document-preview");
      expect(stub).toBeInTheDocument();
      expect(stub.getAttribute("data-value")).toBe(JSON.stringify(doc));
    });
  }

  it("routes outputKind=Segment[] to SegmentArrayPreview with ctx.segments", async () => {
    const segs = [{ parentDocId: "doc-1" }];
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("Segment[]", { nodeOut: segs })),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );
    const stub = await screen.findByTestId("stub-segment-array-preview");
    expect(stub.getAttribute("data-value")).toBe(JSON.stringify(segs));
  });

  const OCR_CASES: Array<ActivityOutputPreview["outputKind"]> = [
    "OcrResult",
    "OcrFields",
  ];

  for (const kind of OCR_CASES) {
    it(`routes outputKind=${kind} to OcrResultPreview with ctx.ocrResult`, async () => {
      const ocr = { fields: { foo: "bar" } };
      fetchSpy.mockResolvedValue(rowResponse(buildRow(kind, { nodeOut: ocr })));

      renderWithProviders(
        <PreviewWidget
          workflowId={WORKFLOW_ID}
          nodeId={NODE_ID}
          outputCtxKey="nodeOut"
        />,
      );
      const stub = await screen.findByTestId("stub-ocr-result-preview");
      expect(stub.getAttribute("data-value")).toBe(JSON.stringify(ocr));
    });
  }

  it("routes outputKind=Classification to ClassificationPreview with ctx.classification", async () => {
    const cls = { label: "invoice", confidence: 0.92 };
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("Classification", { nodeOut: cls })),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );
    const stub = await screen.findByTestId("stub-classification-preview");
    expect(stub.getAttribute("data-value")).toBe(JSON.stringify(cls));
  });

  // -----------------------------------------------------------------
  // Family-aware dispatch — kind-taxonomy-refinement wave retagged
  // catalog ports to shape-honest subkinds (`baseKind` → family).
  // The ctx-slot resolution must follow the family root, not the
  // exact `outputKind` string, or these fall through to no preview.
  // -----------------------------------------------------------------

  const SUBKIND_DOC_CASES: Array<ActivityOutputPreview["outputKind"]> = [
    "PreparedFile",
    "DocumentRef",
    "DocumentContent",
  ];

  for (const kind of SUBKIND_DOC_CASES) {
    it(`routes outputKind=${kind} (baseKind → Document) to DocumentPreview with ctx.document`, async () => {
      const doc = { blob: { storage_key: "abc" }, pageCount: 1 };
      fetchSpy.mockResolvedValue(rowResponse(buildRow(kind, { nodeOut: doc })));

      renderWithProviders(
        <PreviewWidget
          workflowId={WORKFLOW_ID}
          nodeId={NODE_ID}
          outputCtxKey="nodeOut"
        />,
      );

      const stub = await screen.findByTestId("stub-document-preview");
      expect(stub).toBeInTheDocument();
      expect(stub.getAttribute("data-value")).toBe(JSON.stringify(doc));
    });
  }

  it("routes outputKind=LabeledDocumentMap (baseKind → Classification) to ClassificationPreview with ctx.classification", async () => {
    const cls = { label: "invoice", confidence: 0.92 };
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("LabeledDocumentMap", { nodeOut: cls })),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );
    const stub = await screen.findByTestId("stub-classification-preview");
    expect(stub.getAttribute("data-value")).toBe(JSON.stringify(cls));
  });

  // `OcrTable`'s `baseKind` is `OcrResult` in the live registry, so
  // family-aware dispatch now routes it to `OcrResultPreview` (it IS-A
  // OcrResult) rather than falling through to null. No catalog port
  // currently emits `OcrTable`, so this is a latent behavior change,
  // not an observed regression — documented here rather than left in
  // `UNKNOWN_KINDS` below.
  it("routes outputKind=OcrTable (baseKind → OcrResult) to OcrResultPreview with ctx.ocrResult", async () => {
    const ocr = { fields: { foo: "bar" } };
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("OcrTable", { nodeOut: ocr })),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );
    const stub = await screen.findByTestId("stub-ocr-result-preview");
    expect(stub.getAttribute("data-value")).toBe(JSON.stringify(ocr));
  });

  const UNKNOWN_KINDS: Array<ActivityOutputPreview["outputKind"]> = [
    "Artifact",
    "ValidationResult",
    "Reference",
    "Segment",
    null,
  ];

  for (const kind of UNKNOWN_KINDS) {
    it(`renders nothing for outputKind=${kind === null ? "null" : kind}`, async () => {
      fetchSpy.mockResolvedValue(rowResponse(buildRow(kind, {})));

      renderWithProviders(
        <PreviewWidget
          workflowId={WORKFLOW_ID}
          nodeId={NODE_ID}
          outputCtxKey="nodeOut"
        />,
      );

      // Wait for the query to resolve out of the loading state. The
      // wrapper's `data-state` is `loading` during the in-flight phase
      // and disappears once the dispatch returns null. Once the
      // wrapper is gone we're confident the dispatch picked the
      // `default` branch.
      await waitFor(() => {
        expect(screen.queryByTestId(`preview-widget-${NODE_ID}`)).toBeNull();
      });
      expect(screen.queryByTestId("stub-document-preview")).toBeNull();
      expect(screen.queryByTestId("stub-segment-array-preview")).toBeNull();
      expect(screen.queryByTestId("stub-ocr-result-preview")).toBeNull();
      expect(screen.queryByTestId("stub-classification-preview")).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Scenario 5 — loading + error + null-data branches
// ---------------------------------------------------------------------------

describe("Scenario 5 — loading + error states", () => {
  it("renders a `<Skeleton>` while the hook is loading", () => {
    // `fetch` never resolves — the hook stays in `isLoading: true`.
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>(() => {
          // intentionally never resolves to keep the hook in isLoading: true
        }),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );

    const wrapper = screen.getByTestId(`preview-widget-${NODE_ID}`);
    expect(wrapper.getAttribute("data-state")).toBe("loading");
  });

  it("renders a red Alert when the hook errors (non-404)", async () => {
    // 403 — non-transient, so the hook surfaces it without retrying
    // (429/5xx would be retried before erroring).
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Boom" }, { status: 403 }),
    );

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("error");
    });
    expect(wrapper).toHaveTextContent("Preview unavailable");
  });

  it("renders the cache-evicted Alert when data === null in REPLAY mode AND the node succeeded (genuine TTL eviction)", async () => {
    fetchSpy.mockResolvedValue(emptyBatchResponse());

    renderWithProviders(
      // The node produced output (succeeded), so a missing cache row IS a
      // genuine TTL eviction — offer the Re-run recovery.
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        isReplay
        nodeStatus="succeeded"
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("evicted");
    });
    expect(wrapper).toHaveTextContent("Preview unavailable");
  });

  // -------------------------------------------------------------------------
  // G-012 — every reason a step has no output gets its own state + copy.
  //
  // These replace the old assertions that ALL of pending / running / cancelled
  // / absent render one `data-state="not-run"` sentence, and that a live Try
  // renders nothing at all.
  // -------------------------------------------------------------------------

  interface NoOutputCase {
    label: string;
    props: Partial<PreviewWidgetProps>;
    state: string;
    copy: string;
  }

  const NO_OUTPUT_CASES: NoOutputCase[] = [
    {
      label: "never reached, run finished",
      props: { runId: RUN_ID, isReplay: true },
      state: "branch-not-taken",
      copy: "took a different branch",
    },
    {
      label: "pending, run finished",
      props: { runId: RUN_ID, isReplay: true, nodeStatus: "pending" },
      state: "branch-not-taken",
      copy: "took a different branch",
    },
    {
      label: "failed",
      props: { runId: RUN_ID, isReplay: true, nodeStatus: "failed" },
      state: "failed",
      copy: "This step failed",
    },
    {
      label: "cancelled",
      props: { runId: RUN_ID, isReplay: true, nodeStatus: "cancelled" },
      state: "cancelled",
      copy: "run was cancelled",
    },
    {
      label: "running, live",
      props: { runId: RUN_ID, nodeStatus: "running" },
      state: "running",
      copy: "Running now",
    },
    {
      label: "not started, live",
      props: { runId: RUN_ID },
      state: "not-started",
      copy: "hasn't reached this step yet",
    },
    {
      label: "no run selected",
      props: {},
      state: "no-run",
      copy: "Run this workflow",
    },
  ];

  it.each(NO_OUTPUT_CASES)("renders distinct copy for $label", async ({
    props,
    state,
    copy,
  }) => {
    fetchSpy.mockResolvedValue(emptyBatchResponse());

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        outputCtxKey="nodeOut"
        {...props}
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe(state);
    });
    expect(wrapper).toHaveTextContent(copy);
    // None of these are evictions — no Re-run recovery may be offered.
    expect(screen.queryByTestId(`cache-evicted-alert-${NODE_ID}`)).toBeNull();
  });

  it("distinguishes a branch that was not taken from a node that never started", async () => {
    // Identical inputs apart from whether the run is over — the distinction
    // the old single sentence could not express.
    // `mockImplementation`, not `mockResolvedValue` — the second render needs
    // its own unconsumed Response body.
    fetchSpy.mockImplementation(() => Promise.resolve(emptyBatchResponse()));
    const { unmount } = renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
      />,
    );
    const live = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(live.getAttribute("data-state")).toBe("not-started");
    });
    unmount();

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        isReplay
      />,
    );
    const replayed = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(replayed.getAttribute("data-state")).toBe("branch-not-taken");
    });
  });

  it("shows a state during a live run, not a blank", async () => {
    // The G-012 headline: the live-Try branch used to be a bare `return null`.
    fetchSpy.mockResolvedValue(emptyBatchResponse());

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        nodeStatus="running"
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("running");
    });
    expect(wrapper.textContent).not.toBe("");
  });

  it("still shows the eviction message with its Re-run action for a genuine TTL eviction", async () => {
    // Regression guard: eviction is a DIFFERENT cause with a DIFFERENT
    // remedy and must never be folded into "didn't run".
    fetchSpy.mockResolvedValue(emptyBatchResponse());

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        isReplay
        nodeStatus="skipped"
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("evicted");
    });
    expect(
      screen.getByTestId(`cache-evicted-alert-${NODE_ID}`),
    ).toBeInTheDocument();
  });

  it("marks a control-flow node `not-previewable` instead of an indistinguishable blank", async () => {
    fetchSpy.mockResolvedValue(emptyBatchResponse());

    renderWithProviders(
      // A switch that succeeded (evaluated its condition) but never wrote an
      // output-cache row. Not an eviction, not a "didn't run" — and no longer
      // the same empty card as either.
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
        isReplay
        nodeStatus="succeeded"
        producesOutput={false}
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("not-previewable");
    });
    // Deliberately draws no copy — a message on every control-flow node would
    // paper the canvas — but the state is observable.
    expect(screen.queryByTestId(`cache-evicted-alert-${NODE_ID}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — NodePreviewOverlay reads workflowId + activeRunId from
// the run-state context.
// ---------------------------------------------------------------------------

describe("Scenario 6 — NodePreviewOverlay reads context", () => {
  it("forwards workflowId + activeRunId to PreviewWidget", async () => {
    const doc = { blob: { storage_key: "abc" } };
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("Document", { nodeOut: doc })),
    );

    renderWithProviders(<NodePreviewOverlay nodeId={NODE_ID} />, {
      workflowId: WORKFLOW_ID,
      activeRunId: RUN_ID,
    });

    await screen.findByTestId("stub-document-preview");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(`/workflows/${WORKFLOW_ID}/preview-cache-batch`);
    // Batch endpoint fetches all nodes at once — no per-node query param.
    expect(url).not.toContain("nodeId=");
    expect(url).toContain(`runId=${RUN_ID}`);
  });

  it("renders nothing and does NOT fetch when there is no activeRunId (idle suppression)", async () => {
    const doc = { blob: { storage_key: "abc" } };
    fetchSpy.mockResolvedValue(
      rowResponse(buildRow("Document", { nodeOut: doc })),
    );

    renderWithProviders(<NodePreviewOverlay nodeId={NODE_ID} />, {
      workflowId: WORKFLOW_ID,
      activeRunId: null,
    });

    // Idle (no run selected): the overlay stays empty and never queries the
    // preview cache — matching the status badges, which are also suppressed at
    // idle. Previews only appear once a Try/replay sets an active run.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`preview-widget-${NODE_ID}`)).toBeNull();
    expect(screen.queryByTestId("stub-document-preview")).toBeNull();
  });

  it("renders null when mounted outside <RunStateProvider> (legacy unit tests)", () => {
    // No `RunStateTestProvider` in the render tree.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <NodePreviewOverlay nodeId={NODE_ID} />
        </QueryClientProvider>
      </MantineProvider>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`preview-widget-${NODE_ID}`)).toBeNull();
  });

  it("renders null when the context's workflowId is the empty string (create mode)", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const value = buildRunStateContextValue({
      workflowId: "",
      activeRunId: null,
    });
    render(
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <RunStateTestProvider value={value}>
            <NodePreviewOverlay nodeId={NODE_ID} />
          </RunStateTestProvider>
        </QueryClientProvider>
      </MantineProvider>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`preview-widget-${NODE_ID}`)).toBeNull();
  });

  // Verifies the fixture-only constant from PreviewWidget is exported
  // for parallel widget stories to consume.
  it("exports the PREVIEW_MAX_HEIGHT_PX constant", async () => {
    const mod = await import("./PreviewWidget");
    expect(typeof mod.PREVIEW_MAX_HEIGHT_PX).toBe("number");
    expect(mod.PREVIEW_MAX_HEIGHT_PX).toBeGreaterThan(0);
  });
});
