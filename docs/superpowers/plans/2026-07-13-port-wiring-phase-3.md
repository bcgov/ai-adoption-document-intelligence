# Port Wiring Phase 3 — Gestures + Port-Aware Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-port canvas hand-buildable: drag a wire between ports to pin a binding (§6.1), connect-time kind validation (§6.2), wire delete/revert semantics (§6.3), a connect-summary popover narrating auto-wire (§6.4), and the kind-aware extend popover (§9) — per `docs-md/workflow-builder/PORT_WIRING_DESIGN.md`.

**Architecture:** Presentation layer only — NO schema change. Gestures write the same `PortBinding` + `lockedInputPorts` + `GraphEdge` structures the settings panel writes today; `resolveBindings` keeps running on every canvas config change (`WorkflowEditorV2Page.handleCanvasConfigChange`). One new resolver status (`locked-unbound`) lets a deleted wire stay deleted. All binding mutations live in one new pure module (`wire-mutations.ts`) shared by the canvas gestures and the settings panel.

**Tech Stack:** React 18 + @xyflow/react 12.10, Mantine (+ @mantine/notifications, already mounted in `main.tsx`), `@ai-di/graph-workflow` package (Jest), frontend (Vitest), Playwright e2e (`tests/e2e/workflow-builder/`).

**Decisions locked in with Alex (2026-07-13):**
- Amber-ring reconciliation: required unbound base-`Artifact` identifier ports **count as problems** (warnings — never block Save) in the unified badge/drawer.
- Scope: §6 **and** §9 in this plan. §10 (wire data peek) and §11 (conditions) stay Phase 4/5.

**Standing constraints (do not violate):**
- NEVER run `npm install`, `npx playwright install`, or any dependency-install command — the user's Chromium is managed separately and installs break it.
- NEVER run `tests/e2e/benchmarking/` specs. E2E scope is `tests/e2e/workflow-builder/` only.
- No `any` types. No backwards-compatibility shims. Docs updates go in `/docs-md`.
- Frontend tests: `cd apps/frontend && npx vitest run <path>`; package tests: `cd packages/graph-workflow && npx jest <path>`; typecheck: `npx tsc --noEmit` in `apps/frontend`.
- The package must be rebuilt for the frontend to see resolver changes: `cd packages/graph-workflow && npm run build` (check `package.json` for the exact script name; it exists — Phase 2 used it).

**Key existing code (read these before starting a task that touches them):**
- `packages/graph-workflow/src/auto-wire/resolve-input-port.ts` — `PortResolution` union, lock check at top.
- `packages/graph-workflow/src/auto-wire/resolver.ts` — `resolveBindings`; only acts on `status === "auto-bound"`, so `locked-unbound` is skipped for free.
- `packages/graph-workflow/src/auto-wire/strip-redundant-locks.ts` — `trimLockList` already KEEPS a lock with no binding ("preserve explicit intent") — pinned-unbound survives save/load. Do not change it.
- `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx` — `handleOverride` (the §6.1 write path to extract), `handleRevert`, `PortRow` status switch.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — `projectFlowWires` (data wires currently `deletable:false, selectable:false`), `handleConnect`, `handleEdgesDelete`, `NodeContextMenu` anchor pattern, `useHoverExtend` wiring.
- `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts` — `DataWire` (has `source/sourcePort/target/targetPort/kind/pinned/auto/via/edgeId/ctxKey`).
- `apps/frontend/src/features/workflow-builder/canvas/port-rows.ts` — `inputHandleId`/`outputHandleId` (`in-<name>`/`out-<name>`), `rendersPerPortHandle`.
- `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` — per-port `<Handle isConnectable={false}>` (flipped in Task 6).
- `apps/frontend/src/features/workflow-builder/auto-wire-status.ts` + `auto-wire-validation.ts` — the unified problems pipeline.
- `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx` + `use-hover-extend.ts` — §9 base.

---

### Task 1: `resolveInputPort` locked-unbound status (package)

A locked port with **no** `inputs[]` row must report `locked-unbound` instead of `{status:"locked", ctxKey:""}` — this is what makes wire deletion stick (§6.3: the resolver must not re-create the wire the user just deleted).

