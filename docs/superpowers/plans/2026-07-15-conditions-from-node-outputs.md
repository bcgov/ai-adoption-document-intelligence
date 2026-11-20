# Conditions From Node Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business user reference an upstream step's output inside a workflow condition by picking **step → output port**, instead of typing a raw ctx key like `__auto.extract.result`.

**Architecture:** Presentation + wiring layer over the existing `ValueRef { ref }` storage — no schema, evaluation, or validation change. Within the condition editor's existing `Ref | Literal` toggle, the `Ref` mode gains a "From a step" picker as its default sub-mode, with the raw-key autocomplete demoted to an advanced escape. Picking a producer ensures that producer's output port is written to a ctx key (mirroring the drag-to-bind gesture) and stores that key in the `ValueRef.ref` exactly as today. Stored keys resolve back to "*Node → Port*" for display.

**Tech Stack:** React 18 + TypeScript, Mantine 7, Vitest + Testing Library (frontend unit), Playwright (e2e). Pure helpers reuse `@ai-di/graph-workflow` (`synthesiseCtxKey`, `upstreamNodesWithDistance`, `getActivityCatalogEntry`).

**Spec:** `docs/superpowers/specs/2026-07-15-conditions-from-node-outputs-design.md`

**Standing constraints (from CLAUDE.md + project memory):**
- No `any` types (front or back). No backwards-compatibility shims.
- NEVER run any install (`npm install`, `npx playwright install`, etc.) — the box's Chromium is managed separately and installs break it.
- Do NOT run the e2e suite as part of unit tasks. E2E is Task 5 only; run just the one new/edited spec, never the benchmarking specs.
- `git add` exact paths only — never `git add -A`/`.`.
- Frontend unit test command: from `apps/frontend`, `npx vitest run <path>`.
- Frontend typecheck: from `apps/frontend`, `npx tsc --noEmit`.

---

## File Structure

**New files (all under `apps/frontend/src/features/workflow-builder/graph-widgets/`):**
- `condition-producer-binding.ts` — three pure helpers: `producerCtxKey`, `ensureProducerOutputBinding`, `resolveCtxKeyToProducer`. No React. The single source of the producer↔ctxKey mapping for conditions.
- `condition-producer-binding.test.ts` — unit tests for the three helpers.
- `ConditionProducerPicker.tsx` — presentational step→port picker; lists every upstream output port, no kind filter.
- `ConditionProducerPicker.test.tsx` — unit tests for the picker.

**Modified files:**
- `graph-widgets/ConditionExpressionEditor.tsx` — thread a new `onEnsureProducerBinding` prop end-to-end; rework `ValueRefEditor`'s Ref mode into step/manual sub-modes.
- `graph-widgets/ConditionExpressionEditor.test.tsx` — new tests for the sub-mode behaviour + threading.
- `settings/control-flow/SwitchNodeSettings.tsx` + `.test.tsx` — supply `onEnsureProducerBinding`.
- `settings/control-flow/PollUntilNodeSettings.tsx` + `.test.tsx` — supply `onEnsureProducerBinding`.
- `tests/e2e/workflow-builder/specs/…` — one e2e for the switch-condition flow.
- Docs: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`, `FEATURE_DEMO_GUIDE.md`, `PORT_WIRING_DESIGN.md` §15, `scripts/seed-feature-demos.mjs` (only if a demo touches a condition).

**Key types already in the codebase (do not redefine):**
- `ValueRef = { ref: string; literal?: never } | { literal: unknown; ref?: never }` (`packages/graph-workflow/src/types.ts`).
- `PortBinding = { port: string; ctxKey: string }`; nodes carry `outputs?: PortBinding[]`.
- `PortDescriptor = { name: string; label: string; description?: string; required?: boolean; kind?: KindRef }` — `getActivityCatalogEntry(activityType)?.outputs` is `PortDescriptor[]`.
- `synthesiseCtxKey(nodeId, port)` → `` `__auto.${nodeId}.${port}` ``; `isAutoCtxKey(key)` tests the prefix.
- `upstreamNodesWithDistance(config, nodeId)` → `Map<string, number>` (nodeId → hop distance).
- Both `ActivityNode` and `PollUntilNode` carry `activityType`.

---

### Task 1: Pure producer-binding helpers

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts`
- Test: `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `condition-producer-binding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import {
  ensureProducerOutputBinding,
  producerCtxKey,
  resolveCtxKeyToProducer,
} from "./condition-producer-binding";

