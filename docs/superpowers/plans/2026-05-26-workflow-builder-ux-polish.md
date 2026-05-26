# Workflow Builder V2 UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six visual/UX defects on the V2 workflow editor (`/workflows/create-v2` and `/workflows/:id/edit-v2`) in one coordinated pass.

**Architecture:** Pure helpers + small TSX edits on existing components. No schema changes. New render-time projection for map-body groups; Mantine `<Menu>` replaces the overflowing top-bar button cluster; pills relocate to a single under-node anchor; drag-from-palette wires up the missing `onDrop` and extends the click-to-add path to accept a position override; existing `nextNodePosition` is replaced by a collision-aware variant.

**Tech Stack:** React 18, Mantine v7, xyflow/react, vitest, `@ai-di/graph-workflow` (workspace package), Tabler icons.

**Spec:** [`docs/superpowers/specs/2026-05-26-workflow-builder-ux-polish-design.md`](../specs/2026-05-26-workflow-builder-ux-polish-design.md)

**Working directory note:** All paths below are repo-relative from `/home/alstruk/GitHub/ai-adoption-document-intelligence/`. Frontend tests run from `apps/frontend/`.

**Test commands:**
- Single test file: `cd apps/frontend && npx vitest run <relative-path-from-frontend>`
- Watch mode: `cd apps/frontend && npx vitest <relative-path-from-frontend>`
- Type check: `cd apps/frontend && npx tsc -p . --noEmit`

---

## File Structure

### New files
- `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts` — pure synthesis + merge helpers (Issue 6)
- `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.test.ts` — vitest for synthesis
- `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.tsx` — xyflow node renderer for the body container (Issue 6)
- `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.test.tsx` — vitest for the container
- `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.tsx` — combined-row pill variant (Issue 2)

### Modified files (by issue)
- **#1 Top bar** — `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`, new test in same dir
- **#2 Pills under node** — `apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.tsx`, `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`, `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.type-pill.test.tsx`
- **#3 Drag-from-palette** — `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`, `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`, new test alongside palette
- **#4 Hover popover** — `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx`, `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts`, `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.test.ts`, caller in `WorkflowEditorCanvas.tsx:1855`
- **#5 Switch diamond** — `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`SwitchNodeRenderer`), `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`
- **#6 Map body grouping** — `WorkflowEditorV2Page.tsx`, `WorkflowEditorCanvas.tsx`, `settings/group/GroupNodeSettings.tsx`, plus new files listed above

### Implementation order

Earlier items unblock later visual verification. Each numbered task is one full deliverable (test + impl + commit).

---

## Task 1: Switch diamond — drop duplicate label, enlarge

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (SwitchNodeRenderer, lines 817-930)
- Test: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`

### Step 1: Add failing tests for the redesigned switch diamond

Open `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`. Find the existing `describe("WorkflowEditorCanvas — Scenario 1: switch renders as a diamond", ...)` block (around line 342). Add a new `describe` block right after it:

- [ ] **Step 1: Write the failing tests**

Append to `WorkflowEditorCanvas.test.tsx` (inside the same top-level `describe` if there is one, or as a sibling):

```tsx
describe("WorkflowEditorCanvas — switch diamond polish (Task 1)", () => {
  it("does not render the duplicated dimmed displayName subtitle", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <ReactFlowProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={() => {}}
          onSelectNode={() => {}}
          onSelectionChangeMany={() => {}}
        />
      </ReactFlowProvider>,
    );
    const node = screen.getByTestId("canvas-node-switch_1");
    const matches = within(node).getAllByText("Branch by condition");
    expect(matches).toHaveLength(1);
  });

  it("uses a 180x180 diamond bounding box", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <ReactFlowProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={() => {}}
          onSelectNode={() => {}}
          onSelectionChangeMany={() => {}}
        />
      </ReactFlowProvider>,
    );
    const node = screen.getByTestId("canvas-node-switch_1");
    expect(node).toHaveStyle({ width: "180px", height: "180px" });
  });

  it("wraps a long label inside the inscribed square", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        switch_1: {
          id: "switch_1",
          type: "switch",
          label: "Branch by condition",
          cases: [],
        },
      },
      edges: [],
      entryNodeId: "switch_1",
    };
    render(
      <ReactFlowProvider>
        <WorkflowEditorCanvas
          config={config}
          selectedNodeId={null}
          onConfigChange={() => {}}
          onSelectNode={() => {}}
          onSelectionChangeMany={() => {}}
        />
      </ReactFlowProvider>,
    );
    const labelEl = screen.getByTestId("switch-label-switch_1");
    const style = window.getComputedStyle(labelEl);
    expect(style.wordBreak).toBe("break-word");
    // Bounded so the text stays inside the inscribed square (180 / sqrt(2) ≈ 127).
    expect(labelEl).toHaveStyle({ maxWidth: "127px" });
  });
});
```

Add any missing imports at the top of the file: `within` from `@testing-library/react` and `ReactFlowProvider` from `@xyflow/react` if not already present.

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:
```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx -t "switch diamond polish"
```

Expected: 3 FAIL — second `<div>` with text "Branch by condition" still rendered; width 140; no `data-testid="switch-label-switch_1"`.

- [ ] **Step 3: Edit `SwitchNodeRenderer` to match**

In `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`, replace the body of `SwitchNodeRenderer` (lines 817-930) with this version. The diff vs current is: width/height 140→180, drop the dimmed-subtitle `<div>`, add `data-testid="switch-label-${id}"` to the label, wrap with `maxWidth: 127`.

```tsx
const SwitchNodeRenderer = memo(
  ({ id, data, selected }: NodeProps<ControlFlowFlowNode>) => {
    const hints = getControlFlowVisualHints("switch");
    const accent = hints.color;
    const Icon = hints.Icon;
    const errorCount = data.errorCount ?? 0;
    const warningCount = data.warningCount ?? 0;
    return (
      <div
        data-testid={`canvas-node-${id}`}
        data-shape="diamond"
        data-node-type="switch"
        style={{
          width: 180,
          height: 180,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
      >
        {/* Visual layer only — rotated 45deg to form the diamond. */}
        <div
          data-testid={`switch-diamond-visual-${id}`}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 0,
            border: selected ? `3px solid ${accent}` : `2px solid ${accent}`,
            background: "var(--mantine-color-body, #fff)",
            boxShadow: selected
              ? `0 0 0 2px ${accent}33, 0 6px 18px rgba(0,0,0,0.22)`
              : "0 6px 12px rgba(0,0,0,0.18)",
            transform: "rotate(45deg) scale(0.7071)",
            transformOrigin: "50% 50%",
          }}
        />
        {/* Content layer (upright). Constrained to the inscribed square. */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "center",
            textAlign: "center",
            fontSize: 12,
            color: "var(--mantine-color-text, #f3f4f6)",
            maxWidth: 127,
            maxHeight: 127,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            <span style={{ color: accent, display: "inline-flex" }}>
              <Icon size={16} />
            </span>
            <span
              data-testid={`switch-label-${id}`}
              style={{
                wordBreak: "break-word",
                textAlign: "center",
                maxWidth: 127,
              }}
            >
              {data.label}
            </span>
          </div>
          {data.isEntry ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--mantine-color-dimmed, #9ca3af)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              entry
            </div>
          ) : null}
        </div>
        <ValidationBadge
          nodeId={id}
          errorCount={errorCount}
          warningCount={warningCount}
          onBadgeClick={data.onBadgeClick}
        />
        <NodeStatusBadgeOverlay nodeId={id} />
        <div
          data-testid={`switch-preview-anchor-${id}`}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translate(-50%, 6px)",
            minWidth: 200,
            zIndex: 1,
          }}
        >
          <NodePreviewOverlay nodeId={id} />
        </div>
        <NodeHandles
          nodeId={id}
          onSourceHandleEnter={data.onSourceHandleEnter}
          onSourceHandleLeave={data.onSourceHandleLeave}
          inputHandleStyle={data.inputHandleStyle}
          outputHandleStyle={data.outputHandleStyle}
          inputPillEntries={data.inputPillEntries}
          outputPillEntries={data.outputPillEntries}
          selected={selected ?? false}
        />
      </div>
    );
  },
);
SwitchNodeRenderer.displayName = "SwitchNodeRenderer";
```

The behavioural changes vs the prior code:

1. `width: 140 → 180`, `height: 140 → 180`.
2. Removed the dimmed `<div>` that rendered `{hints.displayName}{data.isEntry ? " · entry" : ""}`.
3. New dimmed `<div>` renders only when `data.isEntry` (just the literal `"entry"`).
4. Label span gets `data-testid={`switch-label-${id}`}` + `wordBreak: "break-word"` + `maxWidth: 127`.
5. Content container gets `alignItems: "center"`, `maxWidth: 127`, `maxHeight: 127` so long labels stay inside the inscribed square.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx -t "switch diamond polish"
```

Expected: 3 PASS.

Also re-run any pre-existing switch tests in the same file:
```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx -t "switch"
```

Expected: all PASS. If a pre-existing test asserts old 140 dimensions, update it to 180.

- [ ] **Step 5: Type-check + commit**

```bash
cd apps/frontend && npx tsc -p . --noEmit
```

If clean:
```bash
git add apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "$(cat <<'EOF'
fix(workflow-builder): switch diamond — drop duplicate label, enlarge to 180x180, allow wrap

Removed the dimmed `hints.displayName` subtitle that duplicated the bold label, bumped the diamond bounding box from 140 to 180 (inscribed square ~127px), and constrained the label wrapper so long names like "Branch by condition" wrap inside the visible diamond.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Type pills under the node

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.tsx`
- Create: `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.test.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`NodeHandles`, all three node renderers)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.type-pill.test.tsx`

### Step 1: Write failing tests for the new `NodeTypePillRow`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeTypePillRow } from "./NodeTypePillRow";