**Files:**
- Modify: `packages/graph-workflow/src/auto-wire/resolve-input-port.ts`
- Test: `packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts`
- Test: `packages/graph-workflow/src/auto-wire/resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

In `resolve-input-port.test.ts`, add (reuse the file's existing config-builder helpers — read the file first and follow its fixture style):

```ts
describe("locked-unbound (port-wiring Phase 3, §6.3)", () => {
  it("reports locked-unbound for a locked port with no inputs row", () => {
    // config: consumer activity with metadata.lockedInputPorts = ["ocrResult"]
    // and NO inputs[] entry for "ocrResult", plus an upstream producer that
    // WOULD auto-bind if the port were unlocked.
    const result = resolveInputPort(config, "consumer", {
      name: "ocrResult",
      kind: "OcrResult",
    });
    expect(result).toEqual({ status: "locked-unbound" });
  });

  it("reports locked-unbound for a locked port whose binding has an empty ctxKey", () => {
    // same config but with inputs: [{ port: "ocrResult", ctxKey: "" }]
    const result = resolveInputPort(config, "consumer", {
      name: "ocrResult",
      kind: "OcrResult",
    });
    expect(result).toEqual({ status: "locked-unbound" });
  });

  it("still reports locked (with ctxKey) when the locked port has a binding", () => {
    // inputs: [{ port: "ocrResult", ctxKey: "someKey" }]
    const result = resolveInputPort(config, "consumer", {
      name: "ocrResult",
      kind: "OcrResult",
    });
    expect(result).toEqual({ status: "locked", ctxKey: "someKey" });
  });
});
```

In `resolver.test.ts`, add:

```ts
it("does not re-bind a locked port with no binding (pinned-unbound survives resolveBindings)", () => {
  // Two-node chain where consumer.ocrResult WOULD auto-bind to producer,
  // but consumer has lockedInputPorts=["ocrResult"] and no inputs row.
  const resolved = resolveBindings(config);
  const consumer = resolved.nodes["consumer"];
  expect(consumer.inputs ?? []).not.toContainEqual(
    expect.objectContaining({ port: "ocrResult" }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/graph-workflow && npx jest resolve-input-port resolver.test`
Expected: the new locked-unbound tests FAIL (current code returns `{status:"locked", ctxKey:""}`); the resolver test may pass already (resolver skips non-auto-bound) — if it passes, keep it as a regression guard.

- [ ] **Step 3: Implement**

In `resolve-input-port.ts`:

```ts
export type PortResolution =
  | {
      status: "auto-bound";
      producerNodeId: string;
      producerPort: string;
      via: AutoBoundVia;
    }
  | {
      status: "ambiguous";
      candidates: { producerNodeId: string; producerPort: string }[];
    }
  | { status: "unsatisfied" }
  | { status: "locked"; ctxKey: string }
  /**
   * Locked with NO binding — the user disconnected this port on the canvas
   * (PORT_WIRING_DESIGN.md §6.3 "pinned unbound"). The resolver must leave
   * it alone; the UI renders it as "Disconnected by you" (§12).
   */
  | { status: "locked-unbound" };
```

And replace the lock check body:

```ts
  if (lockList.includes(port.name)) {
    const existing = consumer.inputs?.find((b) => b.port === port.name);
    if (!existing || existing.ctxKey === "") {
      return { status: "locked-unbound" };
    }
    return { status: "locked", ctxKey: existing.ctxKey };
  }
```

- [ ] **Step 4: Run the package suite**

Run: `cd packages/graph-workflow && npx jest`
Expected: ALL pass (898+ tests). If anything else consumed `{status:"locked", ctxKey:""}` semantics, fix the consumer, not the new status.

- [ ] **Step 5: Rebuild the package + frontend typecheck**

Run: `cd packages/graph-workflow && npm run build && cd ../../apps/frontend && npx tsc --noEmit`
Expected: clean. (`InputsSection`'s status switch has no default case and tolerates the new member; Task 3 gives it a real UI.)

- [ ] **Step 6: Commit**

```bash
git add packages/graph-workflow/src/auto-wire/resolve-input-port.ts packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts packages/graph-workflow/src/auto-wire/resolver.test.ts
git commit -m "feat(auto-wire): locked-unbound resolution for pinned ports without a binding"
```

---

### Task 2: Shared `wire-mutations.ts` + InputsSection refactor

Extract the §6.1 write mechanics into one pure module so the drag gesture (Task 6), the wire menu (Task 5), the delete path (Task 4), and the settings panel all share it.

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/wire-mutations.ts`
- Create: `apps/frontend/src/features/workflow-builder/canvas/wire-mutations.test.ts`
- Modify: `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx` (`handleOverride`/`handleRevert` bodies → calls into the new module)

- [ ] **Step 1: Write the failing tests** (`wire-mutations.test.ts`, Vitest)

Cover, with small hand-built `GraphWorkflowConfig` fixtures (mirror the fixture style in `derive-wires.test.ts` — an `activityNode(id, activityType, extra)` helper keeps them short). Core cases in full; the rest follow the same shape:

```ts
const baseConfig = (): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: { name: "t" },
  entryNodeId: "producer",
  ctx: {},
  nodes: {
    producer: activityNode("producer", "azureOcr.extract"),
    consumer: activityNode("consumer", "ocr.cleanup"),
  },
  edges: [],
});

describe("pinPortBinding", () => {
  it("stamps the consumer input row, synthesises a producer outputs row, and locks the port", () => {
    const next = pinPortBinding(baseConfig(), "consumer", "ocrResult", {
      producerNodeId: "producer",
      producerPort: "ocrResult",
    });
    const ctxKey = next.nodes.producer.outputs?.find(
      (b) => b.port === "ocrResult",
    )?.ctxKey;
    expect(ctxKey).toBe("__auto.producer.ocrResult");
    expect(next.nodes.consumer.inputs).toContainEqual({
      port: "ocrResult",
      ctxKey,
    });
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toContain("ocrResult");
  });
  it("reuses the producer's existing output ctxKey", () => {
    const config = baseConfig();
    config.nodes.producer = {
      ...config.nodes.producer,
      outputs: [{ port: "ocrResult", ctxKey: "myKey" }],
    } as GraphNode;
    const next = pinPortBinding(config, "consumer", "ocrResult", {
      producerNodeId: "producer",
      producerPort: "ocrResult",
    });
    expect(next.nodes.consumer.inputs).toContainEqual({
      port: "ocrResult",
      ctxKey: "myKey",
    });
    expect(next.nodes.producer.outputs).toHaveLength(1);
  });
  it("replaces an existing input row for the same port", () => {
    /* consumer pre-seeded with { port: "ocrResult", ctxKey: "old" } →
       exactly one row for the port afterwards, pointing at the new key */
  });
  it("returns the config unchanged when consumer === producer or either node is missing", () => {
    const config = baseConfig();
    expect(
      pinPortBinding(config, "consumer", "p", {
        producerNodeId: "consumer",
        producerPort: "q",
      }),
    ).toBe(config);
    expect(
      pinPortBinding(config, "ghost", "p", {
        producerNodeId: "producer",
        producerPort: "q",
      }),
    ).toBe(config);
  });
});

describe("disconnectDataWire", () => {
  it("removes the consumer's input row and adds the port to lockedInputPorts, leaving producer outputs alone", () => {
    const config = baseConfig();
    config.nodes.producer = {
      ...config.nodes.producer,
      outputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    config.nodes.consumer = {
      ...config.nodes.consumer,
      inputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    const next = disconnectDataWire(config, "consumer", "ocrResult");
    expect(next.nodes.consumer.inputs).toEqual([]);
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["ocrResult"]);
    expect(next.nodes.producer.outputs).toEqual([
      { port: "ocrResult", ctxKey: "k" },
    ]);
  });
  it("still adds the lock when the port has no binding (idempotent disconnect)", () => {
    /* no inputs row → lock present afterwards, inputs stays [] */
  });
});

describe("revertPortToAutomatic", () => {
  it("removes the port from lockedInputPorts and drops the metadata field when the list empties", () => {
    /* metadata.lockedInputPorts = ["ocrResult"] → metadata has NO
       lockedInputPorts key afterwards */
  });
  it("leaves other locks in place", () => {
    /* ["a", "b"] minus "a" → ["b"] */
  });
});

describe("ensureEdgeBetween", () => {
  it("adds a normal edge when no edge connects the pair", () => {
    const next = ensureEdgeBetween(baseConfig(), "producer", "consumer");
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "producer",
      target: "consumer",
      type: "normal",
    });
  });
  it("adds a conditional edge when the source is a switch node", () => {
    /* swap producer for a switch node fixture → type: "conditional" */
  });
  it("returns the config unchanged when an edge already connects the pair in either direction", () => {
    /* pre-seed a consumer→producer edge → same config reference back */
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/wire-mutations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `wire-mutations.ts`**

```ts
/**
 * Pure config transforms behind the port-wiring gestures
 * (PORT_WIRING_DESIGN.md §6). One module so the canvas drag gesture, the
 * wire context menu, the delete path, and the settings panel's
 * "Change source" all write bindings identically. Every function returns a
 * NEW config (or the input config unchanged when the operation is a no-op);
 * callers dispatch the result through `onConfigChange`, where
 * `resolveBindings` runs as usual.
 */
import { getLockedInputPorts, synthesiseCtxKey } from "@ai-di/graph-workflow";
import type {
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";

export interface ProducerSelection {
  producerNodeId: string;
  producerPort: string;
}

/** Matches the canvas's existing edge-id shape. */
export function makeEdgeId(): string {
  return `edge-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * §6.1 — pin `consumerPort` to the selected producer output: stamp the
 * consumer `inputs[]` row, ensure the producer carries a matching
 * `outputs[]` row (reusing its ctx key when present), and add the port to
 * `metadata.lockedInputPorts`.
 */
export function pinPortBinding(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  consumerPort: string,
  selection: ProducerSelection,
): GraphWorkflowConfig {
  if (consumerNodeId === selection.producerNodeId) return config;
  const consumer = config.nodes[consumerNodeId];
  const producer = config.nodes[selection.producerNodeId];
  if (!consumer || !producer) return config;

  const existingOutputBinding = producer.outputs?.find(
    (b) => b.port === selection.producerPort,
  );
  const ctxKey =
    existingOutputBinding?.ctxKey ??
    synthesiseCtxKey(selection.producerNodeId, selection.producerPort);
  const nextProducerOutputs = existingOutputBinding
    ? (producer.outputs ?? [])
    : [...(producer.outputs ?? []), { port: selection.producerPort, ctxKey }];
  const nextConsumerInputs = [
    ...(consumer.inputs ?? []).filter((b) => b.port !== consumerPort),
    { port: consumerPort, ctxKey },
  ];
  const nextLocks = Array.from(
    new Set([...getLockedInputPorts(consumer), consumerPort]),
  );
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [selection.producerNodeId]: {
        ...producer,
        outputs: nextProducerOutputs,
      } as GraphNode,
      [consumerNodeId]: {
        ...consumer,
        inputs: nextConsumerInputs,
        metadata: {
          ...(consumer.metadata ?? {}),
          lockedInputPorts: nextLocks,
        },
      } as GraphNode,
    },
  };
}

/**
 * §6.3 — delete a data wire: remove the consumer's input binding and lock
 * the port WITHOUT a binding ("pinned unbound"), so the resolver reports
 * `locked-unbound` instead of instantly re-creating the same wire. The
 * producer's outputs row stays — other consumers may read the same ctx key.
 */
export function disconnectDataWire(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  consumerPort: string,
): GraphWorkflowConfig {
  const consumer = config.nodes[consumerNodeId];
  if (!consumer) return config;
  const nextInputs = (consumer.inputs ?? []).filter(
    (b) => b.port !== consumerPort,
  );
  const nextLocks = Array.from(
    new Set([...getLockedInputPorts(consumer), consumerPort]),
  );
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [consumerNodeId]: {
        ...consumer,
        inputs: nextInputs,
        metadata: {
          ...(consumer.metadata ?? {}),
          lockedInputPorts: nextLocks,
        },
      } as GraphNode,
    },
  };
}

/**
 * §7 — hand the port back to the resolver: drop the lock (and the
 * metadata field when the list empties). The next `resolveBindings` pass
 * re-derives the binding.
 */
export function revertPortToAutomatic(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): GraphWorkflowConfig {
  const node = config.nodes[nodeId];
  if (!node) return config;
  const nextLocks = getLockedInputPorts(node).filter((p) => p !== portName);
  const nextMetadata: Record<string, unknown> = { ...(node.metadata ?? {}) };
  if (nextLocks.length > 0) {
    nextMetadata.lockedInputPorts = nextLocks;
  } else {
    delete nextMetadata.lockedInputPorts;
  }
  return {
    ...config,
    nodes: {
      ...config.nodes,
      [nodeId]: { ...node, metadata: nextMetadata } as GraphNode,
    },
  };
}

/**
 * §6.1 — one gesture = data + order: make sure an edge connects the pair.
 * Skipped when ANY edge already links the two nodes in either direction
 * (a reverse edge means adding a forward one would mint a 2-cycle — the
 * data wire renders regardless of execution path, per §5.1). Switch
 * sources stamp `conditional`, everything else `normal`.
 */
export function ensureEdgeBetween(
  config: GraphWorkflowConfig,
  sourceId: string,
  targetId: string,
): GraphWorkflowConfig {
  const connected = config.edges.some(
    (e) =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId),
  );
  if (connected) return config;
  const sourceNode = config.nodes[sourceId];
  const newEdge: GraphEdge = {
    id: makeEdgeId(),
    source: sourceId,
    target: targetId,
    type: sourceNode?.type === "switch" ? "conditional" : "normal",
  };
  return { ...config, edges: [...config.edges, newEdge] };
}
```

- [ ] **Step 4: Run the new tests**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/wire-mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `InputsSection.tsx` to use the module**

`handleOverride` becomes:

```ts
  const handleOverride = (
    portName: string,
    selection: { producerNodeId: string; producerPort: string },
  ) => {
    const next = pinPortBinding(config, nodeId, portName, selection);
    if (next !== config) onConfigChange(next);
    closePicker();
  };
```

`handleRevert` becomes:

```ts
  const handleRevert = (portName: string) => {
    onConfigChange(revertPortToAutomatic(config, nodeId, portName));
  };
```

Import both from `../canvas/wire-mutations`. Delete the now-unused inline logic and any imports it strands (`synthesiseCtxKey`, `getLockedInputPorts`, `GraphNode` — check what remains used).

- [ ] **Step 6: Run InputsSection + canvas suites, typecheck**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/settings src/features/workflow-builder/canvas && npx tsc --noEmit`
Expected: PASS — behavior is unchanged, only relocated.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/wire-mutations.ts apps/frontend/src/features/workflow-builder/canvas/wire-mutations.test.ts apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx
git commit -m "feat(workflow-builder): shared wire-mutation transforms for port gestures"
```

---

### Task 3: Locked-unbound UI + amber-ring reconciliation

Two changes to the unified problems pipeline: (1) `locked-unbound` becomes a visible "Disconnected by you" state (§12) with a drawer entry; (2) required unbound base-`Artifact` identifier ports now count as problems (Alex's decision) — closing the §15 ring-vs-badge divergence.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/auto-wire-status.ts`
- Modify: `apps/frontend/src/features/workflow-builder/auto-wire-validation.ts`
- Modify: `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx`
- Test: `apps/frontend/src/features/workflow-builder/auto-wire-status.test.ts`, `auto-wire-validation.test.ts`, `settings/InputsSection.test.tsx` (all exist — follow their fixture styles)

- [ ] **Step 1: Write the failing tests**

`auto-wire-status.test.ts`:

```ts
it("flags a required base-Artifact identifier port with no source (ring/badge reconciliation)", () => {
  // activity whose catalog entry has a REQUIRED input of kind "Artifact"
  // (e.g. azureOcr.* documentId-style port) and no upstream name-match.
  const { problemPorts } = computeNodeInputIssues(config, "consumer");
  expect(problemPorts).toContainEqual(
    expect.objectContaining({ port: "documentId", status: "unsatisfied" }),
  );
});
it("does NOT flag an optional base-Artifact identifier port", ...);
it("does NOT flag a required identifier port the resolver name-matches", ...);
it("flags a REQUIRED locked-unbound port as locked-unbound", () => {
  // lockedInputPorts contains the port, no inputs row, catalog port required
  expect(problemPorts).toContainEqual(
    expect.objectContaining({ port: "ocrResult", status: "locked-unbound" }),
  );
});
it("does NOT flag an optional locked-unbound port (deliberate disconnect)", ...);
```

`auto-wire-validation.test.ts`:

```ts
it("emits a 'was disconnected' warning for locked-unbound problems", () => {
  const errors = autoWireIssuesToValidationErrors(config);
  expect(errors).toContainEqual(
    expect.objectContaining({
      path: "nodes.consumer.inputs.ocrResult",
      severity: "warning",
      message:
        'Input "OCR result" was disconnected — pick a source or revert to automatic',
    }),
  );
});
it("emits a needs-a-source warning for a required unbound identifier port", ...);
```

`InputsSection.test.tsx`:

```ts
it("renders a required identifier port row (previously hidden)", ...);
it("renders 'Disconnected' + 'Pick a source' + 'Revert to automatic' for a locked-unbound port", ...);
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/auto-wire-status.test.ts src/features/workflow-builder/auto-wire-validation.test.ts src/features/workflow-builder/settings/InputsSection.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Implement `auto-wire-status.ts`**

- `NodeInputProblem["status"]` becomes `"ambiguous" | "unsatisfied" | "locked-unbound"`.
- Replace the port loop:

```ts
  for (const port of entry.inputs) {
    // Two port populations feed the problems surface:
    //   1. auto-wireable typed ports (as before);
    //   2. REQUIRED base-`Artifact` identifier ports — the amber ring
    //      already fires for these on canvas, so the badge/drawer must
    //      count them too (ring/badge reconciliation, PORT_WIRING §4.2).
    const identifierPort = port.kind === "Artifact" && port.required === true;
    if (!shouldAutoWirePort(port) && !identifierPort) continue;
    const result = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: port.kind,
    });
    const isProblem =
      result.status === "ambiguous" ||
      result.status === "unsatisfied" ||
      // A disconnect is deliberate — only nag when the port is required.
      (result.status === "locked-unbound" && port.required === true);
    if (isProblem) {
      problemPorts.push({
        port: port.name,
        label: port.label ?? port.name,
        kind: port.kind as KindRef,
        status: result.status as NodeInputProblem["status"],
      });
    }
  }
```

Aggregate `status` stays `"ok" | "ambiguous" | "unsatisfied"` — `locked-unbound` rolls up under `unsatisfied` (it needs a source to run). Update the aggregate expression accordingly (any non-ambiguous problem → `"unsatisfied"` — the existing `problemPorts.length > 0` fallback already does this).

- [ ] **Step 4: Implement `auto-wire-validation.ts` message branch**

```ts
      const message =
        problem.status === "ambiguous"
          ? `Input "${problem.label}" has multiple possible sources — pick one`
          : problem.status === "locked-unbound"
            ? `Input "${problem.label}" was disconnected — pick a source or revert to automatic`
            : `Input "${problem.label}" needs a source — choose where it comes from`;
```

- [ ] **Step 5: Implement `InputsSection.tsx`**

- Row filter (both the empty-state count and the map) changes from `entry.inputs.filter(shouldAutoWirePort)` to:

```ts
  const wireableInputs = entry.inputs.filter(
    (p) => shouldAutoWirePort(p) || (p.kind === "Artifact" && p.required === true),
  );
```

- `PortRow`'s `renderBody` switch gains:

```tsx
      case "locked-unbound":
        return (
          <Group gap={6} wrap="nowrap">
            <Tooltip label="Disconnected by you">
              <Badge size="xs" color="gray" variant="light">
                Disconnected
              </Badge>
            </Tooltip>
            <Button size="compact-xs" variant="light" onClick={onOverride}>
              Pick a source
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={onRevert}>
              Revert to automatic
            </Button>
          </Group>
        );
```

- [ ] **Step 6: Run the three suites + full frontend + typecheck**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder && npx tsc --noEmit`
Expected: PASS. Watch for knock-on failures in `ValidationDrawer.test.tsx` / `WorkflowEditorV2Page.test.tsx` (badge counts may shift where fixtures include required identifier ports) — adjust those fixtures' expectations deliberately, don't paper over.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/auto-wire-status.ts apps/frontend/src/features/workflow-builder/auto-wire-status.test.ts apps/frontend/src/features/workflow-builder/auto-wire-validation.ts apps/frontend/src/features/workflow-builder/auto-wire-validation.test.ts apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx apps/frontend/src/features/workflow-builder/settings/InputsSection.test.tsx
git commit -m "feat(workflow-builder): Disconnected-by-you state + identifier ports join the problems surface"
```

---

### Task 4: Data wires become deletable — §6.3 semantics

Selecting a data wire and pressing Delete disconnects the binding (pinned-unbound) instead of touching `config.edges`. If the pair keeps a normal edge with no remaining data wires, a transient notification explains the dashed remainder.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`projectFlowWires` data branch + `handleEdgesDelete`)
- Test: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests** (follow the file's existing render-canvas + config fixture patterns; mock `@mantine/notifications`):

```ts
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

describe("data wire deletion (§6.3)", () => {
  it("projects data wires as selectable + deletable", ...); // inspect projected edges via the existing projection assertions pattern
  it("deleting a data wire removes the input binding and locks the port, leaving config.edges untouched", () => {
    // drive handleEdgesDelete via the ReactFlow onEdgesDelete prop the test
    // harness already intercepts (see existing delete tests in this file);
    // deleted payload = the projected data-wire Edge (data.wire.variant === "data").
    // Assert onConfigChange got: no inputs row for the port; port in
    // lockedInputPorts; edges array identical.
  });
  it("deleting a structural sequence wire still removes the edge", ...);
  it("shows the 'Execution order kept' hint when the last data wire between a pair is deleted and a normal edge remains", () => {
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Execution order kept — delete the dashed wire to fully detach.",
      }),
    );
  });
  it("does not show the hint when other data wires between the pair remain", ...);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`
Expected: new tests FAIL (wires aren't deletable yet).

- [ ] **Step 3: Implement**

In `projectFlowWires`'s data branch, change:

```ts
        deletable: true,
        selectable: true,
```

Update the surrounding docstring ("Data wires are render-only this phase" is no longer true — they're deletable/selectable; §6.3 semantics live in `handleEdgesDelete`).

Replace `handleEdgesDelete`:

```ts
  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (deleted.length === 0) return;
      // Split §6.3-style: data wires disconnect their binding (pinned
      // unbound); structural wires delete the underlying GraphEdge.
      const dataWires: DataWire[] = [];
      const removedEdgeIds = new Set<string>();
      for (const e of deleted) {
        const wire = (e.data as WorkflowEdgeData | undefined)?.wire;
        if (wire?.variant === "data") dataWires.push(wire);
        else removedEdgeIds.add(e.id);
      }
      let next = config;
      if (removedEdgeIds.size > 0) {
        next = {
          ...next,
          edges: next.edges.filter((e) => !removedEdgeIds.has(e.id)),
        };
      }
      for (const wire of dataWires) {
        next = disconnectDataWire(next, wire.target, wire.targetPort);
      }
      if (next !== config) onConfigChange(next);

      // §6.3 hint: the pair's normal edge survives a data-wire delete —
      // when the LAST data wire between the pair goes, the remaining edge
      // re-renders as a dashed sequence wire, which needs explaining once.
      const leavesSequenceRemainder = dataWires.some((wire) => {
        if (wire.edgeId === undefined) return false; // no edge → no remainder
        // Pre-delete wires between the pair vs how many of them were just
        // deleted: equal counts mean the LAST data wire on this pair went,
        // so its normal edge will re-render as a dashed sequence wire.
        const pairWiresBefore = derivedWires.filter(
          (w): w is DataWire =>
            w.variant === "data" &&
            w.source === wire.source &&
            w.target === wire.target,
        ).length;
        const deletedFromPair = dataWires.filter(
          (d) => d.source === wire.source && d.target === wire.target,
        ).length;
        return pairWiresBefore === deletedFromPair;
      });
      if (leavesSequenceRemainder) {
        notifications.show({
          message:
            "Execution order kept — delete the dashed wire to fully detach.",
          color: "gray",
          autoClose: 6000,
        });
      }
    },
    [config, onConfigChange, derivedWires],
  );
```

Imports: `disconnectDataWire` from `./wire-mutations`, `notifications` from `@mantine/notifications`, `DataWire` type from `./derive-wires` (already imported for `WorkflowEdgeData`? verify). `derivedWires` is the existing fingerprint-memoized value in the component — confirm its actual variable name at the top of the component and use that.

- [ ] **Step 4: Run canvas suite + typecheck**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "feat(workflow-builder): data-wire deletion disconnects the binding (pinned unbound)"
```

---

### Task 5: Wire context menu — Disconnect / Revert to automatic (§7)

Right-clicking a data wire opens a small menu: **Disconnect** (always) and **Revert to automatic** (pinned wires only). "View data" is Phase 4 — do NOT add it.

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx`
- Create: `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.test.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`onEdgeContextMenu` + state + mount)

- [ ] **Step 1: Write the failing tests** (`WireContextMenu.test.tsx` — mirror `NodeContextMenu.test.tsx`'s render/controlled-menu style):

```ts
it("renders Disconnect for an auto wire and hides Revert to automatic", ...);
it("renders both Disconnect and Revert to automatic for a pinned wire", ...);
it("fires onDisconnect / onRevert with the wire and closes", ...);
```

Plus in `WorkflowEditorCanvas.test.tsx`:

```ts
it("opens the wire menu on data-wire context menu and applies Disconnect", ...);
it("Revert to automatic removes the lock so the resolver re-derives", ...);
```

- [ ] **Step 2: Run to verify failure**, same vitest commands as Task 4.

- [ ] **Step 3: Implement `WireContextMenu.tsx`**

Copy `NodeContextMenu.tsx`'s controlled-`Menu` + invisible-fixed-anchor pattern (read it first; keep the same `transitionProps={{ duration: 0 }}` and portal usage):

```tsx
export interface WireContextMenuProps {
  opened: boolean;
  x: number;
  y: number;
  wire: DataWire | null;
  onClose: () => void;
  onDisconnect: (wire: DataWire) => void;
  onRevert: (wire: DataWire) => void;
}
```

Menu items:

```tsx
        <Menu.Dropdown data-testid="wire-context-menu">
          {wire?.pinned ? (
            <Menu.Item
              data-testid="wire-menu-revert"
              onClick={() => { onRevert(wire); onClose(); }}
            >
              Revert to automatic
            </Menu.Item>
          ) : null}
          {wire ? (
            <Menu.Item
              data-testid="wire-menu-disconnect"
              color="red"
              onClick={() => { onDisconnect(wire); onClose(); }}
            >
              Disconnect
            </Menu.Item>
          ) : null}
        </Menu.Dropdown>
```

- [ ] **Step 4: Wire into the canvas**

- State: `const [wireMenu, setWireMenu] = useState<{ wire: DataWire; x: number; y: number } | null>(null);`
- Handler on `<ReactFlow onEdgeContextMenu={handleEdgeContextMenu}>`:

```ts
  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const wire = (edge.data as WorkflowEdgeData | undefined)?.wire;
      if (wire?.variant !== "data") return; // structural edges keep native behavior
      event.preventDefault();
      setWireMenu({ wire, x: event.clientX, y: event.clientY });
    },
    [],
  );
```

- Actions: `onDisconnect` routes through the same disconnect-plus-hint path as Task 4 (extract the Task-4 body into a `disconnectWires(wires: DataWire[])` helper inside the component and call it from both `handleEdgesDelete` and here). `onRevert`:

```ts
  const handleWireRevert = useCallback(
    (wire: DataWire) => {
      onConfigChange(revertPortToAutomatic(config, wire.target, wire.targetPort));
    },
    [config, onConfigChange],
  );
```

- Mount `<WireContextMenu …/>` next to the existing `<NodeContextMenu …/>`.

- [ ] **Step 5: Run canvas suite + typecheck**, expected PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "feat(workflow-builder): wire context menu — disconnect / revert to automatic"
```

---

### Task 6: Drag port → port creates a pinned binding (§6.1)

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts` (+ `.test.ts`)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` (handles become connectable)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`handleConnect` port branch)
- Test: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx`, `PortRows.test.tsx`

- [ ] **Step 1: Write the failing tests**

`port-kinds.test.ts`:

```ts
describe("outputPortKind / inputPortKind", () => {
  it("returns the catalog kind for an activity output/input port", ...);
  it("returns undefined for control-flow/source nodes, unknown ports, and dyn.* types", ...);
});
```

`WorkflowEditorCanvas.test.tsx`:

```ts
describe("drag-to-bind (§6.1)", () => {
  it("a port-to-port connection pins the binding, locks the port, and ensures a normal edge", () => {
    // fire the ReactFlow onConnect prop with
    // { source, target, sourceHandle: "out-ocrResponse", targetHandle: "in-ocrResponse" }
    // Assert onConfigChange: consumer inputs row present with producer's ctxKey,
    // port locked, edges gained ONE normal edge between the pair.
  });
  it("skips the edge when one already connects the pair (either direction) but still pins the binding", ...);
  it("a port-source connection dropped on a node-level target falls through to plain edge creation", () => {
    // sourceHandle: "out-x", targetHandle: null → config.edges grows, no new lock
  });
  it("node-level connections keep today's behavior exactly", ...); // existing duplicate/type tests still green
});
```

`PortRows.test.tsx`: assert input-row handles render `isConnectable` (xyflow stamps `.connectable` class / the `<Handle>` receives the prop — follow how the existing test asserts `isConnectable={false}` today and invert).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `port-kinds.ts`**

```ts
/**
 * Catalog kind lookups for a node's per-port handles. Pure. Used by the
 * connect-gesture layer (isValidConnection, drag highlight, §9 filter) —
 * NOT by rendering, which already gets kinds via `computePortRows`.
 */
import { getActivityCatalogEntry, type KindRef } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

export function outputPortKind(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): KindRef | undefined {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil"))
    return undefined;
  return getActivityCatalogEntry(node.activityType)?.outputs.find(
    (p) => p.name === portName,
  )?.kind;
}

export function inputPortKind(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
): KindRef | undefined {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil"))
    return undefined;
  return getActivityCatalogEntry(node.activityType)?.inputs.find(
    (p) => p.name === portName,
  )?.kind;
}

/** `in-<port>` / `out-<port>` → port name; null for node-level handles. */
export function portFromHandleId(
  handleId: string | null | undefined,
  direction: "input" | "output",
): string | null {
  const prefix = direction === "input" ? "in-" : "out-";
  if (!handleId || !handleId.startsWith(prefix)) return null;
  return handleId.slice(prefix.length);
}
```

- [ ] **Step 4: Flip `PortRows.tsx` handles to connectable**

Change `isConnectable={false}` to `isConnectable` (both directions — inputs are drop targets, outputs are drag sources). Update the file docstring ("RENDER-ONLY phase" paragraph is now wrong — describe the gesture split: per-port handles create bindings, node-level handles keep the node-to-node gesture).

- [ ] **Step 5: Extend `handleConnect`**

At the top of the existing callback body (after the null/self guards):

```ts
      // §6.1 drag-to-bind: BOTH endpoints on per-port handles → one gesture
      // writes data + order + pin. Mixed gestures (port→node-body or
      // node→port) fall through to the node-level path below — an edge is
      // created and auto-wire narrates the result (§6.4).
      const sourcePort = portFromHandleId(connection.sourceHandle, "output");
      const targetPort = portFromHandleId(connection.targetHandle, "input");
      if (sourcePort !== null && targetPort !== null) {
        let next = pinPortBinding(config, connection.target, targetPort, {
          producerNodeId: connection.source,
          producerPort: sourcePort,
        });
        next = ensureEdgeBetween(next, connection.source, connection.target);
        if (next !== config) onConfigChange(next);
        return;
      }
```

Also refactor the two inline `edge-${Date.now()…}` id generators in this file (`handleConnect`'s node-level branch and `extendFromSource`) to call `makeEdgeId()` from `./wire-mutations` — one id formula, three call sites.

- [ ] **Step 6: Run canvas + PortRows suites + typecheck.** Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts apps/frontend/src/features/workflow-builder/canvas/port-kinds.test.ts apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx apps/frontend/src/features/workflow-builder/canvas/PortRows.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "feat(workflow-builder): drag port-to-port pins a binding + ensures the edge"
```

---

### Task 7: Connect-time validation — isValidConnection, highlight/dim, rejection notice (§6.2)

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`isValidConnection`, `onConnectStart`/`onConnectEnd`, `PortDragContext` provider)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` (context consumer: highlight/dim)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts` (`humanKindLabel`)
- Test: canvas + PortRows + port-kinds test files

- [ ] **Step 1: Write the failing tests**

`port-kinds.test.ts`:

```ts
describe("humanKindLabel", () => {
  it('renders "Segment (list)" for "Segment[]"', () =>
    expect(humanKindLabel("Segment[]")).toBe("Segment (list)"));
  it("passes base kinds through", () => expect(humanKindLabel("Document")).toBe("Document"));
  it('falls back to "Artifact" for undefined', () => expect(humanKindLabel(undefined)).toBe("Artifact"));
});
```

`WorkflowEditorCanvas.test.tsx`:

```ts
describe("isValidConnection (§6.2)", () => {
  it("rejects an incompatible port-to-port pair (Segment[] → Document)", ...);
  it("accepts an assignable pair and any drop onto a base-Artifact port", ...);
  it("always accepts node-level connections and rejects self-connections", ...);
});
it("shows a plain-language rejection notice on an invalid port drop", () => {
  // call the onConnectEnd prop with a connectionState { isValid: false,
  // fromHandle: {nodeId, id: "out-…"}, toHandle: {nodeId, id: "in-…"} }
  expect(notifications.show).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Segment (list) can\'t be used as a Document',
    }),
  );
});
```

`PortRows.test.tsx`:

```ts
it("stamps data-drop-compatible on input rows while a port drag is in progress", () => {
  // wrap render in <PortDragContext.Provider value={{ sourceKind: "Segment[]" }}>
  // assert compatible input rows have data-drop-compatible="true" and dim
  // styling absent; incompatible rows "false" with reduced opacity.
});
it("renders normally (no attribute) when no drag is in progress", ...);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`port-kinds.ts` addition:

