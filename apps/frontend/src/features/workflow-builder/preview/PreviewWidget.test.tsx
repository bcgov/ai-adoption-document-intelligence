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
import { NodePreviewOverlay, PreviewWidget } from "./PreviewWidget";
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
      fetchSpy.mockResolvedValue(
        jsonResponse(buildRow(kind, { document: doc })),
      );

      renderWithProviders(
        <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
      );

      const stub = await screen.findByTestId("stub-document-preview");
      expect(stub).toBeInTheDocument();
      expect(stub.getAttribute("data-value")).toBe(JSON.stringify(doc));
    });
  }

  it("routes outputKind=Segment[] to SegmentArrayPreview with ctx.segments", async () => {
    const segs = [{ parentDocId: "doc-1" }];
    fetchSpy.mockResolvedValue(
      jsonResponse(buildRow("Segment[]", { segments: segs })),
    );

    renderWithProviders(
      <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
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
      fetchSpy.mockResolvedValue(
        jsonResponse(buildRow(kind, { ocrResult: ocr })),
      );

      renderWithProviders(
        <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
      );
      const stub = await screen.findByTestId("stub-ocr-result-preview");
      expect(stub.getAttribute("data-value")).toBe(JSON.stringify(ocr));
    });
  }

  it("routes outputKind=Classification to ClassificationPreview with ctx.classification", async () => {
    const cls = { label: "invoice", confidence: 0.92 };
    fetchSpy.mockResolvedValue(
      jsonResponse(buildRow("Classification", { classification: cls })),
    );

    renderWithProviders(
      <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
    );
    const stub = await screen.findByTestId("stub-classification-preview");
    expect(stub.getAttribute("data-value")).toBe(JSON.stringify(cls));
  });

  const UNKNOWN_KINDS: Array<ActivityOutputPreview["outputKind"]> = [
    "Artifact",
    "OcrTable",
    "ValidationResult",
    "Reference",
    "Segment",
    null,
  ];

  for (const kind of UNKNOWN_KINDS) {
    it(`renders nothing for outputKind=${kind === null ? "null" : kind}`, async () => {
      fetchSpy.mockResolvedValue(jsonResponse(buildRow(kind, {})));

      renderWithProviders(
        <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
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
      <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
    );

    const wrapper = screen.getByTestId(`preview-widget-${NODE_ID}`);
    expect(wrapper.getAttribute("data-state")).toBe("loading");
  });

  it("renders a red Alert when the hook errors (non-404)", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ message: "Boom" }, { status: 500 }),
    );

    renderWithProviders(
      <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("error");
    });
    expect(wrapper).toHaveTextContent("Preview unavailable");
  });

  it("renders the cache-evicted Alert when data === null AND runId is set", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 404 }));

    renderWithProviders(
      <PreviewWidget
        workflowId={WORKFLOW_ID}
        nodeId={NODE_ID}
        runId={RUN_ID}
      />,
    );

    const wrapper = await screen.findByTestId(`preview-widget-${NODE_ID}`);
    await waitFor(() => {
      expect(wrapper.getAttribute("data-state")).toBe("evicted");
    });
    expect(wrapper).toHaveTextContent("Preview unavailable");
  });

  it("renders null silently when data === null AND no runId", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 404 }));

    renderWithProviders(
      <PreviewWidget workflowId={WORKFLOW_ID} nodeId={NODE_ID} />,
    );

    // Wait until the resolved-data null branch has unmounted the wrapper.
    await waitFor(() => {
      expect(screen.queryByTestId(`preview-widget-${NODE_ID}`)).toBeNull();
    });
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
      jsonResponse(buildRow("Document", { document: doc })),
    );

    renderWithProviders(<NodePreviewOverlay nodeId={NODE_ID} />, {
      workflowId: WORKFLOW_ID,
      activeRunId: RUN_ID,
    });

    await screen.findByTestId("stub-document-preview");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(`/workflows/${WORKFLOW_ID}/preview-cache`);
    expect(url).toContain(`nodeId=${NODE_ID}`);
    expect(url).toContain(`runId=${RUN_ID}`);
  });

  it("omits runId when there is no activeRunId in context", async () => {
    const doc = { blob: { storage_key: "abc" } };
    fetchSpy.mockResolvedValue(
      jsonResponse(buildRow("Document", { document: doc })),
    );

    renderWithProviders(<NodePreviewOverlay nodeId={NODE_ID} />, {
      workflowId: WORKFLOW_ID,
      activeRunId: null,
    });

    await screen.findByTestId("stub-document-preview");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("runId");
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
