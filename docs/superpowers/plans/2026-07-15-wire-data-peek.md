# Wire Data Peek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a run, clicking a data wire on the workflow-builder canvas opens a popover at the wire showing the value that flowed across it, rendered with the existing kind widgets where the wire's kind has one, else a truncated-JSON snippet.

**Architecture:** Presentation-only. Reuse the existing batch preview cache hook (`useActivityOutputPreview`), the existing value-level kind widgets, and React Flow edge selection. The rich preview mounts inside `WorkflowEdge` via `EdgeLabelRenderer` (wire midpoint) when the edge is selected. A "View data" item in `WireContextMenu` is the discoverable backup. No schema/engine/resolver/API change; the value is scoped with `outputCtx[wire.ctxKey]`.

**Tech Stack:** React + TypeScript, Mantine, `@xyflow/react`, TanStack Query, Vitest (unit), Playwright (`@infra` e2e). Frontend package: `apps/frontend`.

**Spec:** `docs/superpowers/specs/2026-07-15-wire-data-peek-design.md`.

---

## File Structure

- **Create** `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx` — the shared kind→widget dispatch (`renderKindValue(kind, value)`), extracted from `PreviewWidget`.
- **Modify** `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` — `renderForOutputKind` delegates to `renderKindValue`.
- **Create** `apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.tsx` — generic truncated-JSON fallback + "View raw" modal.
- **Create** `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx` — the peek surface (state matrix, value dispatch).
- **Modify** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` — render the popover in `EdgeLabelRenderer` when `selected` + data wire; extend `WorkflowEdgeData` with `peekProducerLabel`/`peekPortLabel`.
- **Modify** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — `projectFlowEdges` stamps `peekProducerLabel`/`peekPortLabel`; wire the context-menu "View data" → programmatic edge selection; pass `canViewData`.
- **Modify** `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx` — add "View data" item (`onViewData`, `canViewData`).
- **Modify** `tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts` — click the data wire after the run, assert the peek.
- **Modify** docs: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` §15, `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`, `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md`.

Run all unit tests with `npx vitest run <path>` from `apps/frontend`. Typecheck with `npx tsc --noEmit` from `apps/frontend`.

---

## Task 1: Extract `renderKindValue` shared dispatch

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx`
- Test: `apps/frontend/src/features/workflow-builder/preview/render-kind-value.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// render-kind-value.test.tsx
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { renderKindValue } from "./render-kind-value";

const wrap = (node: React.ReactNode) =>
  render(<MantineProvider>{node}</MantineProvider>);

describe("renderKindValue", () => {
  it("maps Document to DocumentPreview", () => {
    wrap(renderKindValue("Document", { blobKey: "b1", pageCount: 1 }));
    expect(screen.getByTestId("document-preview-root")).toBeInTheDocument();
  });

  it("maps Segment[] to SegmentArrayPreview", () => {
    wrap(renderKindValue("Segment[]", []));
    expect(screen.getByTestId("segment-array-preview-root")).toBeInTheDocument();
  });

  it("maps OcrResult to OcrResultPreview", () => {
    wrap(renderKindValue("OcrResult", { total: 1 }));
    expect(screen.getByTestId("ocr-preview-root")).toBeInTheDocument();
  });

  it("maps Classification to ClassificationPreview", () => {
    wrap(renderKindValue("Classification", { label: "invoice" }));
    expect(
      screen.getByTestId("classification-preview-root"),
    ).toBeInTheDocument();
  });

  it("returns null for a kind with no widget", () => {
    expect(renderKindValue("Artifact", "some-id")).toBeNull();
    expect(renderKindValue(null, 42)).toBeNull();
  });
});
```

> Confirm the exact root `data-testid` of each widget before running (open `DocumentPreview.tsx`, `SegmentArrayPreview.tsx`, `OcrResultPreview.tsx`, `ClassificationPreview.tsx` and read their root element's `data-testid`). `OcrResultPreview` root is `ocr-preview-root`. Adjust the three others' testids in the assertions to match their actual roots.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/preview/render-kind-value.test.tsx`
Expected: FAIL — "Failed to resolve import './render-kind-value'".