```ts
/** Plain-language kind for user-facing copy: `Segment[]` → "Segment (list)". */
export function humanKindLabel(kind: KindRef | undefined): string {
  if (kind === undefined) return "Artifact";
  return kind.endsWith("[]") ? `${kind.slice(0, -2)} (list)` : kind;
}
```

`PortRows.tsx` — export the context and consume it:

```tsx
/**
 * Published by the canvas while a per-port connection drag is in progress
 * (§6.2): carries the drag source's output kind so every input row can
 * self-classify as a compatible (highlight) or incompatible (dim) target.
 * `null` when no port drag is active.
 */
export const PortDragContext = createContext<{
  sourceKind: KindRef | undefined;
} | null>(null);
```

In `PortRow`:

```tsx
  const drag = useContext(PortDragContext);
  // Input rows classify against the in-flight drag; wildcard (base
  // Artifact) ports accept any drop (§6.2). Output rows are untouched.
  const dropCompatible =
    drag !== null && isInput
      ? row.kind === undefined ||
        row.kind === "Artifact" ||
        isAssignable(drag.sourceKind, row.kind)
      : null;
```

Style adjustments on the row div + handle:

```tsx
        data-drop-compatible={
          dropCompatible === null ? undefined : String(dropCompatible)
        }
        style={{
          …existing…,
          ...(dropCompatible === false ? { opacity: 0.35 } : {}),
        }}
```