function makeConfig(nodes: GraphNode[]): GraphWorkflowConfig {
  const rec: Record<string, GraphNode> = {};
  for (const n of nodes) rec[n.id] = n;
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: rec,
    edges: [],
    ctx: {},
  };
}

// Uses the real catalog: file.prepare emits port "preparedData".
const prepare = (
  id: string,
  label: string,
  outputs: { port: string; ctxKey: string }[] = [],
): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "file.prepare",
  outputs,
});

describe("producerCtxKey", () => {
  it("reuses an existing output binding's ctx key", () => {
    const config = makeConfig([
      prepare("A", "Prep", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(producerCtxKey(config, "A", "preparedData")).toBe("myDoc");
  });

  it("synthesises the __auto key when the port is not yet bound", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(producerCtxKey(config, "A", "preparedData")).toBe(
      "__auto.A.preparedData",
    );
  });
});

describe("ensureProducerOutputBinding", () => {
  it("adds the missing output binding with the synthesised key", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    const next = ensureProducerOutputBinding(config, "A", "preparedData");
    expect(next.nodes.A.outputs).toEqual([
      { port: "preparedData", ctxKey: "__auto.A.preparedData" },
    ]);
  });

  it("is idempotent — returns the SAME reference when already bound", () => {
    const config = makeConfig([
      prepare("A", "Prep", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(ensureProducerOutputBinding(config, "A", "preparedData")).toBe(
      config,
    );
  });

  it("returns the same reference when the producer node is missing", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(ensureProducerOutputBinding(config, "ghost", "preparedData")).toBe(
      config,
    );
  });
});

describe("resolveCtxKeyToProducer", () => {
  it("resolves an explicit output binding to node + port labels", () => {
    const config = makeConfig([
      prepare("A", "Prepare file", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(resolveCtxKeyToProducer(config, "myDoc")).toEqual({
      producerNodeId: "A",
      nodeLabel: "Prepare file",
      port: "preparedData",
      portLabel: "Prepared file data",
    });
  });

  it("resolves a synthesised __auto key with no explicit binding", () => {
    const config = makeConfig([prepare("A", "Prepare file")]);
    expect(resolveCtxKeyToProducer(config, "__auto.A.preparedData")).toEqual({
      producerNodeId: "A",
      nodeLabel: "Prepare file",
      port: "preparedData",
      portLabel: "Prepared file data",
    });
  });

  it("returns null when nothing produces the key", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(resolveCtxKeyToProducer(config, "handTyped")).toBeNull();
    expect(resolveCtxKeyToProducer(config, "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`
Expected: FAIL — module `./condition-producer-binding` not found.

- [ ] **Step 3: Implement the helpers**

Create `condition-producer-binding.ts`:

```ts
/**
 * Pure producer↔ctxKey mapping behind "conditions from node outputs"
 * (PORT_WIRING_DESIGN §11). The condition step-picker stores the SAME ctx
 * path the resolver uses, so these helpers are the single place that maps a
 * producer port to its ctx key, guarantees the producer's output binding
 * exists (idempotently), and reverses a stored key back to a producer for
 * display. No React; every mutating function returns a NEW config or the
 * SAME reference on a no-op.
 */
import {
  getActivityCatalogEntry,
  synthesiseCtxKey,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

/**
 * The deterministic ctx key a producer port maps to: the producer's existing
 * output binding for that port if present, else the synthesised
 * `__auto.<nodeId>.<port>` key the resolver already understands.
 */
export function producerCtxKey(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): string {
  const producer = config.nodes[producerNodeId];
  const existing = producer?.outputs?.find((b) => b.port === port);
  return existing?.ctxKey ?? synthesiseCtxKey(producerNodeId, port);
}

/**
 * Idempotent. Returns a config in which the producer's output port is bound
 * to `producerCtxKey(...)`. If the binding already exists (or the node is
 * missing) the SAME config reference is returned so callers can `===`-skip a
 * re-render. Mirrors the drag-to-bind gesture's "ensure the producer carries
 * a matching outputs row".
 */
export function ensureProducerOutputBinding(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): GraphWorkflowConfig {
  const producer = config.nodes[producerNodeId];
  if (!producer) return config;
  if (producer.outputs?.some((b) => b.port === port)) return config;
  const ctxKey = synthesiseCtxKey(producerNodeId, port);
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [producerNodeId]: {
        ...producer,
        outputs: [...(producer.outputs ?? []), { port, ctxKey }],
      },
    },
  };
}

export interface ResolvedProducerRef {
  producerNodeId: string;
  nodeLabel: string;
  port: string;
  portLabel: string;
}

/**
 * Reverse-resolve a stored ctx key to its producing step + port for display.
 * Scans every activity/pollUntil node's catalog output ports and matches on
 * `producerCtxKey` (so both explicit bindings and synthesised `__auto` keys
 * resolve). When `consumerNodeId` is given, ties break to the nearest
 * upstream producer; otherwise to node-record order. Returns null when
 * nothing matches (→ raw-key fallback / manual sub-mode).
 */
export function resolveCtxKeyToProducer(
  config: GraphWorkflowConfig,
  ctxKey: string,
  consumerNodeId?: string,
): ResolvedProducerRef | null {
  if (ctxKey === "") return null;
  const distances = consumerNodeId
    ? upstreamNodesWithDistance(config, consumerNodeId)
    : null;
  let best: ResolvedProducerRef | null = null;
  let bestOrder = Number.MAX_SAFE_INTEGER;
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) continue;
    for (const out of entry.outputs) {
      if (producerCtxKey(config, nodeId, out.name) !== ctxKey) continue;
      const order = distances?.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
      if (best === null || order < bestOrder) {
        best = {
          producerNodeId: nodeId,
          nodeLabel: node.label || nodeId,
          port: out.name,
          portLabel: out.label,
        };
        bestOrder = order;
      }
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts
git commit -m "feat(workflow-builder): pure producer-binding helpers for conditions"
```

---

### Task 2: `ConditionProducerPicker` component

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.tsx`
- Test: `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.test.tsx`

**Context:** A sibling of the existing `ProducerPicker` (which filters by `expectedKind` and skips kind-less ports). This one applies **no filter** — conditions read scalars from any output. Every catalog output declares a kind today (often the `Artifact` wildcard), so the practical difference is dropping the assignability filter; the `?? "any"` in the kind hint is defensive for a future kind-less port.

- [ ] **Step 1: Write the failing tests**

Create `ConditionProducerPicker.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { ConditionProducerPicker } from "./ConditionProducerPicker";

function mount(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// A → B → C(consumer). A: file.prepare (preparedData:Document).
// B: azureOcr.submit (apimRequestId, statusCode, headers — all Artifact).
function chainConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "A",
    nodes: {
      A: { id: "A", type: "activity", activityType: "file.prepare", label: "Prepare file" },
      B: { id: "B", type: "activity", activityType: "azureOcr.submit", label: "Submit OCR" },
      C: { id: "C", type: "switch", label: "Branch", cases: [] },
    },
    edges: [
      { id: "e1", source: "A", target: "B", type: "normal" },
      { id: "e2", source: "B", target: "C", type: "normal" },
    ],
    ctx: {},
  };
}

describe("ConditionProducerPicker", () => {
  it("lists every upstream output port with no kind filter", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    // Nearest producer B's three Artifact outputs are all shown, even though
    // none is assignable to a specific kind — no filter applies.
    expect(screen.getByText("Submit OCR → Request ID")).toBeInTheDocument();
    expect(
      screen.getByText("Submit OCR → Submission status code"),
    ).toBeInTheDocument();
    expect(screen.getByText("Prepare file → Prepared file data")).toBeInTheDocument();
  });

  it("emits { producerNodeId, producerPort } on click", () => {
    const onChange = vi.fn();
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Prepare file → Prepared file data"));
    expect(onChange).toHaveBeenCalledWith({
      producerNodeId: "A",
      producerPort: "preparedData",
    });
  });

  it("marks the row matching the current value as selected", () => {
    mount(
      <ConditionProducerPicker
        config={chainConfig()}
        currentNodeId="C"
        value="__auto.A.preparedData"
        onChange={vi.fn()}
      />,
    );
    const row = screen
      .getByText("Prepare file → Prepared file data")
      .closest("[data-testid='condition-producer-row']");
    expect(row).toHaveAttribute("data-selected", "true");
  });

  it("shows the empty state when there are no upstream producers", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "C",
      nodes: { C: { id: "C", type: "switch", label: "Branch", cases: [] } },
      edges: [],
      ctx: {},
    };
    mount(
      <ConditionProducerPicker
        config={config}
        currentNodeId="C"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("condition-producer-empty")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/ConditionProducerPicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `ConditionProducerPicker.tsx`:

```tsx
/**
 * Step→port picker for the condition editor's Ref mode
 * (PORT_WIRING_DESIGN §11). Sibling to ProducerPicker, but applies NO kind
 * filter — a condition legitimately reads a scalar out of any output. Lists
 * one row per catalog output port of every upstream activity/pollUntil node,
 * nearest first. Purely presentational: emits the chosen producer node + port;
 * the caller materialises the binding and stores the ctx key.
 */
import {
  getActivityCatalogEntry,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import { Stack, Text, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { producerCtxKey } from "./condition-producer-binding";

interface ConditionProducerPickerProps {
  config: GraphWorkflowConfig;
  /** The control-flow node the condition belongs to; scopes "upstream". */
  currentNodeId: string;
  /** Currently-stored ref, so the matching row renders selected. */
  value: string;
  onChange: (selection: {
    producerNodeId: string;
    producerPort: string;
  }) => void;
}

interface Row {
  nodeId: string;
  label: string;
  port: string;
  portLabel: string;
  kindLabel: string;
  distance: number;
  ctxKey: string;
}

export function ConditionProducerPicker({
  config,
  currentNodeId,
  value,
  onChange,
}: ConditionProducerPickerProps) {
  const rows = useMemo<Row[]>(() => {
    const distances = upstreamNodesWithDistance(config, currentNodeId);
    const list: Row[] = [];
    for (const [nodeId, distance] of distances) {
      const node = config.nodes[nodeId];
      if (!node) continue;
      if (node.type !== "activity" && node.type !== "pollUntil") continue;
      const entry = getActivityCatalogEntry(node.activityType);
      if (!entry) continue;
      for (const out of entry.outputs) {
        list.push({
          nodeId,
          label: node.label || nodeId,
          port: out.name,
          portLabel: out.label,
          kindLabel: out.kind ?? "any",
          distance,
          ctxKey: producerCtxKey(config, nodeId, out.name),
        });
      }
    }
    list.sort((a, b) => a.distance - b.distance);
    return list;
  }, [config, currentNodeId]);

  if (rows.length === 0) {
    return (
      <Text size="xs" c="dimmed" data-testid="condition-producer-empty">
        No upstream steps yet — add one, or enter a variable manually.
      </Text>
    );
  }

  return (
    <Stack gap={4} data-testid="condition-producer-picker">
      {rows.map((r) => {
        const selected = r.ctxKey === value;
        return (
          <UnstyledButton
            key={`${r.nodeId}.${r.port}`}
            data-testid="condition-producer-row"
            data-selected={selected ? "true" : "false"}
            onClick={() =>
              onChange({ producerNodeId: r.nodeId, producerPort: r.port })
            }
            style={{
              padding: "6px 8px",
              borderRadius: 4,
              border: selected
                ? "1px solid var(--mantine-color-blue-5, #4dabf7)"
                : "1px solid var(--mantine-color-default-border, #2c2e33)",
            }}
          >
            <Text size="xs">
              {r.label} → {r.portLabel}
            </Text>
            <Text size="10px" c="dimmed">
              {r.port} · {r.kindLabel} · {r.distance} step
              {r.distance === 1 ? "" : "s"} upstream
            </Text>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/ConditionProducerPicker.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.tsx apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.test.tsx
git commit -m "feat(workflow-builder): ConditionProducerPicker (no kind filter)"
```

---

### Task 3: `ValueRefEditor` Ref sub-modes + prop threading

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx`
- Test: `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx`

**Context:** Add one new optional prop, `onEnsureProducerBinding`, to `ConditionExpressionEditorProps` and thread it verbatim through `ExpressionBody` and every body component (`ComparisonBody`, `LogicalBody`, `NotBody`, `NullCheckBody`, `MembershipBody`) down to `ValueRefEditor`, alongside the existing `config` / `onCreateCtxKey` / `currentNodeId`. Then rework `ValueRefEditor`'s Ref mode into two sub-modes.

**Sub-mode rules (spec §3):**
- Effective sub-mode is derived, not stored, except for a `manualOverride` boolean set by the toggle links:
  - `onEnsureProducerBinding` absent → always `"manual"` (the step-picker needs it to materialise bindings).
  - else `manualOverride` true → `"manual"`.
  - else a non-empty `ref` that does not resolve to a producer → `"manual"` (forced; decision 4).
  - else → `"step"`.
- Step mode renders `ConditionProducerPicker`; if the current ref resolves, a "*Node → Port*" caption shows above it. A "Enter a variable manually" button sets `manualOverride = true`.
- Manual mode renders the existing `VariablePicker`. A "Back to steps" button (shown only when the value is resolvable or empty, so it can't bounce) sets `manualOverride = false`.
- Picking a producer calls `onEnsureProducerBinding(producerNodeId, port)` then `onChange({ ref: producerCtxKey(config, producerNodeId, port) })`.

- [ ] **Step 1: Write the failing tests**

Append to `ConditionExpressionEditor.test.tsx`. First extend the existing `activity` helper usage — add a chain-config helper near the top of the file (after the existing `activity` helper):

```tsx
// A(file.prepare: preparedData) → SWITCH(consumer). For step-picker tests.
function stepPickerConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "A",
    nodes: {
      A: { id: "A", type: "activity", activityType: "file.prepare", label: "Prepare file" },
      SW: { id: "SW", type: "switch", label: "Branch", cases: [] },
    },
    edges: [{ id: "e", source: "A", target: "SW", type: "normal" }],
    ctx: {},
  };
}
```

Then add a `describe` block:

```tsx
describe("ConditionExpressionEditor — conditions from node outputs (§11)", () => {
  function renderEditor(
    initial: ConditionExpression | undefined,
    ensure = vi.fn(),
  ) {
    function Harness() {
      const [expr, setExpr] = useState(initial);
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={stepPickerConfig()}
            currentNodeId="SW"
            onEnsureProducerBinding={ensure}
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
  }

  it("defaults the Ref field to the step-picker for an empty ref", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    });
    // Left operand: step-picker present, listing the upstream producer.
    expect(
      screen.getByText("Prepare file → Prepared file data"),
    ).toBeInTheDocument();
  });

  it("picking a step ensures the producer binding and stores its ctx key", () => {
    const ensure = vi.fn();
    renderEditor(
      { operator: "equals", left: { ref: "" }, right: { literal: "x" } },
      ensure,
    );
    fireEvent.click(screen.getByText("Prepare file → Prepared file data"));
    expect(ensure).toHaveBeenCalledWith("A", "preparedData");
    // The stored ref is the synthesised producer key; re-render shows it
    // resolved as "Prepare file → Prepared file data" in the caption.
    expect(
      screen.getAllByText("Prepare file → Prepared file data").length,
    ).toBeGreaterThan(0);
  });

  it("opens in manual mode for a ref that resolves to no producer", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "handTypedKey" },
      right: { literal: "x" },
    });
    // The manual VariablePicker input carries the raw value; no step-picker.
    expect(screen.getByDisplayValue("handTypedKey")).toBeInTheDocument();
    expect(
      screen.queryByTestId("condition-producer-picker"),
    ).not.toBeInTheDocument();
  });

  it("advanced link swaps step → manual and back", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    });
    fireEvent.click(screen.getAllByText("Enter a variable manually")[0]);
    // Now the manual autocomplete is shown for the left operand.
    expect(screen.getAllByText("Back to steps").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("Back to steps")[0]);
    expect(
      screen.getAllByTestId("condition-producer-picker").length,
    ).toBeGreaterThan(0);
  });

  it("falls back to manual mode when onEnsureProducerBinding is absent", () => {
    function Harness() {
      const [expr, setExpr] = useState<ConditionExpression | undefined>({
        operator: "equals",
        left: { ref: "" },
        right: { literal: "x" },
      });
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={stepPickerConfig()}
            currentNodeId="SW"
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
    expect(
      screen.queryByTestId("condition-producer-picker"),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx`
Expected: FAIL — `onEnsureProducerBinding` not a known prop; step-picker not rendered.

- [ ] **Step 3: Thread the new prop through every layer**

In `ConditionExpressionEditor.tsx`:

3a. Add the import and the prop to `ConditionExpressionEditorProps`:

```tsx
import {
  producerCtxKey,
  resolveCtxKeyToProducer,
} from "./condition-producer-binding";
import { ConditionProducerPicker } from "./ConditionProducerPicker";
```

Add to `ConditionExpressionEditorProps` (after `onCreateCtxKey`):

```tsx
  /**
   * Materialises a producer's output binding when a condition references it
   * via the step-picker. Given (producerNodeId, port), the caller applies
   * `ensureProducerOutputBinding` through its `onConfigChange`. When absent,
   * the Ref field offers only the manual variable autocomplete.
   */
  onEnsureProducerBinding?: (producerNodeId: string, port: string) => void;
```

3b. Add `onEnsureProducerBinding` to the destructured params of `ConditionExpressionEditor`, and pass it to `<ExpressionBody … onEnsureProducerBinding={onEnsureProducerBinding} />`.

3c. Add `onEnsureProducerBinding?: (producerNodeId: string, port: string) => void;` to `ExpressionBodyProps`, `ComparisonBodyProps`, `LogicalBodyProps`, `NotBodyProps`, `NullCheckBodyProps`, `MembershipBodyProps`, and `ValueRefEditorProps`. In each body component, destructure it and forward it: to `ValueRefEditor` on every `<ValueRefEditor … />` (comparison left/right, null-check value, membership value/list), and to the nested `<ConditionExpressionEditor … />` inside `LogicalBody` and `NotBody`.

- [ ] **Step 4: Rework `ValueRefEditor`'s Ref mode**

Replace the `ValueRefEditor` function body's Ref branch. Add these imports at the top if missing: `Anchor` from `@mantine/core`, and `useMemo` from `react` (the file currently imports only `useEffect, useRef, useState`). Update the component:

```tsx
type ValueRefSubMode = "step" | "manual";

function ValueRefEditor({
  label,
  value,
  onChange,
  config,
  onCreateCtxKey,
  onEnsureProducerBinding,
  currentNodeId,
  testId,
}: ValueRefEditorProps) {
  const mode = getValueRefMode(value);

  // (existing literal-text local-state block stays unchanged)

  const refValue = "ref" in value && value.ref !== undefined ? value.ref : "";
  const resolved = useMemo(
    () => resolveCtxKeyToProducer(config, refValue, currentNodeId),
    [config, refValue, currentNodeId],
  );
  const canUseSteps = onEnsureProducerBinding !== undefined;
  const [manualOverride, setManualOverride] = useState(false);
  const forcedManual = refValue !== "" && resolved === null;
  const subMode: ValueRefSubMode =
    !canUseSteps || manualOverride || forcedManual ? "manual" : "step";

  const pickProducer = (sel: {
    producerNodeId: string;
    producerPort: string;
  }) => {
    onEnsureProducerBinding?.(sel.producerNodeId, sel.producerPort);
    onChange({ ref: producerCtxKey(config, sel.producerNodeId, sel.producerPort) });
  };

  // …setMode + return header (Ref|Literal SegmentedControl) unchanged…

  // Inside the `mode === "ref" ?` branch, replace the bare <VariablePicker>
  // with the sub-mode switch:
  //
  // {subMode === "step" ? (
  //   <Stack gap={4}>
  //     {resolved && (
  //       <Text size="10px" c="dimmed" data-testid={`${testId}-resolved`}>
  //         {resolved.nodeLabel} → {resolved.portLabel}
  //       </Text>
  //     )}
  //     <ConditionProducerPicker
  //       config={config}
  //       currentNodeId={currentNodeId ?? ""}
  //       value={refValue}
  //       onChange={pickProducer}
  //     />
  //     <Anchor
  //       component="button"
  //       type="button"
  //       size="xs"
  //       data-testid={`${testId}-manual-link`}
  //       onClick={() => setManualOverride(true)}
  //     >
  //       Enter a variable manually
  //     </Anchor>
  //   </Stack>
  // ) : (
  //   <Stack gap={4}>
  //     <VariablePicker
  //       config={config}
  //       onCreateCtxKey={onCreateCtxKey}
  //       currentNodeId={currentNodeId}
  //       value={refValue}
  //       onChange={(nextRef) => onChange({ ref: nextRef })}
  //       placeholder="Pick a ctx variable…"
  //       data-testid={`${testId}-ref-input`}
  //     />
  //     {canUseSteps && !forcedManual && (
  //       <Anchor
  //         component="button"
  //         type="button"
  //         size="xs"
  //         data-testid={`${testId}-steps-link`}
  //         onClick={() => setManualOverride(false)}
  //       >
  //         Back to steps
  //       </Anchor>
  //     )}
  //   </Stack>
  // )}
```

Implement exactly that JSX in place of the current single `<VariablePicker … />` in the Ref branch. Keep the Literal branch untouched. (`currentNodeId ?? ""` guards the required prop; a condition editor without a `currentNodeId` can't scope upstream, so the picker renders its empty state — acceptable, and such call sites don't pass `onEnsureProducerBinding` anyway so they land in manual mode.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx`
Expected: PASS — all prior tests plus the 5 new §11 tests.

- [ ] **Step 6: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx
git commit -m "feat(workflow-builder): step-picker as default Ref mode in condition editor"
```

---

### Task 4: Wire `onEnsureProducerBinding` from the settings forms

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`
- Test: `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.tsx`
- Test: `apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.test.tsx`

**Context:** Both forms already own `onConfigChange` and derive `createCtxKey = (key) => onConfigChange(declareCtxKey(config, key))`. Add the analogous `ensureBinding` and thread it to the condition editor. In `SwitchNodeSettings` it must pass through `CaseRow` (like `onCreateCtxKey` does).

- [ ] **Step 1: Write the failing test (Switch)**

Add to `SwitchNodeSettings.test.tsx` (match the file's existing render harness — reuse its config/render helpers). The assertion: picking a step in a case condition triggers `onConfigChange` with the producer's output binding materialised.

```tsx
it("materialises the producer output binding when a case condition picks a step", () => {
  // Config: A(file.prepare) → SW(switch with one empty-condition case).
  const config = makeSwitchConfig(); // existing/local helper; A upstream of SW
  const onConfigChange = vi.fn();
  renderSwitchSettings({ config, nodeId: "SW", onConfigChange });

  // Open the case condition's left operand step-picker and pick A's output.
  fireEvent.click(screen.getByText("Prepare file → Prepared file data"));

  // onConfigChange fired with A.outputs now carrying the synthesised key.
  const next = onConfigChange.mock.calls.at(-1)?.[0] as GraphWorkflowConfig;
  expect(next.nodes.A.outputs).toContainEqual({
    port: "preparedData",
    ctxKey: "__auto.A.preparedData",
  });
});
```

If the existing test file has no `A` upstream node in its fixtures, extend the local config helper to add `A: file.prepare` with an edge `A → SW`, and give the switch one case whose condition is `{ operator: "equals", left: { ref: "" }, right: { literal: "x" } }`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx`
Expected: FAIL — no step-picker (prop not wired), so the text isn't found.

- [ ] **Step 3: Wire the Switch form**

In `SwitchNodeSettings.tsx`:

3a. Import the helper:

```tsx
import { ensureProducerOutputBinding } from "../../graph-widgets/condition-producer-binding";
```

3b. Next to the existing `createCtxKey`, add:

```tsx
const ensureBinding = (producerNodeId: string, port: string) =>
  onConfigChange(ensureProducerOutputBinding(config, producerNodeId, port));
```

3c. Pass `ensureBinding` into `CaseRow` (add `onEnsureProducerBinding: (producerNodeId: string, port: string) => void;` to `CaseRowProps`, destructure it, and forward to `<ConditionExpressionEditor … onEnsureProducerBinding={onEnsureProducerBinding} />`).

- [ ] **Step 4: Run to verify it passes (Switch)**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test (PollUntil)**

Add the analogous test to `PollUntilNodeSettings.test.tsx`: a `pollUntil` node with an upstream `file.prepare`, picking the step in its termination condition fires `onConfigChange` materialising `A.outputs`.

```tsx
it("materialises the producer output binding when the poll condition picks a step", () => {
  const config = makePollConfig(); // A(file.prepare) → P(pollUntil)
  const onConfigChange = vi.fn();
  renderPollSettings({ config, nodeId: "P", onConfigChange });
  fireEvent.click(screen.getByText("Prepare file → Prepared file data"));
  const next = onConfigChange.mock.calls.at(-1)?.[0] as GraphWorkflowConfig;
  expect(next.nodes.A.outputs).toContainEqual({
    port: "preparedData",
    ctxKey: "__auto.A.preparedData",
  });
});
```

- [ ] **Step 6: Run to verify it fails, then wire the PollUntil form**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.test.tsx`
Expected: FAIL.

In `PollUntilNodeSettings.tsx`: import `ensureProducerOutputBinding`, add `ensureBinding` next to the existing `onCreateCtxKey`/`declareCtxKey` derivation, and pass `onEnsureProducerBinding={ensureBinding}` to the `<ConditionExpressionEditor … />` at line ~265.

- [ ] **Step 7: Run to verify it passes (PollUntil)**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.test.tsx`
Expected: PASS.

- [ ] **Step 8: Full frontend suite + typecheck**

Run: `cd apps/frontend && npx vitest run` then `npx tsc --noEmit`
Expected: all green, no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.tsx apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.test.tsx
git commit -m "feat(workflow-builder): settings forms materialise producer bindings for conditions"
```

---

### Task 5: E2E — pick a step output in a switch condition

**Files:**
- Modify or add: a spec under `tests/e2e/workflow-builder/specs/` covering the switch-condition flow (extend the nearest existing control-flow/switch spec; if none, create `tier2-condition-step-ref.spec.ts`).

**Context:** Reuse the workflow-builder e2e harness (`helpers/wb-test.ts` for auth + origin-agnostic API routes; `helpers/canvas.ts` for canvas actions). Do NOT run the benchmarking specs. Cap workers per repo convention.

- [ ] **Step 1: Write the e2e test**

The flow: load a workflow that has an upstream activity feeding a switch, open a switch case's condition, choose the step-picker option, save, reload, and assert the condition displays "*Node → Port*" and the saved config persisted the `ref` + producer output binding. Model the selectors on the `data-testid`s introduced in Tasks 2–3 (`condition-producer-row`, `…-resolved`) and the existing switch-settings testids. Follow the structure of the existing `tier2-*` specs (setup via `helpers/workflow-api.ts`, navigate, act, assert on persisted config through the API helper).

- [ ] **Step 2: Run just this spec**

Run: `cd tests/e2e && npx playwright test workflow-builder/specs/<spec-file>.spec.ts --workers=6`
Expected: PASS. (Requires frontend :3000 + backend :3002 running; do not install anything.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/workflow-builder/specs/<spec-file>.spec.ts
# plus any helper additions actually touched
git commit -m "test(e2e): condition references an upstream step output"
```

---

### Task 6: Docs + demo sync

**Files:**
- Modify: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` (§15 phase 5 → complete, with any limitations found).
- Modify: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` (condition section: step-picker default, advanced manual escape, display resolution).
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` (only if a demo exercises a switch/pollUntil condition).
- Modify: `scripts/seed-feature-demos.mjs` (only if a seeded demo's condition step-text needs updating — the seeder embeds guide text; edit here, not the guide alone).

- [ ] **Step 1: Update PORT_WIRING_DESIGN §15**

Mark phase 5 complete with the landed surfaces (step-picker default Ref mode, `ConditionProducerPicker`, producer-binding materialisation, display resolution) and record any limitation discovered during implementation (e.g. the input-port `ProducerPicker` still has no ctx-variable option — §15 item 3, unchanged).

- [ ] **Step 2: Update MANUAL_TEST_PLAN condition section**

Add manual steps: open a switch/pollUntil condition, confirm the Ref field defaults to the step-picker, pick an upstream step output, confirm it displays "*Node → Port*", confirm "Enter a variable manually" reveals the raw-key autocomplete and "Back to steps" returns, confirm a hand-typed unresolved key opens in manual mode.

- [ ] **Step 3: Sync demo guide/seeder if needed**

Check whether any seeded demo has a switch/pollUntil condition whose guide step-text describes typing a raw ctx key. If so, update the step-text in `scripts/seed-feature-demos.mjs` (source of truth) to describe the step-picker, then reseed per the project's seeding process. If no demo touches a condition, note "no demo change needed" in the commit body. Do NOT edit `FEATURE_DEMO_GUIDE.md` by hand where the seeder owns it.

- [ ] **Step 4: Commit**

```bash
git add docs-md/workflow-builder/PORT_WIRING_DESIGN.md docs-md/workflow-builder/MANUAL_TEST_PLAN.md
# add FEATURE_DEMO_GUIDE.md / scripts/seed-feature-demos.mjs only if actually changed
git commit -m "docs(workflow-builder): document conditions-from-node-outputs (phase 5)"
```

---

## Final verification (after all tasks)

- [ ] `cd apps/frontend && npx vitest run` — full frontend suite green.
- [ ] `cd apps/frontend && npx tsc --noEmit` — clean.
- [ ] The one new/edited e2e spec passes (Task 5), benchmarking excluded.
- [ ] Dispatch a final whole-implementation review over the commit range.
- [ ] Update PORT_WIRING_DESIGN §15 phase 5 status if the review surfaces anything.

## Notes / decisions locked during brainstorming

1. Nested `Ref | Literal`; within Ref the step-picker is the default sub-mode, raw-key autocomplete is the advanced escape. (Not a flat 3-way control.)
2. A **separate** `ConditionProducerPicker` — the existing `ProducerPicker`'s kind-filter contract stays intact for the input-port modal.
3. **No kind filter** — every upstream output port is listed (kind shown as a hint, "any" for a kind-less port). Today every catalog output declares a kind (often `Artifact`), so the practical effect is dropping the assignability filter.
4. **Auto-open manual mode** for a stored ref that resolves to no producer (hand-authored/legacy/deleted-producer), so the value stays visible and editable.
5. No `ValueRef` schema change; no canvas wire derived (conditions aren't input ports — consistent with PORT_WIRING_DESIGN §15's control-flow-node limitation).
