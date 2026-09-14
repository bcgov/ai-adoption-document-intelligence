/**
 * Unit tests for `WirePeekPopover` (Phase 4 "wire data peek", Task 3).
 *
 * The `useActivityOutputPreview` hook is stubbed via `vi.mock` so the
 * component's state matrix (no-run / loading / evicted / ready / empty)
 * is exercised in isolation from the real batch-query network surface.
 * The real `renderKindValue` dispatch + widget bodies are kept unmocked
 * so the "ready" cases assert the actual widget roots render.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityOutputPreview } from "../preview/preview.types";
import type { UseActivityOutputPreviewResult } from "../preview/useActivityOutputPreview";
import type { NodeStatusesMap } from "../run/node-status.types";
import {
  buildRunStateContextValue,
  RunStateTestProvider,
} from "../run/RunStateContext";
import type { DataWire } from "./derive-wires";
import { WirePeekPopover } from "./WirePeekPopover";

// ---------------------------------------------------------------------------
// Hook stub — every test overrides the returned shape via `mockPreview`.
// ---------------------------------------------------------------------------

const mockPreview = vi.fn<() => UseActivityOutputPreviewResult>();

vi.mock("../preview/useActivityOutputPreview", () => ({
  useActivityOutputPreview: () => mockPreview(),
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const wire: DataWire = {
  variant: "data",
  id: "wire:clean:text",
  source: "extract",
  sourcePort: "text",
  target: "clean",
  targetPort: "text",
  kind: "OcrResult",
  pinned: false,
  auto: true,
  ctxKey: "__auto.extract.text",
};

function preview(
  partial: Partial<UseActivityOutputPreviewResult>,
): UseActivityOutputPreviewResult {
  return {
    data: partial.data ?? null,
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
  };
}

interface RenderOptions {
  activeRunId?: string | null;
  isReplay?: boolean;
  withProvider?: boolean;
  wireOverride?: DataWire;
  nodeStatuses?: NodeStatusesMap;
}

function renderPopover({
  activeRunId = "run-1",
  isReplay = false,
  withProvider = true,
  wireOverride = wire,
  nodeStatuses = {},
}: RenderOptions = {}): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const inner: ReactNode = <WirePeekPopover wire={wireOverride} />;

  const tree = withProvider ? (
    <RunStateTestProvider
      value={buildRunStateContextValue({
        workflowId: "wf-1",
        activeRunId,
        isReplay,
        nodeStatuses,
      })}
    >
      {inner}
    </RunStateTestProvider>
  ) : (
    inner
  );

  render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
    </MantineProvider>,
  );
}

afterEach(() => {
  mockPreview.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WirePeekPopover", () => {
  it("shows the no-run prompt when there is no active run", () => {
    mockPreview.mockReturnValue(preview({}));
    renderPopover({ activeRunId: null });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "no-run",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "Run this workflow to see what this step produces.",
    );
  });

  it("renders a skeleton while loading", () => {
    mockPreview.mockReturnValue(preview({ isLoading: true }));
    renderPopover();

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "loading",
    );
  });

  it("shows the error alert when the preview fetch fails", () => {
    mockPreview.mockReturnValue(
      preview({ error: { status: 500, message: "boom" } as never }),
    );
    renderPopover();

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "Preview unavailable",
    );
  });

  // G-012: a missing row in replay is only an EVICTION when the producer
  // actually produced output. This used to blame the cache unconditionally.
  it("renders the cache-evicted recovery when replaying a run whose producer succeeded", () => {
    mockPreview.mockReturnValue(preview({ data: null }));
    renderPopover({
      isReplay: true,
      nodeStatuses: { [wire.source]: { status: "succeeded" } },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "evicted",
    );
    expect(
      screen.getByTestId(`cache-evicted-alert-${wire.source}`),
    ).toBeInTheDocument();
  });

  it("does NOT blame the cache when the replayed producer never ran", () => {
    mockPreview.mockReturnValue(preview({ data: null }));
    renderPopover({ isReplay: true, nodeStatuses: {} });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "branch-not-taken",
    );
    expect(
      screen.queryByTestId(`cache-evicted-alert-${wire.source}`),
    ).toBeNull();
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "took a different branch",
    );
  });

  it("says the producer is still running during a live run with no cache row", () => {
    mockPreview.mockReturnValue(preview({ data: null }));
    renderPopover({
      activeRunId: "run-1",
      isReplay: false,
      nodeStatuses: { [wire.source]: { status: "running" } },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "running",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "Running now",
    );
  });

  it("says the run hasn't reached the producer yet during a live run", () => {
    mockPreview.mockReturnValue(preview({ data: null }));
    renderPopover({ activeRunId: "run-1", isReplay: false, nodeStatuses: {} });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "not-started",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "hasn't reached this step yet",
    );
  });

  it("says the producer failed rather than reporting a generic 'no data'", () => {
    mockPreview.mockReturnValue(preview({ data: null }));
    renderPopover({
      isReplay: true,
      nodeStatuses: { [wire.source]: { status: "failed" } },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "failed",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "This step failed",
    );
  });

  it("resolves a nested __auto ctxKey and renders the kind widget", () => {
    // Runtime stores outputCtx NESTED: `__auto.extract.ocrResult` lands as
    // `{ __auto: { extract: { ocrResult: <value> } } }`.
    const data: ActivityOutputPreview = {
      outputCtx: { __auto: { extract: { ocrResult: { total: 1 } } } },
      outputKind: "OcrResult",
      createdAt: "",
      expiresAt: "",
    };
    mockPreview.mockReturnValue(preview({ data }));
    renderPopover({
      wireOverride: {
        ...wire,
        kind: "OcrResult",
        ctxKey: "__auto.extract.ocrResult",
      },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(screen.getByTestId("ocr-preview-root")).toBeInTheDocument();
  });

  it("falls back to the JSON preview for a nested scalar with no widget kind", () => {
    const data: ActivityOutputPreview = {
      outputCtx: {
        __auto: { upload: { documentUrl: "https://blob/doc.pdf" } },
      },
      outputKind: "Artifact",
      createdAt: "",
      expiresAt: "",
    };
    mockPreview.mockReturnValue(preview({ data }));
    renderPopover({
      wireOverride: {
        ...wire,
        kind: "Artifact",
        ctxKey: "__auto.upload.documentUrl",
      },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(screen.getByTestId("json-value-preview")).toBeInTheDocument();
  });

  it("honors the namespace remap for a `doc.*` ctxKey", () => {
    // `doc.total` remaps to `documentMetadata.total` before traversal.
    const data: ActivityOutputPreview = {
      outputCtx: { documentMetadata: { total: 5 } },
      outputKind: "Artifact",
      createdAt: "",
      expiresAt: "",
    };
    mockPreview.mockReturnValue(preview({ data }));
    renderPopover({
      wireOverride: { ...wire, kind: "Artifact", ctxKey: "doc.total" },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(screen.getByTestId("json-value-preview")).toBeInTheDocument();
  });

  it("resolves a flat single-segment ctxKey (source-node style)", () => {
    const data: ActivityOutputPreview = {
      outputCtx: { documentUrl: "https://x" },
      outputKind: "Artifact",
      createdAt: "",
      expiresAt: "",
    };
    mockPreview.mockReturnValue(preview({ data }));
    renderPopover({
      wireOverride: { ...wire, kind: "Artifact", ctxKey: "documentUrl" },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(screen.getByTestId("json-value-preview")).toBeInTheDocument();
  });

  it("shows the empty state when the ctxKey is absent from the output", () => {
    const data: ActivityOutputPreview = {
      outputCtx: { somethingElse: 1 },
      outputKind: "OcrResult",
      createdAt: "",
      expiresAt: "",
    };
    mockPreview.mockReturnValue(preview({ data }));
    renderPopover({
      wireOverride: { ...wire, ctxKey: "__auto.extract.ocrResult" },
    });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(screen.getByTestId("wire-peek-value")).toHaveTextContent(
      "No value recorded",
    );
  });

  it("shows the no-run prompt when mounted without a run-state provider", () => {
    mockPreview.mockReturnValue(preview({}));
    renderPopover({ withProvider: false });

    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "no-run",
    );
  });
});