and on `handleStyle` when `dropCompatible === true`:

```tsx
    ...(dropCompatible === true
      ? { transform: "translate(0, -50%) scale(1.5)" }
      : {}),
```

(Check how the handle is vertically centred first — it uses `top: "50%"`; xyflow's base handle CSS applies its own transform, so verify in the browser during Step 5 that the scale doesn't shift the dot; if it fights xyflow's transform, use `width/height` +4px instead. Note the finding in the commit message if the fallback is used.)

`WorkflowEditorCanvas.tsx`:

```ts
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (connection.source === connection.target) return false;
      const sourcePort = portFromHandleId(connection.sourceHandle, "output");
      const targetPort = portFromHandleId(connection.targetHandle, "input");
      // Node-level gestures keep today's permissive behavior (§6.2 only
      // governs port-to-port drags).
      if (sourcePort === null || targetPort === null) return true;
      const targetKind = inputPortKind(config, connection.target, targetPort);
      if (targetKind === undefined || targetKind === "Artifact") return true;
      const sourceKind = outputPortKind(config, connection.source, sourcePort);
      return isAssignable(sourceKind, targetKind);
    },
    [config],
  );
```

Drag-state tracking + provider (around the existing `<ReactFlow>`):

```ts
  const [dragFrom, setDragFrom] = useState<{
    nodeId: string;
    handleId: string;
  } | null>(null);
  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    if (params.nodeId && params.handleId) {
      setDragFrom({ nodeId: params.nodeId, handleId: params.handleId });
    }
  }, []);
  const portDragValue = useMemo(() => {
    const sourcePort = portFromHandleId(dragFrom?.handleId, "output");
    if (!dragFrom || sourcePort === null) return null;
    return { sourceKind: outputPortKind(config, dragFrom.nodeId, sourcePort) };
  }, [dragFrom, config]);
```

`onConnectEnd` (xyflow ≥12.3 passes `connectionState` as the second arg — verify against the installed 12.10 types):

```ts
  const handleConnectEnd = useCallback<OnConnectEnd>(
    (_event, connectionState) => {
      setDragFrom(null);
      const fromPort = portFromHandleId(
        connectionState.fromHandle?.id,
        "output",
      );
      const toPort = portFromHandleId(connectionState.toHandle?.id, "input");
      if (
        !connectionState.isValid &&
        fromPort !== null &&
        toPort !== null &&
        connectionState.fromNode &&
        connectionState.toNode
      ) {
        const sourceKind = outputPortKind(
          config,
          connectionState.fromNode.id,
          fromPort,
        );
        const targetKind = inputPortKind(
          config,
          connectionState.toNode.id,
          toPort,
        );
        notifications.show({
          color: "yellow",
          message: `${humanKindLabel(sourceKind)} can't be used as a ${humanKindLabel(targetKind)}`,
          autoClose: 5000,
        });
      }
    },
    [config],
  );