function renderWithMantine(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("NodeTypePillRow", () => {
  it("renders an arrow row when both sides have exactly one typed port", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: "Document" }]}
        outputs={[{ portName: "seg", kind: "Segment[]" }]}
      />,
    );
    expect(screen.getByText("DOCUMENT")).toBeInTheDocument();
    expect(screen.getByText("SEGMENT[]")).toBeInTheDocument();
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "arrow",
    );
    expect(screen.getByTestId("pill-row-arrow")).toHaveTextContent("→");
  });

  it("renders a stacked variant when either side has multiple ports", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[
          { portName: "doc", kind: "Document" },
          { portName: "extra", kind: "Segment[]" },
        ]}
        outputs={[{ portName: "out", kind: "Document" }]}
      />,
    );
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "stacked",
    );
    expect(screen.getByText("in:doc: Document")).toBeInTheDocument();
    expect(screen.getByText("in:extra: Segment[]")).toBeInTheDocument();
    expect(screen.getByText("out:out: Document")).toBeInTheDocument();
  });

  it("renders nothing when every port is untyped (kind undefined)", () => {
    const { container } = renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: undefined }]}
        outputs={[{ portName: "out", kind: undefined }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders single-side row when only inputs are typed", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: "Document" }]}
        outputs={[]}
      />,
    );
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "arrow",
    );
    expect(screen.queryByTestId("pill-row-arrow")).not.toBeInTheDocument();
    expect(screen.getByText("DOCUMENT")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (component missing)**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/NodeTypePillRow.test.tsx
```

Expected: FAIL — module `./NodeTypePillRow` not found.

- [ ] **Step 3: Implement `NodeTypePillRow`**

Create `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.tsx`:

```tsx
/**
 * Combined input → output type pill, rendered below the selected node.
 *
 * - Single-port both sides → inline row `<inputKind> → <outputKind>`.
 * - Multi-port (either side >1) → vertical stack `in:portName: KIND` /
 *   `out:portName: KIND`.
 * - All ports untyped → renders nothing.
 *
 * Kind colours reuse `ARTIFACT_REGISTRY` via the same helpers `NodeTypePill`
 * already used, so the visual treatment is consistent with prior pills.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";
import { Badge, Group, Stack } from "@mantine/core";
import type React from "react";
import type { NodeTypePillEntry } from "./NodeTypePill";

export interface NodeTypePillRowProps {
  inputs: NodeTypePillEntry[];
  outputs: NodeTypePillEntry[];
}

function elementKindOf(kind: KindRef): string {
  return kind.endsWith("[]") ? kind.slice(0, -2) : kind;
}

function colorForKind(kind: KindRef | undefined): string {
  if (kind === undefined) return "gray";
  const meta = getArtifactKindMeta(elementKindOf(kind));
  return meta?.color ?? "gray";
}

export function NodeTypePillRow({
  inputs,
  outputs,
}: NodeTypePillRowProps): React.ReactElement | null {
  const typedInputs = inputs.filter((e) => e.kind !== undefined);
  const typedOutputs = outputs.filter((e) => e.kind !== undefined);
  if (typedInputs.length === 0 && typedOutputs.length === 0) return null;

  const useStacked = inputs.length > 1 || outputs.length > 1;

  if (useStacked) {
    return (
      <Stack
        gap={2}
        data-testid="node-type-pill-row"
        data-shape="stacked"
        data-pill-anchor="under"
      >
        {inputs.map((entry) => {
          const labelKind: KindRef = entry.kind ?? "Artifact";
          return (
            <Badge
              key={`in-${entry.portName}`}
              color={colorForKind(entry.kind)}
              size="sm"
              variant="light"
              data-pill-direction="input"
              data-pill-port={entry.portName}
              data-pill-kind={labelKind}
            >
              {`in:${entry.portName}: ${labelKind}`}
            </Badge>
          );
        })}
        {outputs.map((entry) => {
          const labelKind: KindRef = entry.kind ?? "Artifact";
          return (
            <Badge
              key={`out-${entry.portName}`}
              color={colorForKind(entry.kind)}
              size="sm"
              variant="light"
              data-pill-direction="output"
              data-pill-port={entry.portName}
              data-pill-kind={labelKind}
            >
              {`out:${entry.portName}: ${labelKind}`}
            </Badge>
          );
        })}
      </Stack>
    );
  }

  // Arrow row. One side may be empty (only inputs OR only outputs typed).
  const inputBadge =
    typedInputs.length === 1 ? (
      <Badge
        color={colorForKind(typedInputs[0].kind)}
        size="sm"
        variant="light"
        data-pill-direction="input"
        data-pill-port={typedInputs[0].portName}
        data-pill-kind={typedInputs[0].kind}
      >
        {(typedInputs[0].kind ?? "Artifact").toUpperCase()}
      </Badge>
    ) : null;

  const outputBadge =
    typedOutputs.length === 1 ? (
      <Badge
        color={colorForKind(typedOutputs[0].kind)}
        size="sm"
        variant="light"
        data-pill-direction="output"
        data-pill-port={typedOutputs[0].portName}
        data-pill-kind={typedOutputs[0].kind}
      >
        {(typedOutputs[0].kind ?? "Artifact").toUpperCase()}
      </Badge>
    ) : null;

  const showArrow = inputBadge !== null && outputBadge !== null;

  return (
    <Group
      gap={6}
      wrap="nowrap"
      data-testid="node-type-pill-row"
      data-shape="arrow"
      data-pill-anchor="under"
    >
      {inputBadge}
      {showArrow ? (
        <span
          data-testid="pill-row-arrow"
          aria-hidden
          style={{ fontSize: 12, color: "var(--mantine-color-dimmed, #9ca3af)" }}
        >
          →
        </span>
      ) : null}
      {outputBadge}
    </Group>
  );
}
```

- [ ] **Step 4: Run NodeTypePillRow tests — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/NodeTypePillRow.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 5: Update `NodeHandles` to render the row under the node, not side anchors**

In `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`:

1. At the top, replace `import { NodeTypePill, type NodeTypePillEntry } from "./NodeTypePill";` with:
   ```tsx
   import { NodeTypePill, type NodeTypePillEntry } from "./NodeTypePill";
   import { NodeTypePillRow } from "./NodeTypePillRow";
   ```
2. In the `NodeHandles` component (around lines 394-537), delete the two side pill anchor `<div>` blocks (the `data-pill-anchor="input"` block at ~lines 465-481 and the `data-pill-anchor="output"` block at ~lines 510-526). Replace them with a single under-node block placed just before `</>`:

```tsx
      {selected ? (
        <div
          data-pill-anchor="under"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <NodeTypePillRow
            inputs={inputPillEntries}
            outputs={outputPillEntries}
          />
        </div>
      ) : null}
```

Keep the existing `<Tooltip>` wrappers around the input/output `<Handle>` components untouched — only the absolute-positioned pill containers are being moved/replaced.

3. Re-search the file for any other usages of the standalone `NodeTypePill` outside `NodeHandles`. There should be none after this refactor (test it via grep below). The file currently imports `NodeTypePill` from `./NodeTypePill`; that import can stay because `NodeTypePill` is still used by tests that exercise the old anchor format. The actual canvas-side rendering routes through `NodeTypePillRow` exclusively.

- [ ] **Step 6: Update existing type-pill tests**

In `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.type-pill.test.tsx`, any assertion of the form `data-pill-anchor="input"` or `data-pill-anchor="output"` must be replaced with assertions against the new under-anchor:

Search-and-replace pattern: replace tests like
```tsx
expect(node.querySelector('[data-pill-anchor="input"]')).toBeInTheDocument();
```
with
```tsx
expect(node.querySelector('[data-pill-anchor="under"]')).toBeInTheDocument();
expect(screen.getByTestId("node-type-pill-row")).toBeInTheDocument();
```

For tests asserting the absence of pills when not selected: confirm they still pass — the new code wraps the entire under-block in `selected ? ... : null`, so the same negation logic applies.

Open the file, list every assertion involving `data-pill-anchor`, and update each. The file is finite (~few hundred lines); manual update is fine.

- [ ] **Step 7: Verify offset of preview overlay doesn't collide with pill row**

The `SwitchNodeRenderer` and `ActivityNodeRenderer` both have a `*-preview-anchor-${id}` div positioned at `top: 100%; transform: translate(-50%, 6px)`. The pill row anchor in Step 5 uses `top: calc(100% + 4px)` so the two overlap only when the node is selected AND a preview is being shown (the preview overlay only renders during runs). Acceptable for this pass; we can iterate later if it becomes a problem in practice.

No change needed in this step — Step 5's pill container style already uses `top: calc(100% + 4px)` to keep the pill row below the node body.

- [ ] **Step 8: Run all canvas tests**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/
```

Expected: all PASS. Fix any test that asserts old `data-pill-anchor="input"|"output"` content by routing to the new `data-pill-anchor="under"` + `data-testid="node-type-pill-row"`.

- [ ] **Step 9: Type-check + commit**

```bash
cd apps/frontend && npx tsc -p . --noEmit
git add apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.tsx apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.type-pill.test.tsx
git commit -m "$(cat <<'EOF'
fix(workflow-builder): relocate type pills to a single under-node anchor

Replaced the two left/right pill anchors on each node with one combined input→output row anchored below the node. Single-port both sides renders as an arrow row; multi-port collapses to a stacked variant. Eliminates the visual overlap with horizontally-adjacent nodes at default 240px spacing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Hover popover — fix scroll + collision-aware placement

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.test.ts`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1855` (caller)

### Step 1: Failing tests for `findNextFreePosition`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.test.ts`, append:

```ts
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { findNextFreePosition } from "./place-extended-node";

function makeConfig(
  nodes: Array<{ id: string; x: number; y: number }>,
  edges: Array<{ id: string; source: string; target: string }> = [],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: Object.fromEntries(
      nodes.map((n) => [
        n.id,
        {
          id: n.id,
          type: "activity",
          label: n.id,
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
          metadata: { position: { x: n.x, y: n.y } },
        },
      ]),
    ),
    edges: edges.map((e) => ({ ...e, type: "normal" as const })),
    entryNodeId: nodes[0]?.id ?? "",
  };
}

describe("findNextFreePosition", () => {
  it("returns the default offset when the canvas is empty", () => {
    const config = makeConfig([{ id: "src", x: 100, y: 100 }]);
    const pos = findNextFreePosition(config, "src");
    expect(pos).toEqual({ x: 380, y: 100 }); // default dx=280, dy=0
  });

  it("steps below the existing collision when the default slot is occupied", () => {
    const config = makeConfig([
      { id: "src", x: 100, y: 100 },
      { id: "blocker", x: 380, y: 100 },
    ]);
    const pos = findNextFreePosition(config, "src");
    expect(pos.x).toBe(380);
    // Stepped vertically; +140 below or -140 above.
    expect([240, -40, 240 + 140]).toContain(pos.y === 100 ? -1 : pos.y);
    expect(pos.y).not.toBe(100);
  });

  it("places below the lowest existing outgoing-edge target for switch sources", () => {
    const config = makeConfig(
      [
        { id: "src", x: 100, y: 100 },
        { id: "case1", x: 380, y: 100 },
        { id: "case2", x: 380, y: 240 },
      ],
      [
        { id: "e1", source: "src", target: "case1" },
        { id: "e2", source: "src", target: "case2" },
      ],
    );
    // Mark src as switch type for the helper to take the switch branch.
    config.nodes.src = {
      ...config.nodes.src,
      type: "switch",
      cases: [],
    } as never;
    const pos = findNextFreePosition(config, "src");
    expect(pos.x).toBe(380);
    expect(pos.y).toBeGreaterThanOrEqual(380); // 240 + 140
  });

  it("honours dx/dy overrides", () => {
    const config = makeConfig([{ id: "src", x: 100, y: 100 }]);
    const pos = findNextFreePosition(config, "src", { dx: 200, dy: 50 });
    expect(pos).toEqual({ x: 300, y: 150 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL (function missing)**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/place-extended-node.test.ts
```

Expected: FAIL — `findNextFreePosition` not exported.

- [ ] **Step 3: Implement `findNextFreePosition`**

Replace the contents of `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts` with:

```ts
/**
 * Position helpers for placing a node added via the hover-to-extend popover
 * (US-045) or programmatic equivalents.
 *
 * `nextNodePosition` is the legacy helper that returns `sourcePos + {dx, dy}`
 * without checking for collisions. Retained as a thin convenience wrapper.
 *
 * `findNextFreePosition` reads the workflow config and avoids placing the
 * new node on top of any existing node. For switch sources with existing
 * outgoing edges, it places the new node below the lowest existing target.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";

export interface NextNodePositionOptions {
  /** Horizontal offset from the source (default 280px). */
  dx?: number;
  /** Vertical offset from the source (default 0px, same y). */
  dy?: number;
}