- [ ] **Step 3: Write minimal implementation**

```tsx
// render-kind-value.tsx
import type { ReactNode } from "react";
import { ClassificationPreview } from "./ClassificationPreview";
import { DocumentPreview } from "./DocumentPreview";
import { OcrResultPreview } from "./OcrResultPreview";
import { SegmentArrayPreview } from "./SegmentArrayPreview";

/**
 * Shared kind→widget dispatch. Given an artifact-kind literal and the
 * value that conforms to it, returns the matching value-level preview
 * widget, or `null` when no widget exists for that kind.
 *
 * Single source of truth for the mapping so the node-card preview
 * (`PreviewWidget.renderForOutputKind`, keyed on `outputKind` + a fixed
 * ctx slot) and the wire peek (`WirePeekPopover`, keyed on the wire's
 * `kind` + `outputCtx[ctxKey]`) can never drift.
 */
export function renderKindValue(
  kind: string | null,
  value: unknown,
): ReactNode | null {
  switch (kind) {
    case "Document":
    case "MultiPageDocument":
    case "SinglePageDocument":
      return <DocumentPreview value={value} />;
    case "Segment[]":
      return <SegmentArrayPreview value={value} />;
    case "OcrResult":
    case "OcrFields":
      return <OcrResultPreview value={value} />;
    case "Classification":
      return <ClassificationPreview value={value} />;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Refactor `PreviewWidget.renderForOutputKind` to delegate**

Replace the `renderForOutputKind` function body in `PreviewWidget.tsx` so it selects the ctx slot per `outputKind`, then calls `renderKindValue`. Keep the widget imports that are now unused removed from `PreviewWidget.tsx` (they live in `render-kind-value.tsx`), and add `import { renderKindValue } from "./render-kind-value";`:

```tsx
function renderForOutputKind(data: ActivityOutputPreview): ReactNode {
  const { outputKind, outputCtx } = data;
  const slot = ((): unknown => {
    switch (outputKind) {
      case "Document":
      case "MultiPageDocument":
      case "SinglePageDocument":
        return outputCtx.document;
      case "Segment[]":
        return outputCtx.segments;
      case "OcrResult":
      case "OcrFields":
        return outputCtx.ocrResult;
      case "Classification":
        return outputCtx.classification;
      default:
        return undefined;
    }
  })();
  return renderKindValue(outputKind, slot);
}
```

Remove the now-unused `ClassificationPreview`, `DocumentPreview`, `OcrResultPreview`, `SegmentArrayPreview` imports from `PreviewWidget.tsx`.

- [ ] **Step 5: Run tests to verify they pass**

Run:
```
cd apps/frontend && npx vitest run \
  src/features/workflow-builder/preview/render-kind-value.test.tsx \
  src/features/workflow-builder/preview/PreviewWidget.test.tsx
```
Expected: PASS — new file green AND the existing `PreviewWidget.test.tsx` still green (the refactor is behaviour-preserving).

- [ ] **Step 6: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx \
        apps/frontend/src/features/workflow-builder/preview/render-kind-value.test.tsx \
        apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx
git commit -m "refactor(workflow-builder): extract renderKindValue kind→widget dispatch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `JsonValuePreview` truncated-JSON fallback

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.tsx`
- Test: `apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// JsonValuePreview.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { JsonValuePreview } from "./JsonValuePreview";

const wrap = (v: unknown) =>
  render(
    <MantineProvider>
      <JsonValuePreview value={v} />
    </MantineProvider>,
  );

describe("JsonValuePreview", () => {
  it("renders a short primitive inline", () => {
    wrap("hello");
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("hello");
    expect(screen.queryByTestId("json-value-preview-raw")).toBeNull();
  });

  it("truncates a long string and offers View raw", () => {
    const long = "x".repeat(200);
    wrap(long);
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("…");
    expect(screen.getByTestId("json-value-preview-raw")).toBeInTheDocument();
  });

  it("shows an object snippet and opens the raw modal with pretty JSON", async () => {
    const user = userEvent.setup();
    wrap({ text: "INVOICE #4471", pages: 3 });
    await user.click(screen.getByTestId("json-value-preview-raw"));
    const raw = await screen.findByTestId("json-value-preview-raw-content");
    expect(raw).toHaveValue(
      JSON.stringify({ text: "INVOICE #4471", pages: 3 }, null, 2),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/preview/JsonValuePreview.test.tsx`