```

Wrap the returned `<ReactFlow …>` in `<PortDragContext.Provider value={portDragValue}>` and pass `isValidConnection={isValidConnection} onConnectStart={handleConnectStart} onConnectEnd={handleConnectEnd}`.

- [ ] **Step 4: Run canvas + PortRows suites + typecheck.** Expected: PASS.

- [ ] **Step 5: Browser sanity check (REQUIRED — jsdom can't verify drag styling)**

Use the app-browser-auth skill pattern (origin-agnostic `**/api/**` routes). With the dev stack running, open a seeded workflow, start a drag from a typed output port, screenshot: compatible input dots enlarged, incompatible rows dimmed; drop on an incompatible port → yellow notice appears; drop on compatible port → wire appears with "Pinned by you" tooltip. Do NOT run any install command; if the stack is down, start it with the repo's dev scripts.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts apps/frontend/src/features/workflow-builder/canvas/port-kinds.test.ts apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx apps/frontend/src/features/workflow-builder/canvas/PortRows.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "feat(workflow-builder): connect-time kind validation with highlight/dim + rejection notice"
```

---### Task 8: Connect-summary popover (§6.4)

After a node-to-node connect (drag, hover-extend, or palette pick creating an edge into an activity), a transient popover on the target narrates what auto-wire did: `✓ fileData ← Prepare document` per bound port, `⚠ ocrResponse needs a source [Fix]` per problem. Replaces silent auto-wiring.

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/ConnectSummaryPopover.tsx` (+ `.test.tsx`)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (trigger state, `onFixNodeInput` prop)
- Modify: `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` (pass `handleFixNodeInput` down)
- Test: `ConnectSummaryPopover.test.tsx`, `WorkflowEditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

`ConnectSummaryPopover.test.tsx` (pure component, given config + nodeId):

```ts
it("lists a ✓ row with the producer's label for each bound input", ...);
it("lists a ⚠ row with a Fix button for unsatisfied/ambiguous/locked-unbound inputs", ...);
it("shows a ✓ from-variable row for ctx-bound inputs", ...);
it("Fix fires onFix(nodeId, port)", ...);
it("renders nothing for a node with no wireable inputs", ...);
```

`WorkflowEditorCanvas.test.tsx`:

```ts
it("opens the connect summary for the target after a node-level connect", ...);
it("opens the connect summary after a hover-extend activity pick", ...);
it("does NOT open it for a port-to-port drag (§6.1 has its own feedback: the pinned wire)", ...);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `ConnectSummaryPopover.tsx`**

Anchor pattern: same 1×1 fixed invisible div as `HoverExtendPopover` (viewport coords supplied by the canvas). Props:

```tsx
export interface ConnectSummaryPopoverProps {
  opened: boolean;
  anchorPosition: { x: number; y: number };
  config: GraphWorkflowConfig;
  nodeId: string | null;
  onClose: () => void;
  /** Deep-link into the settings-panel source picker (page's handleFixNodeInput). */
  onFix?: (nodeId: string, port: string) => void;
}
```

Row derivation — reuse the pipeline, do not re-implement: rows = the same wireable-input set as `InputsSection` (`shouldAutoWirePort(p) || (p.kind === "Artifact" && p.required === true)`); per row call `resolveInputPort` and read the node's persisted `inputs[]`:

```tsx
  // ✓ bound rows: status auto-bound (label ← producer label, mention
  //   "matched by name" when via === "name-match"), status locked with a
  //   ctxKey (label — pinned / from <ctxKey> when it's a config.ctx var).
  // ⚠ problem rows: unsatisfied / ambiguous / locked-unbound → warning row
  //   + <Button size="compact-xs" onClick={() => onFix?.(nodeId, port.name)}>Fix</Button>