const COLLISION_W = 200;
const COLLISION_H = 100;
const STEP_Y = 140;
const MAX_STEPS = 8;

export function nextNodePosition(
  sourcePos: { x: number; y: number },
  options: NextNodePositionOptions = {},
): { x: number; y: number } {
  const dx = options.dx ?? 280;
  const dy = options.dy ?? 0;
  return { x: sourcePos.x + dx, y: sourcePos.y + dy };
}

function readPosition(
  config: GraphWorkflowConfig,
  nodeId: string,
): { x: number; y: number } | null {
  const node = config.nodes[nodeId];
  if (!node) return null;
  const meta = node.metadata as { position?: { x: number; y: number } } | undefined;
  const pos = meta?.position;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x, y: pos.y };
  }
  return null;
}

function collides(
  config: GraphWorkflowConfig,
  candidate: { x: number; y: number },
): boolean {
  for (const node of Object.values(config.nodes)) {
    const pos = readPosition(config, node.id);
    if (!pos) continue;
    if (
      Math.abs(pos.x - candidate.x) < COLLISION_W &&
      Math.abs(pos.y - candidate.y) < COLLISION_H
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve a placement for a new node hanging off `sourceNodeId`.
 *
 * Default candidate is `sourcePos + {dx:280, dy:0}`. If that collides with
 * any existing node, steps `y` alternately by ±STEP_Y until a free slot is
 * found, up to MAX_STEPS attempts. For switch sources with existing
 * outgoing edges, the candidate starts below the lowest existing target
 * (one extra stagger step) so cases stack rather than overlap.
 */
export function findNextFreePosition(
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  options: NextNodePositionOptions = {},
): { x: number; y: number } {
  const sourcePos = readPosition(config, sourceNodeId);
  if (!sourcePos) {
    return { x: (options.dx ?? 280) + 80, y: options.dy ?? 100 };
  }

  const dx = options.dx ?? 280;
  let dy = options.dy ?? 0;

  // Switch-specific: start below the lowest existing outgoing-edge target.
  const sourceNode = config.nodes[sourceNodeId];
  if (sourceNode?.type === "switch") {
    let lowestY: number | null = null;
    for (const edge of config.edges) {
      if (edge.source !== sourceNodeId) continue;
      const targetPos = readPosition(config, edge.target);
      if (!targetPos) continue;
      if (lowestY === null || targetPos.y > lowestY) lowestY = targetPos.y;
    }
    if (lowestY !== null) {
      dy = lowestY - sourcePos.y + STEP_Y;
    }
  }

  const base = { x: sourcePos.x + dx, y: sourcePos.y + dy };
  if (!collides(config, base)) return base;

  // Alternating step-out search: +STEP_Y, -STEP_Y, +2*STEP_Y, -2*STEP_Y, ...
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const downCandidate = { x: base.x, y: base.y + step * STEP_Y };
    if (!collides(config, downCandidate)) return downCandidate;
    const upCandidate = { x: base.x, y: base.y - step * STEP_Y };
    if (!collides(config, upCandidate)) return upCandidate;
  }

  // Fallback — bounded search exhausted; deterministically pick below.
  return { x: base.x, y: base.y + (MAX_STEPS + 1) * STEP_Y };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/place-extended-node.test.ts
```

Expected: 4 PASS plus any prior tests that still pass against `nextNodePosition`.

- [ ] **Step 5: Update the caller in `WorkflowEditorCanvas.tsx:1855`**

In `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`:

1. Change the import on line 88 from:
   ```tsx
   import { nextNodePosition } from "./place-extended-node";
   ```
   to:
   ```tsx
   import { findNextFreePosition } from "./place-extended-node";
   ```
2. In `extendFromSource` (around lines 1848-1880), replace the body:
   ```tsx
   const sourcePos = (
     sourceGraphNode.metadata as { position?: { x: number; y: number } }
   )?.position ?? { x: 0, y: 0 };
   const position = nextNodePosition(sourcePos);
   ```
   with:
   ```tsx
   const position = findNextFreePosition(config, sourceNodeId);
   ```
   Drop the `sourcePos` local since we no longer need to read it directly.

- [ ] **Step 6: Fix the hover popover scroll**

In `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx`, find the `<ScrollArea style={{ maxHeight: 360 }} type="auto">` block (around line 197) and change it to:

```tsx
<ScrollArea h={360} type="auto">
```

Also update the `<Popover.Dropdown>` (around line 181) to add `mah="calc(100vh - 120px)"`:

```tsx
<Popover.Dropdown
  data-testid="hover-extend-popover"
  onMouseEnter={onMouseEnter}
  onMouseLeave={onMouseLeave}
  p="xs"
  mah="calc(100vh - 120px)"
>
```

- [ ] **Step 7: Type-check + run all canvas tests + commit**

```bash
cd apps/frontend && npx tsc -p . --noEmit
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/
```

Expected: all PASS.

```bash
git add apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts apps/frontend/src/features/workflow-builder/canvas/place-extended-node.test.ts apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx
git commit -m "$(cat <<'EOF'
fix(workflow-builder): hover popover scroll + collision-aware node placement

ScrollArea inside the hover-extend popover now uses a definite height so the auto-scrollbar engages once entries overflow. findNextFreePosition replaces nextNodePosition at the only caller — collisions step y by 140px alternately; switch sources start the new node below the lowest existing case so branches stack instead of overlapping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Map body — synthesise group + container rendering

This task has multiple steps; the synthesis helper, the container component, the page-level wiring, the settings-panel read-only mode, and the group-selection filter.

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts`
- Create: `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.test.ts`
- Create: `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.tsx`
- Create: `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.test.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/group/create-group.ts` (filter helper)

### Step 1: Failing tests for `synthesizeMapBodyGroups`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.test.ts`:

```ts
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  SYNTHETIC_MAP_BODY_PREFIX,
  isSyntheticMapBodyGroupId,
  mergeNodeGroups,
  stripSyntheticMapBodyGroups,
  synthesizeMapBodyGroups,
} from "./map-body-groups";

function makeMapConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: {
      pre: {
        id: "pre",
        type: "activity",
        label: "pre",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 0, y: 0 } },
      },
      mapNode: {
        id: "mapNode",
        type: "map",
        label: "Process Each",
        collectionCtxKey: "items",
        itemCtxKey: "item",
        bodyEntryNodeId: "router",
        bodyExitNodeId: "exit",
      },
      router: {
        id: "router",
        type: "activity",
        label: "router",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 100, y: 200 } },
      },
      branchA: {
        id: "branchA",
        type: "activity",
        label: "A",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 300, y: 200 } },
      },
      exit: {
        id: "exit",
        type: "activity",
        label: "exit",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 500, y: 200 } },
      },
      post: {
        id: "post",
        type: "activity",
        label: "post",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 700, y: 0 } },
      },
    },
    edges: [
      { id: "e1", source: "pre", target: "mapNode", type: "normal" },
      { id: "e2", source: "router", target: "branchA", type: "normal" },
      { id: "e3", source: "branchA", target: "exit", type: "normal" },
      { id: "e4", source: "mapNode", target: "post", type: "normal" },
    ],
    entryNodeId: "pre",
  };
}

describe("synthesizeMapBodyGroups", () => {
  it("returns an empty record when no map nodes are present", () => {
    const config = makeMapConfig();
    delete (config.nodes as Record<string, unknown>).mapNode;
    expect(synthesizeMapBodyGroups(config)).toEqual({});
  });

  it("synthesizes a group containing every body node reachable from entry to exit", () => {
    const synthesised = synthesizeMapBodyGroups(makeMapConfig());
    const keys = Object.keys(synthesised);
    expect(keys).toHaveLength(1);
    const groupId = keys[0];
    expect(groupId).toBe(`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`);
    expect(synthesised[groupId].nodeIds.sort()).toEqual(
      ["branchA", "exit", "router"].sort(),
    );
    expect(synthesised[groupId].label).toContain("Process Each");
  });

  it("skips map nodes missing bodyEntryNodeId or bodyExitNodeId", () => {
    const config = makeMapConfig();
    (config.nodes.mapNode as { bodyEntryNodeId?: string }).bodyEntryNodeId =
      undefined;
    expect(synthesizeMapBodyGroups(config)).toEqual({});
  });
});

describe("isSyntheticMapBodyGroupId", () => {
  it("returns true for ids with the synthetic prefix", () => {
    expect(
      isSyntheticMapBodyGroupId(`${SYNTHETIC_MAP_BODY_PREFIX}foo`),
    ).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isSyntheticMapBodyGroupId("group_1")).toBe(false);
  });
});

describe("stripSyntheticMapBodyGroups", () => {
  it("removes only synthetic group entries from a nodeGroups map", () => {
    const result = stripSyntheticMapBodyGroups({
      group_1: { label: "user", nodeIds: ["a", "b"] },
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["c"],
      },
    });
    expect(Object.keys(result)).toEqual(["group_1"]);
  });
});

describe("mergeNodeGroups", () => {
  it("returns user-named groups verbatim when no synthetic input is supplied", () => {
    const user = { group_1: { label: "u", nodeIds: ["a"] } };
    expect(mergeNodeGroups(user, {})).toEqual(user);
  });
  it("favours user-named groups when the same node is in both", () => {
    const user = { group_1: { label: "u", nodeIds: ["router"] } };
    const synth = {
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["router", "branchA"],
      },
    };
    const merged = mergeNodeGroups(user, synth);
    // Synthetic still present, but `router` removed from it.
    expect(
      merged[`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`].nodeIds,
    ).toEqual(["branchA"]);
    expect(merged.group_1.nodeIds).toEqual(["router"]);
  });
  it("drops synthetic groups whose members are entirely consumed by user groups", () => {
    const user = {
      group_1: { label: "u", nodeIds: ["router", "branchA", "exit"] },
    };
    const synth = {
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["router", "branchA", "exit"],
      },
    };
    const merged = mergeNodeGroups(user, synth);
    expect(
      merged[`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`],
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/map-body-groups.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `map-body-groups.ts`**

Create `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts`:

```ts
/**
 * Render-time helpers that synthesise a derived `nodeGroups` entry for every
 * `map` node's body in a workflow config (Spec §6).
 *
 * The synthesis is purely a projection — it is never written into the saved
 * JSON. Callers merge the result with `config.nodeGroups` and strip the
 * synthetic entries again before persistence (see `stripSyntheticMapBodyGroups`).
 */

import type { GraphWorkflowConfig, NodeGroup } from "../../../types/workflow";

export const SYNTHETIC_MAP_BODY_PREFIX = "__map_body_";

export function isSyntheticMapBodyGroupId(groupId: string): boolean {
  return groupId.startsWith(SYNTHETIC_MAP_BODY_PREFIX);
}

/**
 * Walks every `map` node with both `bodyEntryNodeId` and `bodyExitNodeId`
 * set, BFS-traverses the edges from entry to exit, and returns one
 * synthetic `NodeGroup` per map keyed by `__map_body_<mapNodeId>`. The
 * group's `nodeIds` is the union of entry, exit, and every reachable
 * node between them.
 */
export function synthesizeMapBodyGroups(
  config: GraphWorkflowConfig,
): Record<string, NodeGroup> {
  const out: Record<string, NodeGroup> = {};
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as {
      id: string;
      label?: string;
      bodyEntryNodeId?: string;
      bodyExitNodeId?: string;
    };
    if (!mapNode.bodyEntryNodeId || !mapNode.bodyExitNodeId) continue;

    const bodyIds = collectReachable(
      config,
      mapNode.bodyEntryNodeId,
      mapNode.bodyExitNodeId,
    );
    if (bodyIds.size === 0) continue;

    const groupId = `${SYNTHETIC_MAP_BODY_PREFIX}${mapNode.id}`;
    out[groupId] = {
      label: `${mapNode.label ?? mapNode.id} · body`,
      description: `Body of map node "${mapNode.label ?? mapNode.id}". Updates automatically.`,
      color: "#22c55e",
      nodeIds: [...bodyIds],
      exposedParams: [],
    };
  }
  return out;
}

/**
 * BFS from `entryId` following outgoing edges; stops at `exitId` (inclusive)
 * but continues exploring siblings so all body branches are collected.
 */
function collectReachable(
  config: GraphWorkflowConfig,
  entryId: string,
  exitId: string,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of config.edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  const visited = new Set<string>();
  const queue: string[] = [entryId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (visited.has(id)) continue;
    if (!config.nodes[id]) continue;
    visited.add(id);
    if (id === exitId) continue;
    const next = adjacency.get(id) ?? [];
    for (const target of next) {
      if (!visited.has(target)) queue.push(target);
    }
  }
  // Ensure exit is present even if unreachable through edges (defensive).
  if (config.nodes[exitId]) visited.add(exitId);
  return visited;
}

/**
 * Strips synthetic map-body groups from a `nodeGroups` map. Callers use this
 * to guarantee they never persist synthetic entries into `config.nodeGroups`.
 */
export function stripSyntheticMapBodyGroups(
  groups: Record<string, NodeGroup> | undefined,
): Record<string, NodeGroup> {
  const out: Record<string, NodeGroup> = {};
  for (const [key, value] of Object.entries(groups ?? {})) {
    if (isSyntheticMapBodyGroupId(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Combines user-named groups with synthetic map-body groups. User-named
 * groups win on overlapping `nodeIds`: any node already in a user-named
 * group is removed from the synthetic entry's `nodeIds`. A synthetic
 * entry whose `nodeIds` ends up empty is dropped.
 */
export function mergeNodeGroups(
  userGroups: Record<string, NodeGroup>,
  syntheticGroups: Record<string, NodeGroup>,
): Record<string, NodeGroup> {
  const claimedByUser = new Set<string>();
  for (const group of Object.values(userGroups)) {
    for (const id of group.nodeIds) claimedByUser.add(id);
  }

  const out: Record<string, NodeGroup> = { ...userGroups };
  for (const [groupId, group] of Object.entries(syntheticGroups)) {
    const filteredIds = group.nodeIds.filter((id) => !claimedByUser.has(id));
    if (filteredIds.length === 0) continue;
    out[groupId] = { ...group, nodeIds: filteredIds };
  }
  return out;
}
```

- [ ] **Step 4: Run synth tests — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/map-body-groups.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Commit the pure helpers**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts apps/frontend/src/features/workflow-builder/canvas/map-body-groups.test.ts
git commit -m "feat(workflow-builder): map-body-groups helpers — synthesize, strip, merge

Pure helpers for render-time synthesis of a nodeGroup per map node body. Synthesis keys on '__map_body_<mapNodeId>'; merge favours user-named groups on overlap; strip removes synthetic entries before persistence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Step 6: Failing tests for the `MapBodyContainer` xyflow node

- [ ] **Step 6: Write the failing tests**

Create `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapBodyContainer, type MapBodyContainerFlowNode } from "./MapBodyContainer";

function wrap(node: React.ReactNode) {
  return (
    <MantineProvider>
      <ReactFlowProvider>{node}</ReactFlowProvider>
    </MantineProvider>
  );
}

function makeNode(): MapBodyContainerFlowNode {
  return {
    id: "container-mapNode",
    type: "map-body-container",
    position: { x: 0, y: 0 },
    data: {
      groupId: "__map_body_mapNode",
      label: "Process Each · body",
      color: "#22c55e",
      width: 600,
      height: 300,
      onClick: () => {},
    },
  };
}

describe("MapBodyContainer", () => {
  it("renders the label and uses the supplied size", () => {
    render(wrap(<MapBodyContainer {...({} as never)} {...{ id: "x", data: makeNode().data, selected: false }} />));
    const el = screen.getByTestId("map-body-container-__map_body_mapNode");
    expect(el).toHaveTextContent("Process Each · body");
    expect(el).toHaveStyle({ width: "600px", height: "300px" });
  });

  it("invokes onClick when clicked", async () => {
    let clicks = 0;
    const data = { ...makeNode().data, onClick: () => { clicks += 1; } };
    render(wrap(<MapBodyContainer {...({} as never)} {...{ id: "x", data, selected: false }} />));
    screen.getByTestId("map-body-container-__map_body_mapNode").click();
    expect(clicks).toBe(1);
  });
});
```

- [ ] **Step 7: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/MapBodyContainer.test.tsx
```

- [ ] **Step 8: Implement `MapBodyContainer.tsx`**

Create `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.tsx`:

```tsx
/**
 * Background container rendered behind the body nodes of a map node. Provides
 * the visual "this is the body of the map" signal in non-simplified view.
 *
 * Pure presentational; the canvas computes its size + position from the
 * bounding box of the member nodes' `metadata.position`.
 */

import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";

export interface MapBodyContainerData {
  groupId: string;
  label: string;
  color?: string;
  width: number;
  height: number;
  onClick: () => void;
}

export type MapBodyContainerFlowNode = Node<MapBodyContainerData, "map-body-container">;

export const MapBodyContainer = memo(
  ({ data, selected }: NodeProps<MapBodyContainerFlowNode>) => {
    const accent = data.color ?? "#22c55e";
    return (
      <div
        data-testid={`map-body-container-${data.groupId}`}
        data-synthetic-group="true"
        onClick={data.onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            data.onClick();
          }
        }}
        role="button"
        tabIndex={0}
        style={{
          width: data.width,
          height: data.height,
          border: `1px dashed ${accent}`,
          background: `${accent}11`,
          borderRadius: 12,
          padding: 4,
          position: "relative",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 12,
            fontSize: 11,
            fontWeight: 600,
            color: accent,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            background: "var(--mantine-color-body, #1a1b1e)",
            padding: "0 4px",
            border: `1px solid ${accent}`,
            borderRadius: 4,
            ...(selected ? { boxShadow: `0 0 0 2px ${accent}55` } : {}),
          }}
        >
          {data.label}
        </div>
      </div>
    );
  },
);

MapBodyContainer.displayName = "MapBodyContainer";
```

- [ ] **Step 9: Run — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/MapBodyContainer.test.tsx
```

- [ ] **Step 10: Commit the container component**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.tsx apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.test.tsx
git commit -m "feat(workflow-builder): MapBodyContainer xyflow node — background rectangle around map body

Presentational node type with a dashed border and labeled top-edge chip. Sized from the bounding box of body member node positions; clicks bubble to the host so the right-rail can focus the group settings panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Step 11: Wire synthesis into the canvas projection

- [ ] **Step 11: Update `WorkflowEditorCanvas.tsx` to project the container**

In `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`:

1. Add imports near the top (after the existing `GroupChipNode` import around line 77):
   ```tsx
   import {
     MapBodyContainer,
     type MapBodyContainerFlowNode,
   } from "./MapBodyContainer";
   import {
     SYNTHETIC_MAP_BODY_PREFIX,
     isSyntheticMapBodyGroupId,
   } from "./map-body-groups";
   ```

2. Add `"map-body-container": MapBodyContainer` to the `NODE_TYPES` map around line 941:
   ```tsx
   const NODE_TYPES = {
     activity: ActivityNodeRenderer,
     switch: SwitchNodeRenderer,
     map: ControlFlowRectangleRenderer,
     join: ControlFlowRectangleRenderer,
     childWorkflow: ControlFlowRectangleRenderer,
     pollUntil: ControlFlowRectangleRenderer,
     humanGate: ControlFlowRectangleRenderer,
     source: SourceNodeRenderer,
     "group-chip": GroupChipNode,
     "map-body-container": MapBodyContainer,
   };
   ```
   (Match the existing entries — if `source` isn't in your local file, omit it. Use the file's actual layout.)

3. Extend the `FlowNode` union type alias around line 191 to include `MapBodyContainerFlowNode`:
   ```tsx
   type FlowNode =
     | ActivityFlowNode
     | ControlFlowFlowNode
     | SourceFlowNode
     | GroupChipFlowNode
     | MapBodyContainerFlowNode;
   ```
   (Again, match the existing union members.)

4. Add a helper next to `projectChipFlowNodes` (around line 1158) that derives container nodes from a `Record<string, NodeGroup>` filtered to synthetic entries:

```tsx
/**
 * Project one `MapBodyContainerFlowNode` per synthetic map-body group. Size
 * is the bounding box of the member nodes' positions (padded). Clicks call
 * `onGroupChipClick(groupId)` so the host's right-rail focuses the group.
 */
function projectMapBodyContainerNodes(
  syntheticGroups: Record<string, NodeGroup>,
  config: GraphWorkflowConfig,
  onGroupChipClick?: (groupId: string) => void,
): MapBodyContainerFlowNode[] {
  const out: MapBodyContainerFlowNode[] = [];
  for (const [groupId, group] of Object.entries(syntheticGroups)) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let any = false;
    for (const nodeId of group.nodeIds) {
      const meta = config.nodes[nodeId]?.metadata as
        | { position?: { x: number; y: number } }
        | undefined;
      const pos = meta?.position;
      if (!pos) continue;
      any = true;
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
    if (!any) continue;
    const pad = 40;
    const nodeFootprintW = 220;
    const nodeFootprintH = 100;
    out.push({
      id: `container-${groupId}`,
      type: "map-body-container",
      position: { x: minX - pad, y: minY - pad },
      data: {
        groupId,
        label: group.label,
        color: group.color,
        width: maxX - minX + nodeFootprintW + pad * 2,
        height: maxY - minY + nodeFootprintH + pad * 2,
        onClick: () => onGroupChipClick?.(groupId),
      },
      // Render BEHIND member nodes so clicks on member nodes still hit them.
      zIndex: -1,
      selectable: false,
      draggable: false,
    });
  }
  return out;
}
```

5. In the structural-projection `useEffect` (around line 1397-1435), when `!simplifiedView`, additionally compute synthetic containers and prepend them:

```tsx
} else {
  const userGroups = config.nodeGroups ?? {};
  const syntheticGroups: Record<string, NodeGroup> = {};
  for (const [k, v] of Object.entries(userGroups)) {
    if (isSyntheticMapBodyGroupId(k)) syntheticGroups[k] = v;
  }
  const containerNodes = projectMapBodyContainerNodes(
    syntheticGroups,
    config,
    onGroupChipClick,
  );
  const normalNodes = projectFlowNodes(
    config,
    selectedNodeId,
    projectionCallbacks,
  );
  setInternalNodes([...containerNodes, ...normalNodes]);
}
```

(The container nodes are listed first so they render first; xyflow's `zIndex: -1` then pushes them behind the activity nodes.)

6. In the simplified-view branch (the `if (simplifiedView)` arm of the same effect), the synthetic groups will naturally appear as chips via the existing `projectGroupedConfig` call IF they're present in `config.nodeGroups`. The next sub-task (page-level wiring) puts them there for the duration of canvas rendering.

- [ ] **Step 12: Wire synthesis at the page level**

In `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`:

1. Add imports near the top:
   ```tsx
   import {
     mergeNodeGroups,
     stripSyntheticMapBodyGroups,
     synthesizeMapBodyGroups,
   } from "./canvas/map-body-groups";
   ```

2. After the `const validation = useGraphValidation(config);` line (around line 238), add:

```tsx
// Render-time synthesis of map-body groups (Spec §6).
// Synthetic entries are NEVER persisted; they're stripped from any config
// update the canvas dispatches back through `onConfigChange`.
const displayConfig = useMemo<GraphWorkflowConfig>(() => {
  const synthetic = synthesizeMapBodyGroups(config);
  if (Object.keys(synthetic).length === 0) return config;
  return {
    ...config,
    nodeGroups: mergeNodeGroups(config.nodeGroups ?? {}, synthetic),
  };
}, [config]);

const handleCanvasConfigChange = useCallback(
  (next: GraphWorkflowConfig) => {
    if (next.nodeGroups) {
      setConfig({
        ...next,
        nodeGroups: stripSyntheticMapBodyGroups(next.nodeGroups),
      });
      return;
    }
    setConfig(next);
  },
  [],
);
```

3. Wire the canvas to receive `displayConfig` and `handleCanvasConfigChange`:
   - On the `<WorkflowEditorCanvas>` JSX (around line 1079-1090), change `config={config}` → `config={displayConfig}` and `onConfigChange={setConfig}` → `onConfigChange={handleCanvasConfigChange}`.

4. Wire the `NodeSettingsPanel` to receive `displayConfig` so the right-rail can resolve synthetic group lookups too:
   - On `<NodeSettingsPanel>` (around line 1092-1099), change `config={config}` → `config={displayConfig}`. Leave `onConfigChange={setConfig}` as-is — settings-panel changes never touch synthetic groups.

5. Wire validation to use `config` (the persisted one), not `displayConfig`, so synthetic groups don't show up as validation surface — this is already the case (`useGraphValidation(config)` reads `config` directly). No change needed.

- [ ] **Step 13: Type-check, run canvas tests, eyeball**

```bash
cd apps/frontend && npx tsc -p . --noEmit
cd apps/frontend && npx vitest run src/features/workflow-builder/
```

Fix any failures. Most likely: previously-fingerprinted projections will include the synthetic groups; that's expected — the fingerprint should now incorporate `displayConfig.nodeGroups` (it already does because the canvas reads `config.nodeGroups` which is now the merged map).

- [ ] **Step 14: Commit page+canvas wiring**

```bash
git add apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx
git commit -m "feat(workflow-builder): wire map-body synthesis into canvas + page

Page synthesises map-body groups, merges them with user-named groups for display, and strips them before any config update is persisted. Canvas projects one MapBodyContainer per synthetic group in non-simplified view; simplified view falls through to the existing chip projection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Step 15: GroupNodeSettings — read-only mode for synthetic groups

- [ ] **Step 15: Write failing tests for the read-only mode**

Open `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.test.tsx`. Add:

```tsx
describe("GroupNodeSettings — synthetic map-body group", () => {
  it("renders a read-only banner and no inputs / delete button", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        body1: {
          id: "body1",
          type: "activity",
          label: "body1",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "body1",
      nodeGroups: {
        __map_body_mapNode: {
          label: "Process Each · body",
          nodeIds: ["body1"],
          exposedParams: [],
        },
      },
    };
    render(
      <MantineProvider>
        <GroupNodeSettings
          groupId="__map_body_mapNode"
          config={config}
          onConfigChange={() => {}}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByTestId("group-settings-synthetic-banner"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("group-settings-delete")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-settings-label")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-settings-icon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-settings-color")).not.toBeInTheDocument();
  });
});
```

Add the necessary imports at the top of the test file (`MantineProvider`, `GraphWorkflowConfig`, `render`, `screen`).

- [ ] **Step 16: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/settings/group/GroupNodeSettings.test.tsx
```

Expected: FAIL — synthetic banner not present.

- [ ] **Step 17: Add the read-only branch to `GroupNodeSettings`**

In `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx`:

1. Add the import at the top:
   ```tsx
   import { isSyntheticMapBodyGroupId } from "../../canvas/map-body-groups";
   ```

2. Inside the `GroupNodeSettings` function, immediately after the `if (!group) return ...` block (around line 89), add:

```tsx
if (isSyntheticMapBodyGroupId(groupId)) {
  return (
    <Stack
      gap="md"
      data-testid="group-node-settings"
      data-group-id={groupId}
      p="md"
    >
      <Stack gap={4}>
        <Title order={5} m={0}>
          {group.label}
        </Title>
        <Text
          size="xs"
          c="dimmed"
          data-testid="group-settings-synthetic-banner"
        >
          This group reflects the body of a map node and updates automatically. It cannot be renamed or deleted.
        </Text>
      </Stack>
      <Divider />
      <Box data-testid="group-settings-node-list">
        <Text size="xs" fw={600} mb={4}>
          Members ({group.nodeIds.length})
        </Text>
        {group.nodeIds.length === 0 ? (
          <Text size="10px" c="dimmed">
            No nodes.
          </Text>
        ) : (
          <Stack gap={4}>
            {group.nodeIds.map((nodeId) => {
              const member = config.nodes[nodeId];
              const display = member?.label ?? nodeId;
              return (
                <Text key={nodeId} size="xs">
                  {display}
                </Text>
              );
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
```

- [ ] **Step 18: Run tests — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/settings/group/GroupNodeSettings.test.tsx
```

- [ ] **Step 19: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.test.tsx
git commit -m "feat(workflow-builder): GroupNodeSettings read-only banner for synthetic map-body groups

Synthetic groups (id prefix '__map_body_') are recomputed every render from the map node's bodyEntryNodeId/bodyExitNodeId, so the right-rail hides rename/icon/colour/delete controls and shows an explanatory banner instead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Step 20: Filter synthetic body members out of "Group selected"

- [ ] **Step 20: Write failing tests**

Add to `apps/frontend/src/features/workflow-builder/group/create-group.test.ts` (or create the file if it doesn't exist alongside `create-group.ts`):

```ts
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { filterOutSyntheticBodyMembers } from "./create-group";

describe("filterOutSyntheticBodyMembers", () => {
  it("returns the selection unchanged when no map bodies are present", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        a: {
          id: "a",
          type: "activity",
          label: "a",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        b: {
          id: "b",
          type: "activity",
          label: "b",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "a",
    };
    expect(filterOutSyntheticBodyMembers(config, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("drops node ids that belong to a synthetic map-body group", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        outer: {
          id: "outer",
          type: "activity",
          label: "outer",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        mapNode: {
          id: "mapNode",
          type: "map",
          label: "m",
          collectionCtxKey: "x",
          itemCtxKey: "y",
          bodyEntryNodeId: "bodyA",
          bodyExitNodeId: "bodyA",
        },
        bodyA: {
          id: "bodyA",
          type: "activity",
          label: "bodyA",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "outer",
    };
    expect(
      filterOutSyntheticBodyMembers(config, ["outer", "bodyA", "mapNode"]),
    ).toEqual(["outer", "mapNode"]);
  });
});
```

- [ ] **Step 21: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/group/create-group.test.ts
```

- [ ] **Step 22: Implement the filter**

In `apps/frontend/src/features/workflow-builder/group/create-group.ts`, append:

```ts
import { synthesizeMapBodyGroups } from "../canvas/map-body-groups";

/**
 * Returns a subset of `selectedNodeIds` excluding any node that belongs to a
 * synthetic map-body group. Used by the "Group selected" top-bar action so
 * the user can't merge body nodes into a manual group — those are managed
 * automatically by the map node.
 */
export function filterOutSyntheticBodyMembers(
  config: GraphWorkflowConfig,
  selectedNodeIds: string[],
): string[] {
  const synthetic = synthesizeMapBodyGroups(config);
  const blocked = new Set<string>();
  for (const group of Object.values(synthetic)) {
    for (const id of group.nodeIds) blocked.add(id);
  }
  return selectedNodeIds.filter((id) => !blocked.has(id));
}
```

- [ ] **Step 23: Wire into the page handler**

In `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`:

1. Add the import:
   ```tsx
   import {
     createGroupFromSelection,
     filterOutSyntheticBodyMembers,
   } from "./group/create-group";
   ```
   (Replace the existing `createGroupFromSelection` import.)

2. Update `handleGroupSelected` (around line 270-279):

```tsx
const handleGroupSelected = useCallback(() => {
  const eligibleIds = filterOutSyntheticBodyMembers(config, selectedNodeIds);
  if (eligibleIds.length < 2) {
    notifications.show({
      color: "yellow",
      title: "Group selected",
      message: "Need 2+ selectable nodes. Map body members are grouped automatically.",
    });
    return;
  }
  const { config: nextConfig, newGroupId } = createGroupFromSelection(
    config,
    eligibleIds,
  );
  setConfig(nextConfig);
  setSelectedNodeIdState(null);
  setActiveGroupId(newGroupId);
}, [config, selectedNodeIds]);
```

- [ ] **Step 24: Run tests + commit**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/
cd apps/frontend && npx tsc -p . --noEmit
git add apps/frontend/src/features/workflow-builder/group/create-group.ts apps/frontend/src/features/workflow-builder/group/create-group.test.ts apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx
git commit -m "feat(workflow-builder): Group selected skips synthetic map-body members

Body nodes of a map are already grouped by synthesis; allowing them into a manual group would cause overlap with the synthetic group on the canvas. The page filters them out before calling createGroupFromSelection and toasts a warning if the remaining selection has fewer than 2 nodes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Drag-from-palette

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
- Test: `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.test.tsx`

### Step 1: Tests for drag payload on activity + control-flow rows

- [ ] **Step 1: Write the failing tests**

Open `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.test.tsx`. Append:

```tsx
describe("ActivityPalette — drag-from-palette payloads (Task 5)", () => {
  function makeProps() {
    return {
      onAddActivity: vi.fn(),
      onAddControlFlowNode: vi.fn(),
      onAddSource: vi.fn(),
      onAddDynamicNode: vi.fn(),
    };
  }

  it("activity rows expose a JSON drag payload with kind 'activity'", () => {
    render(
      <MantineProvider>
        <ActivityPalette {...makeProps()} />
      </MantineProvider>,
    );
    const row = screen
      .getAllByText(/^[a-z]+(?:\.[A-Za-z0-9_]+)$/, { selector: "div" })
      .find((el) => el.textContent?.includes("."));
    const draggable = row?.closest('[draggable="true"]');
    expect(draggable).not.toBeNull();
    const dataTransfer = new DataTransfer();
    const dragEvent = new DragEvent("dragstart", {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    draggable!.dispatchEvent(dragEvent);
    const raw = dataTransfer.getData("application/x-workflow-palette");
    const payload = JSON.parse(raw);
    expect(payload.kind).toBe("activity");
    expect(typeof payload.activityType).toBe("string");
  });

  it("control-flow rows expose a JSON drag payload with kind 'controlFlow'", () => {
    render(
      <MantineProvider>
        <ActivityPalette {...makeProps()} />
      </MantineProvider>,
    );
    const row = screen.getByTestId("control-flow-palette-entry-switch");
    expect(row.closest('[draggable="true"]')).not.toBeNull();
    const dataTransfer = new DataTransfer();
    const dragEvent = new DragEvent("dragstart", {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    row.dispatchEvent(dragEvent);
    const raw = dataTransfer.getData("application/x-workflow-palette");
    const payload = JSON.parse(raw);
    expect(payload).toEqual({ kind: "controlFlow", type: "switch" });
  });
});
```

(If `vi` or `MantineProvider` isn't imported in the file, add them at the top.)

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/palette/ActivityPalette.test.tsx -t "drag-from-palette"
```

Expected: FAIL — rows aren't draggable yet.

- [ ] **Step 3: Add draggable wiring to activity + control-flow rows**

In `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`:

1. The existing activity-row `<Group>` inside the `entries.map((entry) => { ... })` block (around lines 322-368) currently is not `draggable`. Replace it with:

```tsx
<Tooltip
  key={entry.activityType}
  label={entry.description}
  multiline
  w={260}
  withArrow
  position="right"
  openDelay={400}
>
  <Group
    gap="xs"
    wrap="nowrap"
    onClick={() => onAddActivity(entry.activityType)}
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(
        "application/x-workflow-palette",
        JSON.stringify({ kind: "activity", activityType: entry.activityType }),
      );
      e.dataTransfer.effectAllowed = "copy";
    }}
    data-testid={`activity-palette-entry-${entry.activityType}`}
    style={{
      cursor: "grab",
      padding: "6px 8px",
      borderRadius: 6,
      borderLeftWidth: 3,
      borderLeftStyle: "solid",
      borderLeftColor: hints.color,
      background: "var(--mantine-color-default-hover, #25262b)",
    }}
  >
    <ActionIcon
      variant="transparent"
      color="gray"
      size="sm"
      style={{ pointerEvents: "none" }}
    >
      <span>{hints.icon}</span>
    </ActionIcon>
    <Box style={{ minWidth: 0, flex: 1 }}>
      <Text size="xs" fw={500} truncate>
        {entry.displayName}
      </Text>
      <Text size="10px" c="dimmed" ff="monospace" truncate>
        {entry.activityType}
      </Text>
    </Box>
  </Group>
</Tooltip>
```

2. In `ControlFlowPaletteRow` (around lines 560-606), add `draggable + onDragStart`:

```tsx
function ControlFlowPaletteRow({ entry, onClick }: ControlFlowPaletteRowProps) {
  const Icon = CONTROL_FLOW_ICONS[entry.type];
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      "application/x-workflow-palette",
      JSON.stringify({ kind: "controlFlow", type: entry.type }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <Tooltip
      label={entry.description}
      multiline
      w={260}
      withArrow
      position="right"
      openDelay={400}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        data-testid={`control-flow-palette-entry-${entry.type}`}
        style={{
          cursor: "grab",
          padding: "6px 8px",
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: "#8b5cf6",
          background: "var(--mantine-color-default-hover, #25262b)",
        }}
      >
        <ActionIcon
          variant="transparent"
          color="violet"
          size="sm"
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          {Icon ? <Icon size={16} /> : null}
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={500} truncate>
            {entry.displayName}
          </Text>
          <Text size="10px" c="dimmed" ff="monospace" truncate>
            {entry.type}
          </Text>
        </Box>
      </Group>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Run drag-payload tests — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/palette/ActivityPalette.test.tsx -t "drag-from-palette"
```

- [ ] **Step 5: Add tests for the canvas drop handler at the page level**

Open `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx`. Append:

```tsx
describe("WorkflowEditorV2Page — drag-and-drop from palette", () => {
  it("dropping a control-flow payload on the canvas adds the node at the drop position", async () => {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/workflows/create-v2"]}>
          <Routes>
            <Route
              path="/workflows/create-v2"
              element={<WorkflowEditorV2Page mode="create" />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    const dropTarget = await screen.findByTestId("workflow-editor-canvas-drop");
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(
      "application/x-workflow-palette",
      JSON.stringify({ kind: "controlFlow", type: "switch" }),
    );
    const dropEvent = new DragEvent("drop", {
      dataTransfer,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    });
    dropTarget.dispatchEvent(dropEvent);
    // After drop, a switch_1 node should appear in the editor's config; we
    // verify via xyflow's data-testid on the rendered node.
    expect(
      await screen.findByTestId("canvas-node-switch_1"),
    ).toBeInTheDocument();
  });
});
```

Imports needed at the top of the file: `MantineProvider`, `MemoryRouter`, `Routes`, `Route`, `screen`, `render`.

- [ ] **Step 6: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx -t "drag-and-drop"
```

Expected: FAIL — `workflow-editor-canvas-drop` not found; no drop handler.

- [ ] **Step 7: Add drop handler + position override**

In `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`:

1. Extract the stagger position into a helper next to `makeNodeId` at the bottom of the file:

```ts
function defaultStaggerPosition(config: GraphWorkflowConfig): {
  x: number;
  y: number;
} {
  const offsetIndex = Object.keys(config.nodes).length;
  return {
    x: 80 + offsetIndex * 240,
    y: 100 + (offsetIndex % 3) * 140,
  };
}
```

2. Update each of `addActivity`, `addControlFlowNode`, `addSource`, `addDynamicNode` to accept an optional `position?: { x: number; y: number }`. Inside each, replace the hardcoded `x = 80 + offsetIndex * 240` block with:

```ts
const pos = position ?? defaultStaggerPosition(config);
```

Then use `pos` wherever `{ x: 80 + offsetIndex * 240, y: 100 + (offsetIndex % 3) * 140 }` appears in the current code. Example for `addActivity`:

```tsx
const addActivity = useCallback(
  (activityType: string, position?: { x: number; y: number }) => {
    const entry = ACTIVITY_CATALOG[activityType] as
      | ActivityCatalogEntry
      | undefined;
    if (!entry) return;
    const id = makeNodeId(config, activityType);
    const pos = position ?? defaultStaggerPosition(config);
    const inputs = entry.inputs.map((p) => ({ port: p.name, ctxKey: p.name }));
    const outputs = entry.outputs.map((p) => ({
      port: p.name,
      ctxKey: p.name,
    }));
    const newNode: ActivityNode = {
      id,
      type: "activity",
      label: entry.displayName ?? entry.activityType,
      activityType,
      inputs,
      outputs,
      parameters: {},
      metadata: { position: pos },
    };
    setConfig((prev) => {
      const nextEntryNodeId = prev.entryNodeId === "" ? id : prev.entryNodeId;
      const nextNodes = { ...prev.nodes, [id]: newNode };
      const nextCtx = { ...prev.ctx };
      for (const binding of [...inputs, ...outputs]) {
        if (!nextCtx[binding.ctxKey]) {
          nextCtx[binding.ctxKey] = { type: "string" };
        }
      }
      return {
        ...prev,
        nodes: nextNodes,
        ctx: nextCtx,
        entryNodeId: nextEntryNodeId,
      };
    });
    setSelectedNodeId(id);
  },
  [config],
);
```

Apply the equivalent change to `addControlFlowNode`, `addSource`, and `addDynamicNode` (each currently does the same `x = 80 + offsetIndex*240, y = ...` thing — replace with `pos = position ?? defaultStaggerPosition(config)`).

3. Add a drop handler and wire it onto the canvas wrapper. In the JSX (around line 1050), replace the existing `<Box style={{ flex: 1, minWidth: 0, position: "relative" }}>` with:

```tsx
<Box
  style={{ flex: 1, minWidth: 0, position: "relative" }}
  data-testid="workflow-editor-canvas-drop"
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }}
  onDrop={(e) => {
    const raw = e.dataTransfer.getData("application/x-workflow-palette");
    if (!raw) return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    const p = payload as {
      kind?: string;
      activityType?: string;
      type?: string;
      sourceType?: string;
      slug?: string;
    };
    const instance = reactFlowRef.current;
    const position = instance
      ? instance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      : undefined;
    switch (p.kind) {
      case "activity":
        if (p.activityType) addActivity(p.activityType, position);
        break;
      case "controlFlow":
        if (p.type) addControlFlowNode(p.type as ControlFlowNodeType, position);
        break;
      case "source":
        if (p.sourceType) addSource(p.sourceType, position);
        break;
      case "dynamic":
        if (p.slug) addDynamicNode(p.slug, position);
        break;
      default:
        break;
    }
  }}
>
```

(Match the existing closing tag.)

- [ ] **Step 8: Type-check, run tests**

```bash
cd apps/frontend && npx tsc -p . --noEmit
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx -t "drag-and-drop"
cd apps/frontend && npx vitest run src/features/workflow-builder/palette/
```

Expected: PASS. If click-to-add tests fail because of the new optional `position` arg, they shouldn't — TypeScript treats it as optional.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx apps/frontend/src/features/workflow-builder/palette/ActivityPalette.test.tsx apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx
git commit -m "$(cat <<'EOF'
feat(workflow-builder): drag-from-palette wiring

Activity + control-flow palette rows now set a JSON drag payload on the `application/x-workflow-palette` mime type (sources/dynamic already did). The canvas wrapper accepts the drop, converts client coords to flow coords via reactFlowInstance.screenToFlowPosition, and routes to the existing addX handlers via an optional position override.

Click-to-add still works and uses the existing stagger formula.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Top bar — three zones + Mantine `<Menu>`

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` (header markup, lines 760-941)
- Test: `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx`

### Step 1: Failing tests for the new top-bar layout

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx`:

```tsx
describe("WorkflowEditorV2Page — top bar (Task 6)", () => {
  function renderEditor() {
    return render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/workflows/create-v2"]}>
          <Routes>
            <Route
              path="/workflows/create-v2"
              element={<WorkflowEditorV2Page mode="create" />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
  }

  it("renders the title in the left zone with counts beneath", () => {
    renderEditor();
    expect(screen.getByTestId("topbar-zone-left")).toHaveTextContent(
      /Workflow editor/,
    );
    expect(screen.getByTestId("topbar-zone-left")).toHaveTextContent(/node/);
  });

  it("renders the primary cluster in the right zone with Save and Run", () => {
    renderEditor();
    const right = screen.getByTestId("topbar-zone-right");
    expect(within(right).getByTestId("save-button")).toBeInTheDocument();
    expect(
      within(right).getByTestId("run-this-workflow-button"),
    ).toBeInTheDocument();
  });

  it("opens the overflow Menu and lists the secondary actions", async () => {
    renderEditor();
    const more = screen.getByTestId("topbar-more-button");
    more.click();
    expect(await screen.findByTestId("topbar-menu-history")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-run-history")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-save-as-library")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-auto-arrange")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-group-selected")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-simplified-view")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-workflow-settings")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-menu-form-preview")).toBeInTheDocument();
  });

  it("disables History and Run history menu items in create mode", async () => {
    renderEditor();
    screen.getByTestId("topbar-more-button").click();
    expect(await screen.findByTestId("topbar-menu-history")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    expect(screen.getByTestId("topbar-menu-run-history")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });
});
```

Imports: `within`, `MantineProvider`, `MemoryRouter`, `Routes`, `Route` if not already imported.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx -t "top bar"
```

Expected: FAIL — testids don't exist; layout is single-zone.

- [ ] **Step 3: Refactor the header markup**

In `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`, replace the existing `<Group justify="space-between" wrap="nowrap" gap="sm" p="sm" ...>` block (lines 760-941, currently containing the title `<Stack>` + the inline buttons `<Group>`) with the following:

1. Add the `Menu` and `IconDots` imports at the top alongside the existing Mantine + Tabler imports:
   ```tsx
   import { Menu } from "@mantine/core";
   import { IconDots } from "@tabler/icons-react";
   ```

2. Replace the header `<Group>` with:

```tsx
<Group
  justify="space-between"
  wrap="nowrap"
  gap="md"
  p="sm"
  style={{
    borderBottom:
      "1px solid var(--mantine-color-default-border, #2c2e33)",
    background: "var(--mantine-color-body, #1a1b1e)",
  }}
>
  <Stack
    gap={2}
    style={{ minWidth: 0, flexShrink: 0 }}
    data-testid="topbar-zone-left"
  >
    <Title order={5} m={0}>
      Workflow editor (visual)
    </Title>
    <Text size="xs" c="dimmed">
      {nodeCount} node{nodeCount === 1 ? "" : "s"} ·{" "}
      {config.edges.length} edge
      {config.edges.length === 1 ? "" : "s"}
      {isEditMode ? " · editing" : " · creating"}
    </Text>
  </Stack>

  <Group
    gap="xs"
    wrap="nowrap"
    style={{ flex: 1, minWidth: 0 }}
    data-testid="topbar-zone-center"
  >
    <TextInput
      label="Name"
      value={name}
      onChange={(e) => setName(e.currentTarget.value)}
      size="xs"
      style={{ flex: 1, minWidth: 160, maxWidth: 280 }}
    />
    <TextInput
      label="Description"
      value={description}
      onChange={(e) => setDescription(e.currentTarget.value)}
      size="xs"
      style={{ flex: 1, minWidth: 160, maxWidth: 280 }}
    />
  </Group>

  <Group
    gap="xs"
    wrap="nowrap"
    data-testid="topbar-zone-right"
  >
    <TopBarReplayIndicator />
    <ValidationButton
      errorCount={validation.errorCount}
      warningCount={validation.warningCount}
      isPending={validation.isPending}
      onClick={() => {
        setValidationFocusNodeId(null);
        setValidationOpen(true);
      }}
    />
    <Button
      leftSection={<IconDeviceFloppy size={14} />}
      onClick={handleSave}
      loading={isSaving}
      size="xs"
      data-testid="save-button"
    >
      Save
    </Button>
    {tryButtonVisible && (
      <Tooltip
        label="Save the workflow first"
        disabled={isEditMode && !!workflowId}
      >
        <Button
          variant="filled"
          color="blue"
          leftSection={<IconBolt size={14} />}
          onClick={() => setRunDrawerMode("try")}
          size="xs"
          data-testid="try-button"
          disabled={!isEditMode || !workflowId}
        >
          Try
        </Button>
      </Tooltip>
    )}
    <Button
      variant="light"
      leftSection={<IconPlayerPlay size={14} />}
      onClick={() => setRunDrawerMode("run")}
      size="xs"
      data-testid="run-this-workflow-button"
      disabled={!isEditMode || !workflowId}
      title={
        !isEditMode || !workflowId
          ? "Save the workflow first to enable Run."
          : "Open the run-trigger panel for this workflow"
      }
    >
      Run this workflow
    </Button>
    <Menu position="bottom-end" withArrow shadow="md">
      <Menu.Target>
        <Button
          variant="light"
          leftSection={<IconDots size={14} />}
          size="xs"
          data-testid="topbar-more-button"
        >
          More
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconHistory size={14} />}
          disabled={!workflowId}
          onClick={() => setHistoryDrawerOpen(true)}
          data-testid="topbar-menu-history"
          data-disabled={!workflowId ? "true" : undefined}
          title={!workflowId ? "Save the workflow first" : undefined}
        >
          History
        </Menu.Item>
        <Menu.Item
          leftSection={<IconClipboardList size={14} />}
          disabled={!workflowId}
          onClick={() => setRunHistoryDrawerOpen(true)}
          data-testid="topbar-menu-run-history"
          data-disabled={!workflowId ? "true" : undefined}
          title={!workflowId ? "Save the workflow first" : undefined}
        >
          Run history
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBookmark size={14} />}
          disabled={nodeCount === 0}
          onClick={() => setSaveAsLibraryOpen(true)}
          data-testid="topbar-menu-save-as-library"
          data-disabled={nodeCount === 0 ? "true" : undefined}
          title={
            nodeCount === 0
              ? "Add at least one node before saving as a library"
              : undefined
          }
        >
          Save as library
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLayoutDistributeHorizontal size={14} />}
          disabled={nodeCount === 0}
          onClick={handleAutoArrange}
          data-testid="topbar-menu-auto-arrange"
          data-disabled={nodeCount === 0 ? "true" : undefined}
        >
          Auto-arrange
        </Menu.Item>
        <Menu.Item
          leftSection={<IconUsersGroup size={14} />}
          disabled={selectedNodeIds.length < 2}
          onClick={handleGroupSelected}
          data-testid="topbar-menu-group-selected"
          data-disabled={selectedNodeIds.length < 2 ? "true" : undefined}
          title={
            selectedNodeIds.length < 2
              ? "Select 2+ nodes to group them"
              : undefined
          }
        >
          Group selected
        </Menu.Item>
        <Menu.Item
          leftSection={
            <Switch
              size="xs"
              checked={simplifiedView}
              onChange={(e) =>
                handleSimplifiedViewChange(e.currentTarget.checked)
              }
              aria-label="Toggle simplified view"
              styles={{ track: { cursor: "pointer" } }}
            />
          }
          closeMenuOnClick={false}
          data-testid="topbar-menu-simplified-view"
        >
          Simplified view
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconSettings size={14} />}
          onClick={() => setSettingsOpen(true)}
          data-testid="topbar-menu-workflow-settings"
        >
          Workflow settings
        </Menu.Item>
        <Menu.Item
          leftSection={<IconHelp size={14} />}
          component="a"
          href="/workflows/dev-form-preview"
          target="_blank"
          data-testid="topbar-menu-form-preview"
        >
          Form preview
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Group>
</Group>
```

(All the buttons / handlers / icon imports referenced above already exist in the file from the previous layout — `IconDeviceFloppy`, `IconBolt`, `IconPlayerPlay`, `IconHistory`, `IconClipboardList`, `IconBookmark`, `IconLayoutDistributeHorizontal`, `IconUsersGroup`, `IconSettings`, `IconHelp`, `Switch`. No removals needed — just the new `Menu` + `IconDots` imports added in step 3.1.)

- [ ] **Step 4: Run tests + type-check**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx -t "top bar"
cd apps/frontend && npx tsc -p . --noEmit
```

Expected: 4 PASS.

Then run the broader page test suite to catch any regressions:
```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx
```

Existing tests that referenced `auto-arrange-button`, `simplified-view-toggle`, `group-selected-btn`, `history-button`, `run-history-button`, `save-as-library-button` may need to be updated to look at the new Menu-item testids. Update each by changing the testid to its `topbar-menu-*` equivalent. The interaction sequence becomes: click `topbar-more-button` → find the menu item → click it.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx
git commit -m "$(cat <<'EOF'
feat(workflow-builder): three-zone top bar with Mantine Menu overflow

Left zone: title + counts. Center zone: editable name + description inputs that finally have room to breathe. Right zone: validation badge, Save, Try (when visible), Run this workflow, and a 'More' Menu containing History, Run history, Save as library, Auto-arrange, Group selected, Simplified-view toggle, Workflow settings, and the Form preview link. Disabled items keep their explanatory tooltips.

Replay-mode badge stays in the right cluster but only renders during replay.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final integration — Multi-Page Report template + smoke pass

**Goal:** Verify the full chain renders correctly: load the Multi-Page Report template, confirm one synthetic map-body container surrounds the six body nodes, and confirm a smoke test of all six issue fixes together.

**Files:**
- Modify (test only): `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx`

- [ ] **Step 1: Write the integration test**

Append to `WorkflowEditorV2Page.test.tsx`:

```tsx
describe("WorkflowEditorV2Page — Multi-Page Report template integration", () => {
  it("renders one synthetic map-body container around the body nodes", async () => {
    // Load the template fixture from the repo's docs-md tree.
    const template = (
      await import(
        "../../../../../docs-md/graph-workflows/templates/multi-page-report-workflow.json"
      )
    ).default as WorkflowTemplate["config"];

    render(
      <MantineProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/workflows/create-v2",
              state: {
                template: {
                  name: "Multi-Page Report Workflow (Keyword-Based Split)",
                  description: "fixture",
                  config: template,
                },
              },
            },
          ]}
        >
          <Routes>
            <Route
              path="/workflows/create-v2"
              element={<WorkflowEditorV2Page mode="create" />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );

    const container = await screen.findByTestId(
      "map-body-container-__map_body_processSegments",
    );
    expect(container).toBeInTheDocument();
    expect(container).toHaveTextContent(/Process Each Segment/i);
  });
});
```

Imports: `WorkflowTemplate` type from `../../../features/workflow-builder/templates` (adjust the relative path to match the test file's location).

- [ ] **Step 2: Run — expect PASS**

```bash
cd apps/frontend && npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx -t "Multi-Page Report"
```

If failure: inspect — most likely the `metadata.position` on body nodes is missing, leading to `boundingBox` returning early. Confirm by re-reading [`multi-page-report-workflow.json`](../../../docs-md/graph-workflows/templates/multi-page-report-workflow.json). If positions are missing, the `layoutGraphIfMissingPositions` call in `WorkflowEditorV2Page` fills them at hydration; check that the container projection runs after that hydration.

- [ ] **Step 3: Manual UI verification**

The dev server is user-controlled (per the user's preferences) — ask the user to confirm the following manually in a browser at `/workflows/create-v2`:

1. Top bar — three zones, More menu opens, items present.
2. Click any node — type pill row appears below it; no horizontal overlap with neighbors.
3. Drag any palette entry to the canvas — node lands at the drop position.
4. Hover over a node's output handle — popover appears, content scrolls when long.
5. Add a branch node connected to an existing node, hover output, pick another node — new node lands below, not on top.
6. Switch ("Branch by condition") shows the label once, fits inside the diamond.
7. Create a workflow from the "Multi-Page Report Workflow (Keyword-Based Split)" template — body nodes are visibly contained in a labeled rectangle.

- [ ] **Step 4: Final commit if any test updates were needed**

```bash
git add apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx
git commit -m "test(workflow-builder): end-to-end integration test for Multi-Page Report template

Confirms the synthetic map-body container projects for the processSegments map node when the template loads via the picker payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final checklist (post-implementation)

- [ ] All vitest suites pass: `cd apps/frontend && npx vitest run src/features/workflow-builder/`
- [ ] Type check is clean: `cd apps/frontend && npx tsc -p . --noEmit`
- [ ] Manual UI verification by the user against the seven scenarios above
- [ ] Inform the user the implementation is ready for them to click through; do not start the dev server yourself (per the project's "dev servers are user-controlled" rule)