Expected: FAIL — cannot resolve `./JsonValuePreview`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// JsonValuePreview.tsx
import { Anchor, JsonInput, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";

const INLINE_STRING_LIMIT = 80;
const SNIPPET_LIMIT = 120;

export interface JsonValuePreviewProps {
  value: unknown;
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

/**
 * Generic fallback preview for a wire value whose kind has no dedicated
 * widget (scalars, URLs, `Artifact`-wildcard values, unknown kinds).
 * Short primitives render inline; anything longer/structured shows a
 * truncated snippet with a "View raw" modal of the pretty-printed JSON.
 */
export function JsonValuePreview({ value }: JsonValuePreviewProps): ReactNode {
  const [opened, { open, close }] = useDisclosure(false);
  const raw = JSON.stringify(value, null, 2) ?? String(value);

  const shortPrimitive =
    isPrimitive(value) &&
    !(typeof value === "string" && value.length > INLINE_STRING_LIMIT);

  if (shortPrimitive) {
    return (
      <Text size="sm" data-testid="json-value-preview">
        {value === null ? "null" : String(value)}
      </Text>
    );
  }

  const flat =
    typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  const snippet =
    flat.length > SNIPPET_LIMIT ? `${flat.slice(0, SNIPPET_LIMIT)}…` : flat;

  return (
    <>
      <Text size="sm" data-testid="json-value-preview" style={{ wordBreak: "break-word" }}>
        {snippet}{" "}
        <Anchor
          component="button"
          type="button"
          size="xs"
          onClick={open}
          data-testid="json-value-preview-raw"
        >
          View raw
        </Anchor>
      </Text>
      <Modal opened={opened} onClose={close} title="Raw value" size="lg">
        <JsonInput
          readOnly
          autosize
          minRows={6}
          maxRows={24}
          value={raw}
          data-testid="json-value-preview-raw-content"
        />
      </Modal>
    </>
  );
}
```

> Verify `JsonInput`'s `data-testid` reaches the underlying `<textarea>` so `toHaveValue` works; if Mantine forwards it to a wrapper instead, assert on `screen.getByDisplayValue(raw)` rather than the testid in the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/preview/JsonValuePreview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/frontend && npx tsc --noEmit` → no errors.
```bash
git add apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.tsx \
        apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.test.tsx
git commit -m "feat(workflow-builder): JsonValuePreview truncated-JSON fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `WirePeekPopover` component

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx`
- Test: `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.test.tsx`

Context: `useActivityOutputPreview(workflowId, nodeId, runId?)` returns `{ data: ActivityOutputPreview | null, isLoading, error }` (`preview/useActivityOutputPreview.ts`). `useOptionalRunState()` returns `{ workflowId, activeRunId, isReplay, nodeStatuses } | null` (`run/RunStateContext.tsx`), and `RunStateTestProvider` is exported from the same file for tests. `DataWire` (`canvas/derive-wires.ts`) carries `source`, `sourcePort`, `kind?`, `ctxKey`.

- [ ] **Step 1: Write the failing test**

```tsx
// WirePeekPopover.test.tsx
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataWire } from "./derive-wires";
import { RunStateTestProvider } from "../run/RunStateContext";
import { WirePeekPopover } from "./WirePeekPopover";

const mockPreview = vi.fn();
vi.mock("../preview/useActivityOutputPreview", () => ({
  useActivityOutputPreview: (...args: unknown[]) => mockPreview(...args),
}));

afterEach(() => mockPreview.mockReset());

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

function mount(
  runState: { activeRunId: string | null; isReplay?: boolean } | "none",
  extra?: Partial<React.ComponentProps<typeof WirePeekPopover>>,
) {
  const ui = (
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <WirePeekPopover wire={wire} {...extra} />
      </QueryClientProvider>
    </MantineProvider>
  );
  if (runState === "none") return render(ui);
  return render(
    <RunStateTestProvider
      value={{
        workflowId: "wf1",
        activeRunId: runState.activeRunId,
        isReplay: runState.isReplay ?? false,
        nodeStatuses: {},
      }}
    >
      {ui}
    </RunStateTestProvider>,
  );
}

describe("WirePeekPopover", () => {
  it("prompts to run when no run is active", () => {
    mockPreview.mockReturnValue({ data: null, isLoading: false, error: null });
    mount({ activeRunId: null });
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "no-run",
    );
    expect(screen.getByText(/Run to see the data/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    mockPreview.mockReturnValue({ data: null, isLoading: true, error: null });
    mount({ activeRunId: "run1" });
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "loading",
    );
  });

  it("renders the evicted alert on replay with no data", () => {
    mockPreview.mockReturnValue({ data: null, isLoading: false, error: null });
    mount({ activeRunId: "run1", isReplay: true });
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "evicted",
    );
  });

  it("scopes to outputCtx[ctxKey] and dispatches to the kind widget", () => {
    mockPreview.mockReturnValue({
      data: {
        outputCtx: { "__auto.extract.text": { total: 1 } },
        outputKind: "OcrResult",
        createdAt: "",
        expiresAt: "",
      },
      isLoading: false,
      error: null,
    });
    mount({ activeRunId: "run1" });
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(screen.getByTestId("ocr-preview-root")).toBeInTheDocument();
  });

  it("falls back to JSON for a value whose kind has no widget", () => {
    mockPreview.mockReturnValue({
      data: {
        outputCtx: { "__auto.extract.text": "https://blob/doc.pdf" },
        outputKind: "Artifact",
        createdAt: "",
        expiresAt: "",
      },
      isLoading: false,
      error: null,
    });
    mount({ activeRunId: "run1" }, { wire: { ...wire, kind: "Artifact" } });
    expect(screen.getByTestId("json-value-preview")).toBeInTheDocument();
  });

  it("reports an empty connection when the ctxKey is absent from outputCtx", () => {
    mockPreview.mockReturnValue({
      data: {
        outputCtx: { somethingElse: 1 },
        outputKind: "OcrResult",
        createdAt: "",
        expiresAt: "",
      },
      isLoading: false,
      error: null,
    });
    mount({ activeRunId: "run1" });
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "empty",
    );
  });

  it("prompts to run when mounted without a RunState provider", () => {
    mockPreview.mockReturnValue({ data: null, isLoading: false, error: null });
    mount("none");
    expect(screen.getByTestId("wire-peek-popover")).toHaveAttribute(
      "data-state",
      "no-run",
    );
  });
});
```

> Read `RunStateTestProvider`'s actual prop shape in `run/RunStateContext.tsx` (line ~196) before running — if it takes the context value differently (e.g. spread props rather than a `value` prop), adapt the `mount` helper accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WirePeekPopover.test.tsx`
Expected: FAIL — cannot resolve `./WirePeekPopover`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// WirePeekPopover.tsx
import { Alert, Paper, Skeleton, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { CacheEvictedAlert } from "../preview/CacheEvictedAlert";
import { JsonValuePreview } from "../preview/JsonValuePreview";
import { renderKindValue } from "../preview/render-kind-value";
import { useActivityOutputPreview } from "../preview/useActivityOutputPreview";
import { useOptionalRunState } from "../run/RunStateContext";
import type { DataWire } from "./derive-wires";

export interface WirePeekPopoverProps {
  wire: DataWire;
  /** Producer step's display label; falls back to the node id. */
  producerLabel?: string;
  /** Producer port's catalog label; falls back to the raw port name. */
  portLabel?: string;
}

function Shell({
  state,
  header,
  children,
}: {
  state: string;
  header: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Paper
      data-testid="wire-peek-popover"
      data-state={state}
      shadow="md"
      p="xs"
      withBorder
      // Stop clicks inside the popover from reaching the canvas pane
      // (which would deselect the edge and close this popover).
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ pointerEvents: "all", maxWidth: 320, maxHeight: 260, overflow: "auto" }}
    >
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed">
          {header}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

export function WirePeekPopover({
  wire,
  producerLabel,
  portLabel,
}: WirePeekPopoverProps): ReactNode {
  const runState = useOptionalRunState();
  const workflowId = runState?.workflowId ?? "";
  const activeRunId = runState?.activeRunId ?? null;
  const isReplay = runState?.isReplay ?? false;
  const header = `${producerLabel ?? wire.source} → ${portLabel ?? wire.sourcePort}`;

  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    wire.source,
    activeRunId ?? undefined,
  );

  if (activeRunId === null || activeRunId === "") {
    return (
      <Shell state="no-run" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          Run to see the data flowing here.
        </Text>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell state="loading" header={header}>
        <Skeleton h={60} radius="sm" />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell state="error" header={header}>
        <Alert color="red" variant="light" data-testid="wire-peek-value">
          Preview unavailable
        </Alert>
      </Shell>
    );
  }

  if (data === null) {
    if (isReplay) {
      return (
        <Shell state="evicted" header={header}>
          <CacheEvictedAlert
            workflowId={workflowId}
            runId={activeRunId}
            nodeId={wire.source}
          />
        </Shell>
      );
    }
    return (
      <Shell state="no-run" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          Run to see the data flowing here.
        </Text>
      </Shell>
    );
  }

  if (!(wire.ctxKey in data.outputCtx)) {
    return (
      <Shell state="empty" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          No value recorded for this connection.
        </Text>
      </Shell>
    );
  }

  const value = data.outputCtx[wire.ctxKey];
  const widget = renderKindValue(wire.kind ?? null, value);
  return (
    <Shell state="ready" header={header}>
      <div data-testid="wire-peek-value">
        {widget ?? <JsonValuePreview value={value} />}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WirePeekPopover.test.tsx`
Expected: PASS (all 7).

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/frontend && npx tsc --noEmit` → no errors.
```bash
git add apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx \
        apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.test.tsx
git commit -m "feat(workflow-builder): WirePeekPopover renders the value on a wire

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Mount the popover in `WorkflowEdge` on selection + stamp peek labels

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`projectFlowEdges` only in this task)
- Test: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (extend `WorkflowEdge.test.tsx`)**

Add a describe block. `WorkflowEdge` is an xyflow edge component; existing tests render it inside a `<ReactFlow>` harness — reuse that harness (copy the existing render helper in this file). The new assertions:

```tsx
// within WorkflowEdge.test.tsx — reuse the file's existing ReactFlow render harness
describe("wire data peek mount", () => {
  const dataWire = {
    variant: "data" as const,
    id: "wire:clean:text",
    source: "extract",
    sourcePort: "text",
    target: "clean",
    targetPort: "text",
    kind: "OcrResult" as const,
    pinned: false,
    auto: true,
    ctxKey: "__auto.extract.text",
  };

  it("renders the peek popover when a data edge is selected", () => {
    renderEdge({ data: { wire: dataWire }, selected: true }); // renderEdge = file's harness
    expect(screen.getByTestId("wire-peek-popover")).toBeInTheDocument();
  });

  it("does not render the popover when the data edge is unselected", () => {
    renderEdge({ data: { wire: dataWire }, selected: false });
    expect(screen.queryByTestId("wire-peek-popover")).toBeNull();
  });

  it("does not render the popover for a selected sequence wire", () => {
    renderEdge({
      data: { wire: { ...dataWire, variant: "sequence" } },
      selected: true,
    });
    expect(screen.queryByTestId("wire-peek-popover")).toBeNull();
  });
});
```

> Read the top of `WorkflowEdge.test.tsx` first to reuse its exact render harness + how it passes `selected`/`data`. If the harness doesn't currently thread `selected`, extend it to spread arbitrary `EdgeProps` overrides. Without a `RunStateProvider` the popover mounts in `data-state="no-run"` — that's fine, the assertion only checks presence.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WorkflowEdge.test.tsx`
Expected: FAIL — no `wire-peek-popover` rendered.

- [ ] **Step 3: Implement — render the popover in `WorkflowEdge`**

In `WorkflowEdge.tsx`: import the popover and read `selected` from props. Add the mount after the existing label block, inside the fragment.

```tsx
import { WirePeekPopover } from "./WirePeekPopover";
```

Change the component signature destructure to include `selected` and `data`:

```tsx
const { id, sourceX, sourceY, targetX, targetY, markerEnd, data, selected } =
  props;
```

Then, before the closing `</>`, add:

```tsx
{selected && data?.wire?.variant === "data" ? (
  <EdgeLabelRenderer>
    <div
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: "all",
        zIndex: 10,
      }}
    >
      <WirePeekPopover
        wire={data.wire}
        producerLabel={data.peekProducerLabel}
        portLabel={data.peekPortLabel}
      />
    </div>
  </EdgeLabelRenderer>
) : null}
```

- [ ] **Step 4: Extend `WorkflowEdgeData` + stamp labels in `projectFlowEdges`**

In `WorkflowEdge.tsx`, extend the interface:

```tsx
export interface WorkflowEdgeData {
  graphEdge?: GraphEdge;
  sourceSwitch?: SwitchNode;
  wire?: DerivedWire;
  isActive?: boolean;
  /** Data wires only — producer step label for the peek header. */
  peekProducerLabel?: string;
  /** Data wires only — producer port label for the peek header. */
  peekPortLabel?: string;
  [key: string]: unknown;
}
```

In `WorkflowEditorCanvas.tsx` `projectFlowEdges`, replace the data-wire branch's `const data: WorkflowEdgeData = { wire };` with label resolution (the file already imports `getActivityCatalogEntry`):

```tsx
const producerNode = config.nodes[wire.source];
const peekProducerLabel = producerNode?.label ?? wire.source;
const peekPortLabel =
  (producerNode?.type === "activity" || producerNode?.type === "pollUntil"
    ? getActivityCatalogEntry(producerNode.activityType)?.outputs.find(
        (o) => o.name === wire.sourcePort,
      )?.label
    : undefined) ?? wire.sourcePort;
const data: WorkflowEdgeData = { wire, peekProducerLabel, peekPortLabel };
```

> Confirm the `GraphNode` union's activity/pollUntil members expose `activityType` (they do — `derive-wires.ts` uses `producerNode.activityType` under the same type guard at line ~103). Keep the guard so TypeScript narrows before `.activityType`.

- [ ] **Step 5: Run tests + typecheck**

Run:
```
cd apps/frontend && npx vitest run \
  src/features/workflow-builder/canvas/WorkflowEdge.test.tsx \
  src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
```
Expected: PASS. Then `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx \
        apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx \
        apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.test.tsx
git commit -m "feat(workflow-builder): open wire data peek on data-edge selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: "View data" context-menu backup + programmatic selection

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
- Test: `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (extend `WireContextMenu.test.tsx`)**

```tsx
// within WireContextMenu.test.tsx — reuse the file's render helper + a sample DataWire
it("shows View data only when a run is available and fires onViewData", async () => {
  const user = userEvent.setup();
  const onViewData = vi.fn();
  // canViewData=false → no item
  renderMenu({ canViewData: false, onViewData }); // renderMenu = file's helper
  expect(screen.queryByTestId("wire-menu-view-data")).toBeNull();

  renderMenu({ canViewData: true, onViewData });
  await user.click(screen.getByTestId("wire-menu-view-data"));
  expect(onViewData).toHaveBeenCalledWith(
    expect.objectContaining({ variant: "data" }),
  );
});
```

> Read the existing `WireContextMenu.test.tsx` render helper and reuse it; add `canViewData`/`onViewData` to the props it passes. If it has no helper, mirror the existing tests' inline `render(<WireContextMenu ... />)`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WireContextMenu.test.tsx`
Expected: FAIL — no `wire-menu-view-data`, and the prop types don't exist.

- [ ] **Step 3: Implement — `WireContextMenu.tsx`**

Add to `WireContextMenuProps`:

```tsx
  /** Whether the "View data" item should show (a run has happened). */
  canViewData: boolean;
  /** Open the data peek for this wire (selects the edge). */
  onViewData: (wire: DataWire) => void;
```

Add to the destructure and a handler, and render the item first in the dropdown:

```tsx
  const handleViewData = () => {
    onViewData(wire);
    onClose();
  };
```

```tsx
<Menu.Dropdown data-testid="wire-context-menu">
  {canViewData && (
    <Menu.Item data-testid="wire-menu-view-data" onClick={handleViewData}>
      View data
    </Menu.Item>
  )}
  {wire.pinned && (
    <Menu.Item data-testid="wire-menu-revert" onClick={handleRevert}>
      Revert to automatic
    </Menu.Item>
  )}
  <Menu.Item data-testid="wire-menu-disconnect" color="red" onClick={handleDisconnect}>
    Disconnect
  </Menu.Item>
</Menu.Dropdown>
```

- [ ] **Step 4: Implement — wire it in `WorkflowEditorCanvas.tsx`**

The canvas already has `const runState = useOptionalRunState();` (line ~1950) and `const [internalEdges, setInternalEdges, onInternalEdgesChange] = useEdgesState<Edge>([]);` (line ~1623). Add a `handleWireViewData` callback that selects the edge (React Flow reads `selected` off the controlled edges array), and pass both new props to `<WireContextMenu>`:

```tsx
const handleWireViewData = useCallback(
  (wire: DataWire) => {
    setInternalEdges((eds) =>
      eds.map((e) => ({ ...e, selected: e.id === wire.id })),
    );
  },
  [setInternalEdges],
);
```

Update the render:

```tsx
<WireContextMenu
  opened={wireMenu !== null}
  x={wireMenu?.x ?? 0}
  y={wireMenu?.y ?? 0}
  wire={wireMenu?.wire ?? null}
  canViewData={runState?.activeRunId != null && runState.activeRunId !== ""}
  onViewData={handleWireViewData}
  onClose={closeWireMenu}
  onDisconnect={handleWireDisconnect}
  onRevert={handleWireRevert}
/>
```

> `runState` may be declared after the `<WireContextMenu>` render in source order but it's a hook result available throughout the component body — confirm it's in scope where the JSX is (it is; hooks run before the return). If `runState` is memo-derived lower down, hoist the `useOptionalRunState()` call above the callbacks.

- [ ] **Step 5: Run tests + typecheck**

Run:
```
cd apps/frontend && npx vitest run \
  src/features/workflow-builder/canvas/WireContextMenu.test.tsx \
  src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
```
Expected: PASS. Then `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx \
        apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx \
        apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.test.tsx
git commit -m "feat(workflow-builder): View data context-menu entry opens the wire peek

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: E2E extension + docs

**Files:**
- Modify: `tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts`
- Modify: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md`
- Modify: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md`

- [ ] **Step 1: Extend the `@infra` e2e**

Read `tier3-try-preview.spec.ts` fully first. After the existing block that reloads and asserts `preview-widget-upload1` reaches `data-state="ready"`, add: locate the `upload1 → prep` data edge (React Flow renders each edge's path inside an element whose id derives from the edge id `wire:prep:blobKey`; the canvas stamps `data-testid`/`ariaLabel` — inspect the DOM to pick the reliable locator; the edge group carries `aria-label` = the provenance string and the `<BaseEdge>` path has `class` `react-flow__edge-path`). Click the edge path, then assert the peek:

```ts
// after the reload + preview-widget-upload1 assertion
const edge = page.locator('.react-flow__edge[data-id="wire:prep:blobKey"]');
await edge.click();
const peek = page.getByTestId("wire-peek-popover");
await expect(peek).toHaveAttribute("data-state", "ready", { timeout: 15000 });
await expect(page.getByTestId("wire-peek-value")).toBeVisible();
```

> The exact edge id depends on the produced wire (`file.prepare`'s input port). Confirm it by logging `page.locator('.react-flow__edge').all()` ids during a first run; the plan's `wire:prep:blobKey` matches the design's example but verify against the real config. React Flow puts `data-id` on `.react-flow__edge`. If clicking the thin path is flaky, click via `edge.locator('.react-flow__edge-interaction')` (xyflow's invisible fat hit-area) or use the "View data" context-menu path (right-click the edge → `wire-menu-view-data`) which is more robust in headless runs.

- [ ] **Step 2: Run the e2e locally (requires the Temporal worker stack)**

Ensure backend :3002, the Temporal worker, and frontend are running. Then:
```
TEST_API_KEY=69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY \
  npx playwright test tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts \
  --workers=1 --reporter=list
```
Expected: PASS (the run completes, reload shows the preview, the wire peek shows `ready`). If the worker stack isn't up, the whole `@infra` test can't run — start it before asserting green.

- [ ] **Step 3: Update docs**

In `PORT_WIRING_DESIGN.md` §15, change item **4. Wire data peek (§10)** to a `*Status: complete 2026-07-15.*` block with a "Landed:" list (click-to-open popover at the wire, kind-widget reuse via `renderKindValue`, `JsonValuePreview` fallback, `outputCtx[ctxKey]` scoping correction, "View data" context-menu backup) and a "Known limitations" list (kind-widget reuse only helps object-valued ports; scalar/URL/`Artifact` wires fall to JSON; data wires only — conditions and simplified view get no peek; midpoint anchoring can overlap on long wires). Mirror the prose style of the existing phase-3/phase-5 blocks.

In `MANUAL_TEST_PLAN.md`, add a "Wire data peek" section: run a workflow, click a data wire, confirm the value shows; click a wire before any run → "Run to see the data flowing here"; right-click → "View data" only appears after a run.

In `FEATURE_DEMO_GUIDE.md`, add a short entry describing the click-a-wire-to-see-its-data gesture for the try-in-place demo.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/workflow-builder/specs/tier3-try-preview.spec.ts \
        docs-md/workflow-builder/PORT_WIRING_DESIGN.md \
        docs-md/workflow-builder/MANUAL_TEST_PLAN.md \
        docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md
git commit -m "test(e2e)+docs(workflow-builder): wire data peek e2e + Phase 4 docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full frontend unit suite: `cd apps/frontend && npx vitest run` → all green.
- [ ] Typecheck: `cd apps/frontend && npx tsc --noEmit` → clean.
- [ ] `@infra` e2e green with the worker stack up (Task 6 Step 2).
- [ ] Dispatch a final whole-implementation code review.