```

Auto-dismiss: `useEffect` that arms an 8-second `setTimeout(onClose)` whenever `opened` flips true (clear on unmount/close). Also `closeOnClickOutside` via the Popover.

- [ ] **Step 4: Trigger from the canvas**

- New canvas prop `onFixNodeInput?: (nodeId: string, port: string) => void`; page passes its existing `handleFixNodeInput`.
- State `const [connectSummary, setConnectSummary] = useState<{ nodeId: string; x: number; y: number } | null>(null);`
- In `handleConnect`'s node-level branch (after `onConfigChange`), when the target is an activity/pollUntil node: anchor at the target node's DOM rect (one-shot lookup is fine for a transient popover):

```ts
      const el = document.querySelector(
        `.react-flow__node[data-id="${connection.target}"]`,
      );
      const rect = el?.getBoundingClientRect();
      if (rect) {
        setConnectSummary({
          nodeId: connection.target,
          x: rect.right,
          y: rect.top,
        });
      }
```

- Same trigger at the end of `extendFromSource` (covers both hover-extend pick paths) — the new node's element may not exist yet on this tick; wrap the lookup in `requestAnimationFrame` (and note in the test that jsdom needs the RAF mock the file already uses, or fall back to anchoring at the popover's last anchor position when the element isn't found).
- The popover reads the LIVE `config` prop — by the time the user sees it, `resolveBindings` has already run in the page's `handleCanvasConfigChange`, so the rows reflect the post-auto-wire truth.
- Mount `<ConnectSummaryPopover opened={connectSummary !== null} … onFix={onFixNodeInput} />`. `onFix` should also close the popover.

- [ ] **Step 5: Run suites + typecheck; browser sanity check** (connect two nodes node-level, popover lists ✓/⚠ rows; Fix opens the settings picker on the right port).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/ConnectSummaryPopover.tsx apps/frontend/src/features/workflow-builder/canvas/ConnectSummaryPopover.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx
git commit -m "feat(workflow-builder): connect-summary popover narrates auto-wire results"
```

---

### Task 9: Port-aware extend popover (§9)

Kind-aware extension: hovering a **port-row output handle** (or releasing a port drag on empty canvas) opens the extend popover filtered/ranked to catalog entries with an input assignable from that port's kind, with Flow Control + a "Show all" escape below. Picking a matching entry places the node **and** pins the matching port (§6.1). The node-level `out` handle keeps today's unfiltered popover.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx` (filter/rank + Show all)
- Create: `apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts` (+ `.test.ts`) — pure filter/rank/match helpers
- Modify: `apps/frontend/src/features/workflow-builder/canvas/use-hover-extend.ts` (`HoverExtendState` gains `sourcePort?`/`filterKind?`)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` (output-handle hover callbacks)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (thread callbacks; drag-release-on-canvas opens popover; pick path pins the port)
- Tests: `extend-filter.test.ts`, `HoverExtendPopover.test.tsx`, `WorkflowEditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

`extend-filter.test.ts`:

```ts
describe("entriesAcceptingKind", () => {
  it("keeps entries with a typed input assignable from K, ranked exact-kind first", ...);
  it("excludes entries whose only assignable inputs are base-Artifact wildcards", ...); // wildcard accepts everything — matching on it is noise
  it("returns null for an undefined kind (caller shows the unfiltered popover)", ...);
});
describe("firstMatchingInputPort", () => {
  it("returns the first catalog input (declaration order) assignable from K", ...);
  it("returns null when none match", ...);
});
```

`HoverExtendPopover.test.tsx` additions:

```ts
it("with filterKind set, shows only matching entries plus Flow Control", ...);
it("'Show all' reveals the full catalog", ...);
it("without filterKind, renders exactly as before", ...);
```

`WorkflowEditorCanvas.test.tsx` additions:

```ts
it("hovering a port-row output handle opens the popover filtered by that port's kind", ...);
it("releasing a port drag on empty canvas opens the filtered popover at the cursor", ...);
it("picking a matching activity places the node, pins the matching port, and adds the edge", ...);
it("picking via Show all falls back to plain edge + connect summary", ...);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `extend-filter.ts`**

```ts
/**
 * §9 — kind-aware filtering for the extend popover. "Matching" means the
 * entry has at least one AUTO-WIREABLE input assignable from the dragged
 * output's kind; base-`Artifact` wildcard inputs are deliberately NOT
 * matches (they accept everything — filtering on them is noise), mirroring
 * `shouldAutoWirePort` semantics.
 */
import {
  type ActivityCatalogEntry,
  isAssignable,
  type KindRef,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";

export function entryAcceptsKind(
  entry: ActivityCatalogEntry,
  kind: KindRef,
): boolean {
  return entry.inputs.some(
    (p) => shouldAutoWirePort(p) && isAssignable(kind, p.kind),
  );
}

/** Exact-kind matches rank above merely-assignable ones; stable otherwise. */
export function rankEntriesForKind<
  T extends { entry: ActivityCatalogEntry },
>(items: T[], kind: KindRef): T[] {
  const exact = items.filter((i) =>
    i.entry.inputs.some((p) => shouldAutoWirePort(p) && p.kind === kind),
  );
  const rest = items.filter((i) => !exact.includes(i));
  return [...exact, ...rest];
}

export function firstMatchingInputPort(
  entry: ActivityCatalogEntry,
  kind: KindRef,
): string | null {
  const port = entry.inputs.find(
    (p) => shouldAutoWirePort(p) && isAssignable(kind, p.kind),
  );
  return port?.name ?? null;
}
```

(Adjust the exact shapes to whatever `getCatalogByCategory` returns in `catalog-utils.ts` — read it first; the popover works with `{displayName, activityType}` entries, so the filter helpers may take `activityType` and look entries up via `getActivityCatalogEntry` instead. Keep the helpers pure either way.)

- [ ] **Step 4: `HoverExtendPopover.tsx`**

New optional props:

```ts
  /** §9 — when set, the default view filters/ranks to entries accepting this kind. */
  filterKind?: KindRef;
```

Behavior: when `filterKind` is set and the user hasn't clicked "Show all" (local `useState`, reset when `filterKind` changes): activity categories filter via `entryAcceptsKind` + rank via `rankEntriesForKind`; Flow Control section always renders; below the list a subtle full-width button `data-testid="hover-extend-show-all"` labeled `Show all nodes`. Search still applies within the active view. When zero entries match the kind, skip straight to the full list (no dead-end).

- [ ] **Step 5: Hover trigger from port rows**

- `use-hover-extend.ts`: `HoverExtendState` gains `sourcePort?: string` (`handleSourceHandleEnter` gains an optional 3rd arg it stores).
- `PortRows.tsx`: new optional props `onOutputHandleEnter?: (nodeId, portName, anchor) => void`, `onOutputHandleLeave?: () => void`; output-row handles get `onMouseEnter` (compute anchor = handle rect right-center, same geometry as `makeSourceHandleHoverHandlers`) and `onMouseLeave`. Thread from the canvas through the activity node's `data` the same way the node-level hover callbacks reach `NodeHandles` (read `projectFlowNodes`/`ActivityNodeRenderer` to copy the exact plumbing).
- Canvas: `filterKind` for the popover = `hoverExtend.sourcePort ? outputPortKind(config, hoverExtend.nodeId, hoverExtend.sourcePort) : undefined`.

- [ ] **Step 6: Drag-release-on-empty-canvas trigger**

In Task 7's `handleConnectEnd`, add: when the drag started from an `out-<port>` handle and `connectionState.toNode == null` (released on the pane), open the extend popover at the release position:

```ts
      if (fromPort !== null && !connectionState.toNode && connectionState.fromNode) {
        const clientX =
          "clientX" in event ? event.clientX : event.changedTouches[0].clientX;
        const clientY =
          "clientY" in event ? event.clientY : event.changedTouches[0].clientY;
        openExtendAt(connectionState.fromNode.id, fromPort, {
          x: clientX,
          y: clientY,
        });
      }
```

where `openExtendAt` sets the same `hoverExtend`-style state (bypass the 200ms debounce — call the state setter directly; extend `useHoverExtend` with an immediate `openHoverExtend(state)` function).

- [ ] **Step 7: Pick path pins the matching port**

In `handleHoverPickActivity` (and the control-flow pick stays edge-only): after building the new node, when the popover was opened with a `sourcePort` whose kind matches the picked entry:

```ts
      const kind = outputPortKind(config, sourceNodeId, sourcePort);
      const matchedPort =
        kind !== undefined ? firstMatchingInputPort(entry, kind) : null;
```

If `matchedPort !== null`: place the node, then `pinPortBinding(next, newId, matchedPort, { producerNodeId: sourceNodeId, producerPort: sourcePort })` + `ensureEdgeBetween` — a single `onConfigChange`. If null (picked via Show all / no match): keep today's `extendFromSource` path, which now also opens the connect summary (Task 8) — §6.4's narration covers the fallback.

- [ ] **Step 8: Run all canvas suites + typecheck; browser sanity check** (hover a typed output port → filtered popover; pick → node lands pre-wired with a pinned wire; drag from port to empty canvas → popover at cursor).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts apps/frontend/src/features/workflow-builder/canvas/extend-filter.test.ts apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.test.tsx apps/frontend/src/features/workflow-builder/canvas/use-hover-extend.ts apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx apps/frontend/src/features/workflow-builder/canvas/PortRows.test.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
git commit -m "feat(workflow-builder): kind-aware extend popover with auto-pick wiring (spec §9)"
```

---

### Task 10: E2E — `tier2-port-wiring` + suite sweep

**Files:**
- Create: `tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts`
- Modify: `tests/e2e/workflow-builder/helpers/canvas.ts` (add `dragConnectPorts`)
- Possibly modify: other tier1/tier2 specs broken by newly-selectable wires

- [ ] **Step 1: Add the helper** (`canvas.ts`, below `dragConnect` — same outer-edge grab technique):

```ts
/** Drag from a per-port output handle to a per-port input handle (§6.1). */
export async function dragConnectPorts(
  page: Page,
  sourceId: string,
  sourcePort: string,
  targetId: string,
  targetPort: string,
): Promise<void> {
  const sourceHandle = page.locator(
    `.react-flow__node[data-id="${sourceId}"] .react-flow__handle[data-handleid="out-${sourcePort}"]`,
  );
  const targetHandle = page.locator(
    `.react-flow__node[data-id="${targetId}"] .react-flow__handle[data-handleid="in-${targetPort}"]`,
  );
  const from = await sourceHandle.boundingBox();
  const to = await targetHandle.boundingBox();
  if (!from || !to) throw new Error("port handle not found for drag-connect");
  const fromX = from.x + from.width - 1;
  const fromY = from.y + from.height / 2;
  const toX = to.x + 1;
  const toY = to.y + to.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 8 });
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
}
```

- [ ] **Step 2: Write `tier2-port-wiring.spec.ts`**

Use `wb-test.ts`'s authenticated fixtures and `workflow-api.ts`'s seeding helpers (read `tier2-typed-io.spec.ts` first and mirror its structure/fixture spacing). Five tests:

1. **drag-to-bind round-trip** — seed two compatible unconnected activity nodes (e.g. `azureOcr.extract` → `ocr.cleanup`-style pair from the existing fixtures); `dragConnectPorts`; assert an edge with `data-provenance="pinned"` and `data-wire-variant="data"` appears; Save; reload the editor; the pinned wire persists.
2. **incompatible drop rejected** — drag from an output whose kind can't assign to a typed input; assert no new data wire and the Mantine notification with the "can't be used as a" text is visible.
3. **delete → pinned-unbound → revert** — seed an auto-wired chain; click the data wire to select, press `Delete`; assert the wire is gone, the target port row has `data-needs-source="true"`, and the problems badge/drawer shows the "was disconnected" entry; right-click where the wire was is no longer possible so revert via the settings panel's "Revert to automatic" (or re-derive by clicking the port row's drawer entry); assert the wire returns with `data-provenance^="auto"`.
4. **connect summary** — node-level `dragConnect` between two nodes; assert the connect-summary popover (`data-testid="connect-summary-popover"` — stamp this testid in Task 8) lists at least one ✓ row; a ⚠ Fix click opens the settings drawer's picker.
5. **port-aware popover** — hover a typed output port handle; assert the popover shows a filtered subset + "Show all"; pick the top entry; assert the new node exists with a `data-provenance="pinned"` wire into it.

- [ ] **Step 3: Run the new spec**

Run: `npx playwright test tests/e2e/workflow-builder/specs/tier2-port-wiring.spec.ts`
Expected: 5/5. Debug with `--headed` if drag coordinates misfire (port handles are small — the outer-edge grab matters).

- [ ] **Step 4: Sweep the whole workflow-builder suite**

Run: `npx playwright test tests/e2e/workflow-builder`
Expected: all green (54 existing + 5 new). Likely fallout: specs that click near edges may now select a data wire (visual state change) — fix the specs' assumptions, not the feature. Do NOT touch `tests/e2e/benchmarking/`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/workflow-builder
git commit -m "test(e2e): tier2-port-wiring — drag-to-bind, rejection, delete/revert, popovers"
```

---

### Task 11: Docs, seeder sync, spec status

Per project convention every touched surface updates `/docs-md`; the demo seeder embeds guide step text, so guide edits must be mirrored there or the next reseed reverts them.

**Files:**
- Modify: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` (§15 status + limitations)
- Modify: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` (only if demo-visible surfaces changed)
- Modify: `scripts/seed-feature-demos.mjs` (keep byte-identical with guide steps)
- Modify: `docs-md/workflow-builder/AUTO_WIRE_DESIGN.md` (locked-unbound status; §11's "auto-pick on hover-extend" follow-up now satisfied)

- [ ] **Step 1: PORT_WIRING_DESIGN.md**

- Header status → `Phases 1–3 implemented (plan links); Phases 4–5 pending.`
- §15 item 3 gets a *Status: complete* block mirroring item 2's format: what landed (drag-to-bind via `wire-mutations.ts`, `locked-unbound` resolver status, delete semantics + hint, wire context menu, isValidConnection + highlight/dim + rejection notice, connect summary, §9 filtered popover with auto-pick, ring/badge reconciliation per Alex's decision) and honest known limitations discovered during implementation.
- Remove/mark-resolved the §4.2 amber-ring open note and the two Phase-2 limitation bullets it supersedes (render-only wires; amber ring divergence). Keep the still-true ones (control-flow/source nodes have no port rows, so drag-to-bind covers activity nodes only; simplified view edge-only; map-item wires deferred).

- [ ] **Step 2: MANUAL_TEST_PLAN.md**

Read the file's Part structure first. Update the Phase-2 canvas sections that said wires are not selectable/deletable, and add scenarios: drag-to-bind, incompatible drop, wire delete → Disconnected → revert (both surfaces: context menu + settings), connect summary, port-aware popover + Show all, identifier-port problems now in badge/drawer. Follow the existing numbered-scenario format exactly.

- [ ] **Step 3: FEATURE_DEMO_GUIDE.md + seeder**

Check whether any seeded demo's step text describes behavior this phase changed (wire deletability, badge counts on demo workflows with required identifier ports). If yes: edit the guide AND `scripts/seed-feature-demos.mjs` in the same commit, verifying byte-identical step text (the Phase-2 round-trip check: the seeder embeds `steps` arrays — diff them against the guide's). If the badge count on a seeded demo changes because identifier ports now count, update the demo doc text accordingly.

- [ ] **Step 4: AUTO_WIRE_DESIGN.md**

- Document `locked-unbound` in the resolution-status table/section (§2.1 area) with the §6.3 rationale.
- Mark the §11 follow-up "auto-pick on hover-extend" as implemented (points to PORT_WIRING §9).

- [ ] **Step 5: Verify + commit**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder && npx tsc --noEmit && cd ../../packages/graph-workflow && npx jest`
Expected: everything green at the final state.

```bash
git add docs-md/workflow-builder scripts/seed-feature-demos.mjs
git commit -m "docs(workflow-builder): port-wiring Phase 3 — gestures, delete semantics, kind-aware popover"
```

---

## Final review

After all tasks: dispatch the final code-reviewer subagent over the whole range (branch point = the commit before Task 1's). Then run the full local gates one last time: package Jest, frontend Vitest + `tsc --noEmit`, `npx playwright test tests/e2e/workflow-builder`. Do not push unless Alex asks.

## Self-review (spec coverage)

- §6.1 drag port→port → Tasks 2, 6. ✓
- §6.2 isValidConnection + highlight/dim + rejection tooltip + wildcard-accepts-any → Task 7. ✓
- §6.3 delete → pinned-unbound + `locked-unbound` resolver extension + last-wire hint → Tasks 1, 4. ✓
- §6.4 node-to-node narration popover with Fix deep-link → Task 8. ✓
- §7 wire context menu (Revert to automatic / Disconnect; View data deferred to Phase 4) → Task 5. ✓
- §9 kind-filtered/ranked popover + Show all + auto-pick wiring → Task 9. ✓
- §12 "Disconnected by you" vocabulary → Task 3. ✓
- §4.2/§15 amber-ring reconciliation (Alex: count as problems) → Task 3. ✓
- §14 testing: unit (wire writer, isValidConnection matrix, delete semantics, locked-unbound) → Tasks 1–7; e2e `tier2-port-wiring` → Task 10; docs → Task 11. ✓
- Out of scope, confirmed absent: §10 wire data peek, §11 conditions, schema changes, `__auto` renaming, T↔T[] wrapping.
