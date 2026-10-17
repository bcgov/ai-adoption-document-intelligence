# Port-Level Data Wires — Phases 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phases 1–2 of [PORT_WIRING_DESIGN.md](../../../docs-md/workflow-builder/PORT_WIRING_DESIGN.md): plain-language port vocabulary + resolver provenance (Phase 1), then per-port handles and canvas wires derived from data bindings, render-only (Phase 2).

**Architecture:** Presentation layer only — `GraphWorkflowConfig` (edges, `PortBinding`s, ctx blackboard) is untouched. A pure `deriveWires(config)` selector maps bindings → renderable port-to-port wires; activity nodes render one kind-colored handle per catalog port; existing control edges keep rendering for conditional/error/sequence cases. Gestures (drag-to-bind, wire deletion) are **Phase 3, NOT this plan** — data wires are non-deletable/non-interactive this phase, and today's node-to-node connect + auto-wire flow keeps working unchanged.

**Tech Stack:** React 18 + Mantine + @xyflow/react (React Flow), TypeScript. Package `packages/graph-workflow` (Jest, `npm test` from that dir). Frontend `apps/frontend` (Vitest, `npx vitest run <file>` from that dir). E2E Playwright from repo root: `npx playwright test tests/e2e/workflow-builder/specs/<file>` (deterministic tier-2 specs need frontend+backend up; see `docs-md/TESTING.md`).

---

## Context primer (read first — zero-context engineer)

Two layers exist and must not be confused:

1. **Edges** (`config.edges: GraphEdge[]`, `{id, source, target, type: "normal"|"conditional"|"error"}`) = execution order. No port info.
2. **Bindings** (`node.inputs/outputs: PortBinding[]`, `{port, ctxKey}`) = data flow through a shared ctx blackboard. Auto-wire (`resolveBindings` in `packages/graph-workflow/src/auto-wire/resolver.ts`) fills bindings from edge topology on every editor change; auto-synthesized ctx keys start with `__auto.`. User-pinned ports are listed in `node.metadata.lockedInputPorts`.

Port *types* live in the activity catalog (`packages/graph-workflow/src/catalog/`): every `ActivityCatalogEntry` has `inputs/outputs: PortDescriptor[]` (`{name, label, description?, required?, kind?: KindRef}`). **Every one of the 41 entries already declares `kind` on every port** (enforced by `catalog.test.ts:210`, US-103 invariant). `kind: "Artifact"` is the deliberate wildcard for identifier/scalar ports (e.g. `apimRequestId`); `shouldAutoWirePort` excludes it from kind-based auto-wire, but a separate exact-name-match pass binds `Artifact` ports (`resolve-input-port.ts:61-80`). Kind colors come from `ARTIFACT_REGISTRY` in `packages/graph-workflow/src/types/artifact-registry.ts` (Mantine color names: Document=blue, Segment=green, OcrResult=violet, Classification/ValidationResult=yellow, Reference=teal, Artifact=gray).

The canvas is `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (~2060 lines). Key seams:
- `NODE_TYPES` (~line 943): `activity → ActivityNodeRenderer` (~543-668), control-flow → `ControlFlowRectangleRenderer`, etc.
- `NodeHandles` (~437-537): today renders exactly ONE left target handle, ONE right source handle (`id="out"`), optional bottom `id="error"` handle. Per-side style from `computeHandleStyle` (`canvas/handle-style.ts`): a side with ≠1 typed port collapses to gray "Multiple inputs — select node to view all".
- `projectFlowNodes` (~1057) / `activityNodeSides` (~989): map config → ReactFlow nodes, computing per-side `HandleStyle` + pill entries from `getActivityCatalogEntry`.
- `projectFlowEdges` (~1140): maps `config.edges` → ReactFlow edges of type `"workflow-edge"` (`canvas/WorkflowEdge.tsx` — stroke/label per edge type, run-time active animation via `data.isActive`, patched by an effect at ~1567-1584 keyed by graph edge id).
- Auto-layout: `canvas/auto-layout.ts`, dagre with hard-coded `DEFAULT_NODE_WIDTH = 200` / `DEFAULT_NODE_HEIGHT = 80`.

After any change to `packages/graph-workflow`, rebuild it and **restart Vite** or the frontend sees stale catalog data (known gotcha, `MANUAL_TEST_PLAN.md §1.6`). Check `packages/graph-workflow/package.json` for its build script (`npm run build`).

**Commit style:** conventional commits, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Lefthook runs type-check/lint per workspace on staged files.

---

## File map (what this plan creates/modifies)

| File | Action | Responsibility |
|---|---|---|
| `packages/graph-workflow/src/catalog/catalog.test.ts` | modify | New invariant: every port has non-empty `label` + `description` |
| `packages/graph-workflow/src/catalog/activities/*.ts` | modify (only failures) | Fill missing port descriptions |
| `packages/graph-workflow/src/auto-wire/resolve-input-port.ts` (+ test) | modify | Add `via` provenance to `auto-bound` resolutions |
| `apps/frontend/src/features/workflow-builder/validation/auto-wire-validation.ts` (+ test) | modify | Plain-language drawer messages, port labels |
| `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx` | modify | Plain-language badges/buttons |
| `tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts` | modify | Updated copy assertions |
| `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts` (+ test) | **create** | Pure selector: config → `DerivedWire[]` |
| `apps/frontend/src/features/workflow-builder/canvas/port-rows.ts` (+ test) | **create** | Per-node port-row model + `estimateNodeHeight` |
| `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` (+ test) | **create** | Port-row UI (label + per-port `Handle`) |
| `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` | modify | Activity nodes use PortRows; wire projection from `deriveWires` |
| `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` (+ test) | modify | `data`/`sequence` wire variants (kind stroke, dashed, provenance) |
| `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts` (+ test) | modify | Per-node heights via `estimateNodeHeight` |
| `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.handle-style.test.tsx`, `WorkflowEditorCanvas.type-pill.test.tsx` | modify | Re-target activity-node assertions to port rows |
| `tests/e2e/workflow-builder/specs/tier2-typed-io.spec.ts` | rewrite | Per-port handles + derived-wire assertions |
| `docs-md/workflow-builder/MANUAL_TEST_PLAN.md`, `FEATURE_DEMO_GUIDE.md`, `PORT_WIRING_DESIGN.md` | modify | Fix stale claims; document new surfaces |

**Out of scope (deliberately):** drag-to-bind gestures, wire deletion semantics, `isValidConnection`, connect-summary popover (Phase 3); port rows on control-flow/source nodes (map `item` port etc. — follow-up slice; those nodes keep `NodeHandles`); `⚙︎` per-field parameter summaries beyond a count line; childWorkflow `inputMappings` wires.

---

# Part A — Phase 1: vocabulary, provenance, honest docs

### Task 1: Catalog port label/description invariant

**Files:**
- Modify: `packages/graph-workflow/src/catalog/catalog.test.ts`
- Modify (only if test finds gaps): files under `packages/graph-workflow/src/catalog/activities/`

- [ ] **Step 1: Write the failing (or passing) invariant test**

Append to the existing top-level describe in `catalog.test.ts`, next to the US-103 kind invariant (~line 136), following the existing `it.each(listActivityTypes())` style used at line 32:

```ts
describe("port copy invariant (port-wiring Phase 1)", () => {
  it.each(listActivityTypes())(
    "%s: every port declares a non-empty label and description",
    (activityType) => {
      const entry = getActivityCatalogEntry(activityType);
      expect(entry).toBeDefined();
      for (const port of [...entry!.inputs, ...entry!.outputs]) {
        // Labels/descriptions are the only strings the new canvas shows for a
        // port — the raw port name is demoted to tooltips (PORT_WIRING_DESIGN §12).
        expect(port.label?.trim() ?? "").not.toEqual("");
        expect(port.description?.trim() ?? "").not.toEqual("");
      }
    },
  );
});
```

- [ ] **Step 2: Run it**

Run: `cd packages/graph-workflow && npx jest catalog.test.ts`
Expected: PASS, or FAIL listing specific activity/ports missing `description`.

- [ ] **Step 3: Fill any gaps**

For each failing port, add a one-sentence user-facing `description` to its entry file (e.g. in `activities/azure-ocr-poll.ts`: `description: "The request ID returned by the OCR submit step."`). Write for a business user: say what the value *is*, not how it's implemented.

- [ ] **Step 4: Re-run to green**

Run: `cd packages/graph-workflow && npx jest catalog.test.ts`
Expected: PASS (41 × it.each green).

- [ ] **Step 5: Commit**

```bash
git add packages/graph-workflow/src/catalog
git commit -m "test(catalog): enforce non-empty label+description on every port"
```

### Task 2: Resolver provenance — `via` on auto-bound resolutions

The canvas wire tooltips (Task 8) must explain *how* a port was bound. `PortResolution` (`resolve-input-port.ts:9-16`) currently doesn't say.

**Files:**
- Modify: `packages/graph-workflow/src/auto-wire/resolve-input-port.ts`
- Modify: `packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts` (+ any other test asserting `toEqual({status: "auto-bound", ...})` — run the suite to find them: `resolver.test.ts`, `resolver-map.test.ts`, `resolver-join.test.ts` are likely)

- [ ] **Step 1: Write failing tests for the three provenance values**

In `resolve-input-port.test.ts`, using the existing `makeConfig`/`activity` factories (lines 5-34):

```ts
describe("provenance (via)", () => {
  it("reports 'nearest-kind' for a kind-matched bind", () => {
    const cfg = makeConfig(
      { A: activity("A", "file.prepare"), B: activity("B", "azureOcr.submit") },
      [{ source: "A", target: "B" }],
    );
    expect(resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }))
      .toEqual({
        status: "auto-bound", producerNodeId: "A", producerPort: "preparedData",
        via: "nearest-kind",
      });
  });

  it("reports 'name-match' for an Artifact identifier bind", () => {
    const cfg = makeConfig(
      { S: activity("S", "azureOcr.submit"), P: activity("P", "azureOcr.poll") },
      [{ source: "S", target: "P" }],
    );
    expect(resolveInputPort(cfg, "P", { name: "apimRequestId", kind: "Artifact" }))
      .toEqual({
        status: "auto-bound", producerNodeId: "S", producerPort: "apimRequestId",
        via: "name-match",
      });
  });
});
```

Also add a `via: "map-item"` case if the existing map-synthetic test fixtures make one easy (see `resolver-map.test.ts` for a fixture to copy); otherwise assert it inside the existing map-synthetic test by extending its expected object.

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/graph-workflow && npx jest resolve-input-port.test.ts`
Expected: FAIL — received objects lack `via`.

- [ ] **Step 3: Implement**

In `resolve-input-port.ts`, change the `auto-bound` variant and stamp each bind site:

```ts
export type AutoBoundVia = "nearest-kind" | "name-match" | "map-item";

export type PortResolution =
  | { status: "auto-bound"; producerNodeId: string; producerPort: string; via: AutoBoundVia }
  | { status: "ambiguous"; candidates: { producerNodeId: string; producerPort: string }[] }
  | { status: "unsatisfied" }
  | { status: "locked"; ctxKey: string };
```

Bind sites (resolution order per the file): Artifact unique-name pass (~lines 61-80) → `via: "name-match"`; map synthetic-producer pass (~103-115) → `via: "map-item"`; nearest-distance pick (~121-129) → `via: "nearest-kind"`; same-name tiebreak (~131-149) → `via: "name-match"` (the name is what disambiguated).

- [ ] **Step 4: Run the whole auto-wire suite; fix broken `toEqual`s**

Run: `cd packages/graph-workflow && npx jest src/auto-wire`
Expected: new tests PASS; pre-existing tests asserting exact `auto-bound` objects FAIL until you add the correct `via` to each expected object (do NOT loosen them to `toMatchObject` — the exact-shape style is deliberate). Then: full package `npm test` green.

- [ ] **Step 5: Verify no frontend consumer breaks**

Run: `grep -rn "auto-bound" apps/frontend/src --include="*.ts*" -l` — consumers switch on `status` only (`InputsSection.tsx`, `auto-wire-status.ts`); adding a field is additive. Run `cd apps/frontend && npx vitest run` to confirm.

- [ ] **Step 6: Commit**

```bash
git add packages/graph-workflow
git commit -m "feat(auto-wire): record binding provenance (via) on auto-bound resolutions"
```

### Task 3: Plain-language port-state vocabulary

Implements PORT_WIRING_DESIGN §12. Exact old→new strings:

| Surface | Old | New |
|---|---|---|
| `InputsSection.tsx` ~262 (auto badge) | `auto` | `Auto` + Mantine `Tooltip` label `Connected automatically` |
| `InputsSection.tsx` ~265 (button) | `Override` | `Change source` |
| `InputsSection.tsx` ~277 (ambiguous button) | `Choose source` | `Pick a source` + Tooltip `Multiple possible sources` |
| `InputsSection.tsx` ~216 (modal title) | `Choose source` | `Choose a source` |
| `InputsSection.tsx` ~288 (unsatisfied button) | `Needs source` | `Needs a source` + Tooltip `Choose where this comes from` |
| `InputsSection.tsx` ~296 (locked badge) | `locked` | `Pinned` + Tooltip `Pinned by you` |
| `InputsSection.tsx` ~299 (button) | `Revert to auto` | `Revert to automatic` |
| `auto-wire-validation.ts` ~37 | `Input "${port}" has an ambiguous source — pick a producer` | `Input "${label}" has multiple possible sources — pick one` |
| `auto-wire-validation.ts` ~38 | `Input "${port}" needs a source` | `Input "${label}" needs a source — choose where it comes from` |

`${label}` = the catalog `PortDescriptor.label` for that port, falling back to the port name. `computeNodeInputIssues` (`auto-wire-status.ts` ~30-66) already iterates catalog input descriptors — extend the issue objects it emits with `label: port.label ?? port.name` and use that in `autoWireIssuesToValidationErrors`. The validation `path` (`nodes.<id>.inputs.<port>`) keeps the raw port **name** — deep-links depend on it.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/validation/auto-wire-validation.ts` and its unit spec (find it: `grep -rln "autoWireIssuesToValidationErrors" apps/frontend/src --include="*.test.*"`)
- Modify: `apps/frontend/src/features/workflow-builder/validation/auto-wire-status.ts` (or wherever `computeNodeInputIssues` lives — confirm via grep)
- Modify: `tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts`

- [ ] **Step 1: Update the auto-wire-validation unit spec expectations to the new message strings (table above); run it — FAIL.**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/validation`

- [ ] **Step 2: Implement** — extend `computeNodeInputIssues` issues with `label`; rewrite the two template strings in `auto-wire-validation.ts`.

- [ ] **Step 3: Run — PASS.** Same command.

- [ ] **Step 4: Apply the `InputsSection.tsx` string changes** (table above). Wrap each badge/button in Mantine `<Tooltip label="…">` where the table specifies one (imports already available in the file — check; add `Tooltip` to the `@mantine/core` import if not).

- [ ] **Step 5: Update e2e copy assertions in `tier2-autowire.spec.ts`:**

Every `getByRole("button", { name: … })` / text assertion using an old string flips to the new one: `Override`→`Change source`, `Needs source`→`Needs a source`, `Choose source` (button)→`Pick a source`, `Revert to auto`→`Revert to automatic`, badge text `auto`→`Auto`, `locked`→`Pinned`. The dialog-title assertion (if any) becomes `Choose a source`.

- [ ] **Step 6: Run the e2e spec** (needs frontend+backend up — `docs-md/TESTING.md`):

Run: `npx playwright test tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts`
Expected: 6/6 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts
git commit -m "feat(workflow-builder): plain-language port-state vocabulary"
```

### Task 4: Fix stale docs claims

Exploration falsified two documented claims; per project convention docs must be corrected with the feature work.

**Files:**
- Modify: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` §1.6
- Modify: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` §8
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` (only if it repeats the "5 typed activities" claim — grep)

- [ ] **Step 1:** In MANUAL_TEST_PLAN §1.6, replace the bullet "Only **5 catalog activities carry typed kinds** today: …" with: "**Every catalog activity declares `kind` on every port** (US-103 invariant). Gray handles mean either the deliberate `Artifact` wildcard (identifier/scalar ports, the whole `benchmark.*` family) or a side with ≥2 typed ports collapsing to the multi-port gray handle."

- [ ] **Step 2:** In PORT_WIRING_DESIGN §8, replace the first sentence's premise ("Only 5 activities carry typed kinds today…") with a note that kind coverage already exists catalog-wide (US-103) and that §8's remaining scope is: the label/description invariant (Task 1), `parametersSchema` field titles (deferred to the phase that renders per-field `⚙︎` summaries), and the identifier-kinds open question (unchanged).

- [ ] **Step 3:** Update the memory/tracker doc if the executor maintains one, run `grep -rn "5 catalog activities\|5 typed" docs-md/` to catch stragglers, then commit:

```bash
git add docs-md
git commit -m "docs(workflow-builder): correct stale typed-kind coverage claims"
```

---

# Part B — Phase 2: per-port handles + derived wires (render-only)

### Task 5: `deriveWires` — pure selector from config to wires

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts`
- Create: `apps/frontend/src/features/workflow-builder/canvas/derive-wires.test.ts`

Semantics (PORT_WIRING_DESIGN §5): one **data wire** per consumer input binding whose ctx key some producer writes; `conditional`/`error` edges pass through; a `normal` edge with no data wire between the pair becomes a **sequence** wire; a data wire renders even without a connecting edge.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { deriveWires } from "./derive-wires";

/** Minimal activity node with explicit bindings. */
function node(
  id: string,
  activityType: string,
  io: { inputs?: { port: string; ctxKey: string }[]; outputs?: { port: string; ctxKey: string }[] },
  metadata?: Record<string, unknown>,
) {
  return { id, type: "activity" as const, activityType, label: id, ...io, metadata };
}

function config(nodes: Record<string, unknown>, edges: { id?: string; source: string; target: string; type?: string }[]): GraphWorkflowConfig {
  return {
    schemaVersion: 1,
    entryNodeId: Object.keys(nodes)[0],
    nodes,
    edges: edges.map((e, i) => ({ id: e.id ?? `e${i}`, type: "normal", ...e })),
    ctx: {},
  } as unknown as GraphWorkflowConfig;
}

describe("deriveWires", () => {
  it("derives a data wire from a shared ctx key, with kind + edgeId", () => {
    const cfg = config(
      {
        prep: node("prep", "file.prepare", { outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }] }),
        submit: node("submit", "azureOcr.submit", { inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }] }),
      },
      [{ id: "e-ps", source: "prep", target: "submit" }],
    );
    const wires = deriveWires(cfg);
    expect(wires).toContainEqual(
      expect.objectContaining({
        variant: "data", source: "prep", sourcePort: "preparedData",
        target: "submit", targetPort: "fileData",
        kind: "Document",            // from file.prepare's preparedData descriptor
        auto: true, pinned: false, edgeId: "e-ps",
      }),
    );
    // the normal edge is represented by the data wire — no sequence wire for the pair
    expect(wires.filter((w) => w.variant === "sequence")).toHaveLength(0);
  });

  it("classifies a pinned wire from lockedInputPorts and a non-__auto key", () => {
    const cfg = config(
      {
        prep: node("prep", "file.prepare", { outputs: [{ port: "preparedData", ctxKey: "myDoc" }] }),
        submit: node("submit", "azureOcr.submit",
          { inputs: [{ port: "fileData", ctxKey: "myDoc" }] },
          { lockedInputPorts: ["fileData"] }),
      },
      [{ source: "prep", target: "submit" }],
    );
    const wire = deriveWires(cfg).find((w) => w.variant === "data");
    expect(wire).toMatchObject({ pinned: true, auto: false });
  });

  it("emits a sequence wire for a normal edge with no bindings riding it", () => {
    const cfg = config(
      { a: node("a", "ocr.cleanup", {}), b: node("b", "ocr.cleanup", {}) },
      [{ id: "e-ab", source: "a", target: "b" }],
    );
    expect(deriveWires(cfg)).toEqual([
      expect.objectContaining({ variant: "sequence", id: "e-ab" }),
    ]);
  });

  it("passes conditional and error edges through untouched", () => {
    const cfg = config(
      { s: { id: "s", type: "switch", label: "s", cases: [] }, a: node("a", "ocr.cleanup", {}) },
      [{ id: "e-cond", source: "s", target: "a", type: "conditional" }],
    );
    expect(deriveWires(cfg)).toEqual([
      expect.objectContaining({ variant: "conditional", id: "e-cond" }),
    ]);
  });

  it("derives a data wire even when no edge connects the pair (validator's job to flag)", () => {
    const cfg = config(
      {
        prep: node("prep", "file.prepare", { outputs: [{ port: "preparedData", ctxKey: "k" }] }),
        submit: node("submit", "azureOcr.submit", { inputs: [{ port: "fileData", ctxKey: "k" }] }),
      },
      [],
    );
    const wire = deriveWires(cfg).find((w) => w.variant === "data");
    expect(wire).toMatchObject({ source: "prep", target: "submit", edgeId: undefined });
  });

  it("does not wire a binding to a ctx declaration (workflow variable)", () => {
    const cfg = config(
      { submit: node("submit", "azureOcr.submit", { inputs: [{ port: "fileData", ctxKey: "docFromInput" }] }) },
      [],
    );
    (cfg as { ctx: Record<string, unknown> }).ctx = { docFromInput: { type: "object" } };
    expect(deriveWires(cfg).filter((w) => w.variant === "data")).toHaveLength(0);
  });

  it("wires from a source.upload node's emitted ctx key with kind Document", () => {
    const cfg = config(
      {
        up: { id: "up", type: "source", sourceType: "source.upload", label: "Upload", parameters: { ctxKey: "documentUrl" } },
        prep: node("prep", "file.prepare", { inputs: [{ port: "blobKey", ctxKey: "documentUrl" }] }),
      },
      [{ id: "e-up", source: "up", target: "prep" }],
    );
    expect(deriveWires(cfg)).toContainEqual(
      expect.objectContaining({
        variant: "data", source: "up", sourcePort: "documentUrl",
        target: "prep", targetPort: "blobKey", kind: "Document", edgeId: "e-up",
      }),
    );
  });
});
```

> The source-node config shape above (`sourceType`, `parameters.ctxKey`) must match the real one — before implementing, read `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts`, which already resolves source-node producers by ctx key with the correct precedence, and mirror its field access exactly. If the real shape differs, fix the test fixture, not the production shape.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/derive-wires.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `derive-wires.ts`**

```ts
import {
  getActivityCatalogEntry,
  resolveInputPort,
  type GraphEdge,
  type GraphWorkflowConfig,
  type KindRef,
} from "@ai-di/graph-workflow";

const AUTO_PREFIX = "__auto.";

export interface DataWire {
  variant: "data";
  /** Stable id, distinct from edge ids: `wire:<target>:<targetPort>`. */
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  /** Producer port kind (falls back to consumer expected kind) — drives stroke colour. */
  kind?: KindRef;
  /** Consumer port is user-locked (metadata.lockedInputPorts). */
  pinned: boolean;
  /** Binding uses an auto-synthesised ctx key. */
  auto: boolean;
  /** Auto-wire provenance for the tooltip; undefined when pinned/hand-authored. */
  via?: "nearest-kind" | "name-match" | "map-item";
  /** The normal edge between the pair, if one exists (run-status animation target). */
  edgeId?: string;
  ctxKey: string;
}

export interface StructuralWire {
  variant: "sequence" | "conditional" | "error";
  id: string; // underlying edge id
  edge: GraphEdge;
}

export type DerivedWire = DataWire | StructuralWire;

interface ProducerRef {
  nodeId: string;
  port: string;
  kind?: KindRef;
}

/** ctxKey → producer, from activity/pollUntil outputs[] and source-node emissions. */
function buildProducerIndex(config: GraphWorkflowConfig): Map<string, ProducerRef> {
  const index = new Map<string, ProducerRef>();
  for (const node of Object.values(config.nodes)) {
    const n = node as Record<string, unknown>;
    // Activity-shaped nodes: outputs[] + catalog kinds.
    const outputs = n.outputs as { port: string; ctxKey: string }[] | undefined;
    if (outputs) {
      const activityType = n.activityType as string | undefined;
      const entry = activityType ? getActivityCatalogEntry(activityType) : undefined;
      for (const out of outputs) {
        const descriptor = entry?.outputs.find((p) => p.name === out.port);
        index.set(out.ctxKey, { nodeId: node.id, port: out.port, kind: descriptor?.kind });
      }
    }
    // Source nodes emit ctx keys directly. MIRROR resolve-producer-kind.ts's
    // source branch here (upload → parameters.ctxKey as Document; api → one
    // entry per declared field, kind = field.kind).
    if (n.type === "source") {
      for (const emitted of sourceEmissions(n)) {
        index.set(emitted.ctxKey, { nodeId: node.id, port: emitted.ctxKey, kind: emitted.kind });
      }
    }
  }
  return index;
}

export function deriveWires(config: GraphWorkflowConfig): DerivedWire[] {
  const producers = buildProducerIndex(config);
  const wires: DerivedWire[] = [];
  const pairsWithData = new Set<string>();

  for (const node of Object.values(config.nodes)) {
    const n = node as Record<string, unknown>;
    const inputs = n.inputs as { port: string; ctxKey: string }[] | undefined;
    if (!inputs) continue;
    const locked = new Set(
      ((n.metadata as { lockedInputPorts?: string[] } | undefined)?.lockedInputPorts) ?? [],
    );
    const activityType = n.activityType as string | undefined;
    const entry = activityType ? getActivityCatalogEntry(activityType) : undefined;

    for (const binding of inputs) {
      const producer = producers.get(binding.ctxKey);
      if (!producer || producer.nodeId === node.id) continue; // ctx var / self → no wire
      const descriptor = entry?.inputs.find((p) => p.name === binding.port);
      const auto = binding.ctxKey.startsWith(AUTO_PREFIX);
      const pinned = locked.has(binding.port);
      let via: DataWire["via"];
      if (auto && !pinned && descriptor) {
        const res = resolveInputPort(config, node.id, { name: descriptor.name, kind: descriptor.kind });
        if (res.status === "auto-bound") via = res.via;
      }
      wires.push({
        variant: "data",
        id: `wire:${node.id}:${binding.port}`,
        source: producer.nodeId,
        sourcePort: producer.port,
        target: node.id,
        targetPort: binding.port,
        kind: producer.kind ?? descriptor?.kind,
        pinned,
        auto,
        via,
        edgeId: undefined, // stamped below
        ctxKey: binding.ctxKey,
      });
      pairsWithData.add(`${producer.nodeId}→${node.id}`);
    }
  }

  for (const edge of config.edges) {
    if (edge.type === "conditional" || edge.type === "error") {
      wires.push({ variant: edge.type, id: edge.id, edge });
      continue;
    }
    const pairKey = `${edge.source}→${edge.target}`;
    if (pairsWithData.has(pairKey)) {
      for (const w of wires) {
        if (w.variant === "data" && w.source === edge.source && w.target === edge.target) {
          w.edgeId = edge.id;
        }
      }
    } else {
      wires.push({ variant: "sequence", id: edge.id, edge });
    }
  }
  return wires;
}
```

Write `sourceEmissions(n)` by copying the exact field access from `resolve-producer-kind.ts`'s source-node branch (do not invent a shape). Fix any type friction against the real `GraphWorkflowConfig` node union — prefer narrowing helpers over `any` (project rule: no `any`).

- [ ] **Step 4: Run to green**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/derive-wires.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas/derive-wires.*
git commit -m "feat(workflow-builder): derive port-to-port wires from data bindings"
```

### Task 6: Port-row model + node height estimation

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/port-rows.ts`
- Create: `apps/frontend/src/features/workflow-builder/canvas/port-rows.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { computePortRows, estimateNodeHeight, PORT_ROW_HEIGHT, NODE_BASE_HEIGHT } from "./port-rows";
// reuse the node()/config() fixtures from derive-wires.test.ts (extract them
// into a local test helper file canvas/__test-utils__/config-fixtures.ts and
// import from both specs — do not copy-paste twice)

describe("computePortRows", () => {
  it("maps catalog inputs/outputs to rows with handle ids and labels", () => {
    const cfg = config({ submit: node("submit", "azureOcr.submit", {}) }, []);
    const rows = computePortRows(cfg, "submit", []);
    expect(rows.inputs).toEqual([
      expect.objectContaining({
        name: "fileData", handleId: "in-fileData", direction: "input",
        kind: "Document", required: true, bound: false, needsSource: true,
        label: expect.stringMatching(/\S/),
      }),
    ]);
    expect(rows.outputs.map((r) => r.handleId)).toEqual(
      expect.arrayContaining(["out-apimRequestId"]),
    );
  });

  it("marks a port bound when a wire targets it, and satisfied via ctx chip", () => {
    const cfg = config({ submit: node("submit", "azureOcr.submit", { inputs: [{ port: "fileData", ctxKey: "docVar" }] }) }, []);
    (cfg as { ctx: Record<string, unknown> }).ctx = { docVar: { type: "object" } };
    const rows = computePortRows(cfg, "submit", []);
    expect(rows.inputs[0]).toMatchObject({ bound: true, fromCtx: "docVar", needsSource: false });
  });

  it("marks bound=true when a derived wire targets the port", () => {
    const cfg = config({ submit: node("submit", "azureOcr.submit", {}) }, []);
    const wires = [{ variant: "data", target: "submit", targetPort: "fileData" }] as never[];
    const rows = computePortRows(cfg, "submit", wires);
    expect(rows.inputs[0]).toMatchObject({ bound: true, needsSource: false });
  });
});

describe("estimateNodeHeight", () => {
  it("grows with max(inputs, outputs) rows", () => {
    const cfg = config({ extract: node("extract", "azureOcr.extract", {}) }, []); // 5 in / 1 out
    expect(estimateNodeHeight(cfg, "extract")).toBe(NODE_BASE_HEIGHT + 5 * PORT_ROW_HEIGHT);
  });
  it("falls back to base height for non-activity nodes", () => {
    const cfg = config({ s: { id: "s", type: "switch", label: "s", cases: [] } }, []);
    expect(estimateNodeHeight(cfg, "s")).toBe(NODE_BASE_HEIGHT);
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing).**

- [ ] **Step 3: Implement `port-rows.ts`**

```ts
import { getActivityCatalogEntry, type GraphWorkflowConfig, type KindRef } from "@ai-di/graph-workflow";
import type { DerivedWire } from "./derive-wires";

export const PORT_ROW_HEIGHT = 22;
export const NODE_BASE_HEIGHT = 64; // header + label + padding

export interface PortRowModel {
  name: string;
  label: string;
  description?: string;
  kind?: KindRef;
  direction: "input" | "output";
  required: boolean;
  /** ReactFlow handle id: `in-<name>` / `out-<name>`. */
  handleId: string;
  /** Input only: satisfied by a wire, a ctx variable, or a locked binding. */
  bound: boolean;
  /** Set when the binding reads a declared workflow variable (renders a chip). */
  fromCtx?: string;
  /** required && !bound — renders the amber ring. */
  needsSource: boolean;
}

export function computePortRows(
  config: GraphWorkflowConfig,
  nodeId: string,
  wires: readonly DerivedWire[],
): { inputs: PortRowModel[]; outputs: PortRowModel[] } {
  const node = config.nodes[nodeId] as Record<string, unknown> | undefined;
  const activityType = node?.activityType as string | undefined;
  const entry = activityType ? getActivityCatalogEntry(activityType) : undefined;
  if (!node || !entry) return { inputs: [], outputs: [] };

  const bindings = (node.inputs as { port: string; ctxKey: string }[] | undefined) ?? [];
  const wiredPorts = new Set(
    wires.filter((w) => w.variant === "data" && w.target === nodeId).map((w) => (w as { targetPort: string }).targetPort),
  );

  const inputs = entry.inputs.map((p): PortRowModel => {
    const binding = bindings.find((b) => b.port === p.name);
    const fromCtx =
      binding && config.ctx && binding.ctxKey in config.ctx && !wiredPorts.has(p.name)
        ? binding.ctxKey
        : undefined;
    const bound = wiredPorts.has(p.name) || fromCtx !== undefined || binding !== undefined;
    return {
      name: p.name, label: p.label, description: p.description, kind: p.kind,
      direction: "input", required: p.required === true,
      handleId: `in-${p.name}`, bound, fromCtx,
      needsSource: p.required === true && !bound,
    };
  });

  const outputs = entry.outputs.map((p): PortRowModel => ({
    name: p.name, label: p.label, description: p.description, kind: p.kind,
    direction: "output", required: p.required === true,
    handleId: `out-${p.name}`, bound: true, needsSource: false,
  }));

  return { inputs, outputs };
}

export function estimateNodeHeight(config: GraphWorkflowConfig, nodeId: string): number {
  const { inputs, outputs } = computePortRows(config, nodeId, []);
  const rows = Math.max(inputs.length, outputs.length);
  return NODE_BASE_HEIGHT + rows * PORT_ROW_HEIGHT;
}
```

- [ ] **Step 4: Run to green; commit**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/port-rows.test.ts`

```bash
git add apps/frontend/src/features/workflow-builder/canvas
git commit -m "feat(workflow-builder): per-node port-row model + height estimation"
```

### Task 7: PortRows component + ActivityNodeRenderer integration

Activity nodes swap the single-handle `NodeHandles` for per-port rows. **Keep** on the activity card: a neutral node-level target handle (top-left, no id — existing edges and today's connect gesture attach here), the `id="out"` source handle (top-right — hover-to-extend + conditional stamping unchanged), and the bottom `id="error"` handle. Control-flow/source nodes keep `NodeHandles` untouched. `NodeTypePillRow` disappears from activity nodes (rows supersede it).

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx`
- Create: `apps/frontend/src/features/workflow-builder/canvas/PortRows.test.tsx`
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`ActivityNodeRenderer` ~543-668, `ActivityNodeData` ~187-195, `projectFlowNodes`/`activityNodeSides` ~989-1138)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.handle-style.test.tsx`, `WorkflowEditorCanvas.type-pill.test.tsx`

- [ ] **Step 1: Write the failing component test** (`PortRows.test.tsx`) — follow the mock pattern of `WorkflowEditorCanvas.handle-style.test.tsx` (lines ~144-218): mock `@xyflow/react` `Handle` as `<div data-testid={`handle-${type}-${position}`} data-handleid={id} style={style} />`, wrap render in `<MantineProvider>`:

```tsx
it("renders one row per port with a handle, kind colour and label", () => {
  const rows = {
    inputs: [{ name: "fileData", label: "Prepared file data", kind: "Document", direction: "input", required: true, handleId: "in-fileData", bound: false, needsSource: true }],
    outputs: [{ name: "apimRequestId", label: "OCR request ID", kind: "Artifact", direction: "output", required: true, handleId: "out-apimRequestId", bound: true, needsSource: false }],
  };
  render(<MantineProvider><PortRows nodeId="submit" inputs={rows.inputs} outputs={rows.outputs} /></MantineProvider>);
  const inputRow = screen.getByTestId("port-row-submit-in-fileData");
  expect(inputRow).toHaveAttribute("data-port-kind", "Document");
  expect(inputRow).toHaveAttribute("data-needs-source", "true");
  expect(inputRow).toHaveTextContent("Prepared file data");
  expect(screen.getByTestId("port-row-submit-out-apimRequestId")).toHaveTextContent("OCR request ID");
  // per-port handles exist with the right ids
  expect(screen.getAllByTestId(/handle-target/).map((h) => h.getAttribute("data-handleid"))).toContain("in-fileData");
});
```

- [ ] **Step 2: Run — FAIL. Implement `PortRows.tsx`:**

```tsx
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Tooltip } from "@mantine/core";
import { getArtifactKindMeta } from "@ai-di/graph-workflow";
import { splitKindRef } from "./artifact-kind-colour";
import type { PortRowModel } from "./port-rows";

const ROW_STYLE: React.CSSProperties = {
  position: "relative", display: "flex", alignItems: "center",
  height: 22, fontSize: 11, color: "var(--mantine-color-dimmed, #6b7280)",
};

function portColor(kind: PortRowModel["kind"]): string {
  if (!kind) return "var(--mantine-color-gray-5)";
  const { baseKind } = splitKindRef(kind);
  const meta = getArtifactKindMeta(baseKind);
  return `var(--mantine-color-${meta?.color ?? "gray"}-6)`;
}

function Row({ nodeId, row }: { nodeId: string; row: PortRowModel }) {
  const isInput = row.direction === "input";
  const tooltip = `${row.name}: ${row.kind ?? "Artifact"}${row.description ? ` — ${row.description}` : ""}`;
  const ring = row.needsSource
    ? { boxShadow: "0 0 0 3px var(--mantine-color-yellow-4)" }
    : undefined;
  const isArray = row.kind?.endsWith("[]") ?? false;
  return (
    <div
      data-testid={`port-row-${nodeId}-${row.handleId}`}
      data-port-kind={row.kind ?? ""}
      data-needs-source={row.needsSource ? "true" : "false"}
      data-from-ctx={row.fromCtx ?? ""}
      style={{ ...ROW_STYLE, justifyContent: isInput ? "flex-start" : "flex-end" }}
    >
      <Tooltip label={tooltip} withArrow position={isInput ? "left" : "right"}>
        <Handle
          id={row.handleId}
          type={isInput ? "target" : "source"}
          position={isInput ? Position.Left : Position.Right}
          style={{
            position: "absolute", top: "50%",
            [isInput ? "left" : "right"]: -19, // outside the card padding
            background: portColor(row.kind),
            ...(isArray ? { outline: `2px solid ${portColor(row.kind)}`, outlineOffset: 2 } : {}),
            ...ring,
          }}
        />
      </Tooltip>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.label}
        {row.fromCtx ? <em style={{ marginLeft: 4 }}>· from {row.fromCtx}</em> : null}
      </span>
    </div>
  );
}

export const PortRows = memo(function PortRows({
  nodeId, inputs, outputs,
}: { nodeId: string; inputs: PortRowModel[]; outputs: PortRowModel[] }) {
  if (inputs.length === 0 && outputs.length === 0) return null;
  return (
    <div data-testid={`port-rows-${nodeId}`} style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 12 }}>
      <div>{inputs.map((r) => <Row key={r.handleId} nodeId={nodeId} row={r} />)}</div>
      <div>{outputs.map((r) => <Row key={r.handleId} nodeId={nodeId} row={r} />)}</div>
    </div>
  );
});
```

(Exact pixel offsets will need eyeballing in the browser — see Step 6.)

- [ ] **Step 3: Integrate into `WorkflowEditorCanvas.tsx`:**

1. `ActivityNodeData` gains `portRows: { inputs: PortRowModel[]; outputs: PortRowModel[] }`.
2. In `projectFlowNodes`, compute `const wires = deriveWires(config)` ONCE before the node loop; for each activity node set `portRows: computePortRows(config, node.id, wires)`. Keep `inputHandleStyle`/`outputHandleStyle`/pill entries for control-flow/source nodes only (`activityNodeSides` no longer needed for activity nodes — delete its call for them, keep `controlFlowNodeSides`).
3. In `ActivityNodeRenderer`, replace `<NodeHandles …/>` with:

```tsx
<>
  {/* node-level flow handles — existing edges + connect gesture attach here */}
  <Handle type="target" position={Position.Left} style={{ top: 18, background: "var(--mantine-color-gray-5)" }} />
  <Handle id="out" type="source" position={Position.Right} style={{ top: 18, background: "var(--mantine-color-gray-5)" }}
    onMouseEnter={/* keep the existing hover-extend enter/leave wiring from NodeHandles */}
    onMouseLeave={…} />
  {data.errorPolicy?.onError === "fallback" && (
    <Handle id="error" type="source" position={Position.Bottom} style={{ background: ERROR_HANDLE_BACKGROUND }} />
  )}
  <PortRows nodeId={id} inputs={data.portRows.inputs} outputs={data.portRows.outputs} />
</>
```

Move the hover-extend `handleEnter`/`handleLeave` logic (currently inside `NodeHandles`) up into `ActivityNodeRenderer` (it only needs `nodeId` + the two callbacks). `NodeHandles` remains, used by control-flow/source renderers only. `NodeTypePillRow` is no longer rendered for activity nodes.

- [ ] **Step 4: Rewrite the affected unit tests.** In `WorkflowEditorCanvas.handle-style.test.tsx` and `WorkflowEditorCanvas.type-pill.test.tsx`: assertions against `port-tooltip-input-<id>` / `node-type-pill-row` **for activity nodes** re-target `port-row-<id>-in-<port>` / `port-rows-<id>` with `data-port-kind` (the synthetic `test.split` / `test.classify-multi` / `test.untyped` catalog mocks stay — the multi-port case now asserts N rows instead of gray collapse). Keep the old assertions wherever they exercise control-flow/source nodes.

- [ ] **Step 5: Run the full canvas unit suite to green:**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas`

- [ ] **Step 6: Eyeball in the browser.** Stack up (`Dev: all` task), invoke the `app-browser-auth` skill, open the Part-7 demo (`/workflows/by-slug/demo-typed-i-o-coloured-handles-type-pills-part-7/edit`), screenshot: port rows visible, handles aligned with rows, amber rings only on genuinely unbound required inputs, edges still attach at the top flow handles. Fix offsets as needed.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas
git commit -m "feat(workflow-builder): per-port handles on activity nodes"
```

### Task 8: Wire projection + WorkflowEdge variants

Replace `projectFlowEdges(config.edges, config)` with a projection over `deriveWires(config)`.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (~1140-1160 projection; ~1546-1550 setInternalEdges; ~1567-1584 active-edge effect)
- Modify: `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` + `WorkflowEdge.test.tsx`

- [ ] **Step 1: Write failing WorkflowEdge unit tests** (extend `WorkflowEdge.test.tsx`, following its existing render pattern):

```tsx
it("renders a data wire with kind colour, provenance attrs, no label", () => {
  // data: { wire: { variant: "data", kind: "Document", auto: true, via: "nearest-kind", pinned: false, … } }
  // assert: path stroke = Document colour; data-wire-variant="data";
  // data-provenance="auto:nearest-kind"; no edge-label element
});
it("renders a sequence wire dashed gray", () => {
  // data: { wire: { variant: "sequence", … } } → strokeDasharray "6 4", gray stroke
});
it("renders a pinned wire with data-provenance='pinned'", () => {…});
```

Provenance → human tooltip text mapping (put it in `WorkflowEdge.tsx` as an exported pure fn so it's unit-testable):

```ts
export function wireTooltip(wire: DataWire): string {
  if (wire.pinned) return "Pinned by you";
  if (wire.via === "name-match") return `Connected automatically — matched by name "${wire.targetPort}"`;
  if (wire.via === "map-item") return "Connected automatically — item from the loop";
  if (wire.auto) return `Connected automatically — nearest ${wire.kind ?? "compatible"} producer`;
  return `Connected — via ${wire.ctxKey}`;
}
```

- [ ] **Step 2: Implement in `WorkflowEdge.tsx`.** Extend the edge `data` to carry `wire?: DerivedWire`; `resolveStyle` gains: `data` variant → stroke `colorForKind(wire.kind)` (from `canvas/artifact-kind-colour.ts`), no label; `sequence` → `#9ca3af` + `strokeDasharray: "6 4"`, no label; `conditional`/`error` unchanged (they still receive `graphEdge`). Emit `data-wire-variant` and `data-provenance` (`pinned` / `auto:<via>` / `manual`) plus a `<title>{wireTooltip(wire)}</title>` child for native hover. Keep the run-time `isActive` blue override with priority over all variants.

- [ ] **Step 3: Rewrite `projectFlowEdges` in `WorkflowEditorCanvas.tsx`:**

```ts
function projectFlowWires(config: GraphWorkflowConfig): Edge[] {
  return deriveWires(config).map((w) => {
    if (w.variant === "data") {
      return {
        id: w.id,
        source: w.source, sourceHandle: `out-${w.sourcePort}`,
        target: w.target, targetHandle: `in-${w.targetPort}`,
        type: "workflow-edge",
        data: { wire: w },
        deletable: false, selectable: false, // gestures are Phase 3
        style: { stroke: colorForKind(w.kind), strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: colorForKind(w.kind) },
      };
    }
    const stroke = getEdgeStrokeColor(w.edge.type);
    return {
      id: w.id, source: w.edge.source, sourceHandle: w.variant === "error" ? "error" : "out",
      target: w.edge.target, targetHandle: null,
      type: "workflow-edge",
      data: { wire: w, graphEdge: w.edge, sourceSwitch: /* keep existing lookup */ },
      style: { stroke, strokeWidth: 2, ...(w.variant === "sequence" ? { strokeDasharray: "6 4" } : {}) },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    };
  });
}
```

Caveats to handle while integrating:
- Data wires may target a **control-flow/source node** that has no `in-<port>`/`out-<port>` handles this phase (they kept `NodeHandles`). Guard: if the source node is not an activity node, use `sourceHandle: "out"`; if the target is not an activity node, use `targetHandle: null`. Write a small helper `isActivityNode(config, id)`.
- **Run-status active edges** (~1567-1584): the effect currently matches ReactFlow edge ids to graph edge ids. Change the matcher to `edgeMatchesGraphEdge(flowEdge, activeEdgeIds)`: structural wires match on `w.id`; data wires match when `w.edgeId` is in the active set. Grep `run/active-edges.ts` for the id source and update its unit test if it asserts shapes.
- `handleConnect` (~1842-1884) and edge-deletion sync are keyed to `config.edges` — unchanged, since data wires are `deletable: false` and structural wires keep the real edge ids.

- [ ] **Step 4: Extend the canvas unit test.** In `WorkflowEditorCanvas.test.tsx` add one scenario: config with `prep→submit` edge + auto bindings renders an edge element with `data-wire-variant="data"` attached to `out-preparedData`/`in-fileData` handles, and NO gray edge between the pair; a bindings-free pair renders `data-wire-variant="sequence"`.

- [ ] **Step 5: Run canvas suite to green:**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas`

- [ ] **Step 6: Browser eyeball** (same flow as Task 7 Step 6, plus the Part-8 auto-wire demos): OCR chain shows colored port-to-port wires with correct tooltips; switch/error edges unchanged; a run (Upload & Try on the Part-9 demo, if the worker is up) animates the wires along the executing path.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/workflow-builder/canvas
git commit -m "feat(workflow-builder): render data bindings as port-to-port wires"
```

### Task 9: Auto-layout accounts for per-port node heights

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts` (+ `auto-layout.test.ts`)

- [ ] **Step 1: Write the failing test** (in `auto-layout.test.ts`, following its existing fixtures): two parallel branches where one node is `azureOcr.extract` (5 input rows → taller); assert the vertical gap between ranks reflects the taller node — concretely, `layoutGraph` output positions two same-rank nodes at least `estimateNodeHeight(config, "extract")` apart, not the old fixed 80.

- [ ] **Step 2: Implement.** `layoutGraph` signature gains the config it already receives; replace the fixed dims at ~lines 107-110 with:

```ts
const height = estimateNodeHeight(config, node.id); // falls back to NODE_BASE_HEIGHT
g.setNode(node.id, { width: DEFAULT_NODE_WIDTH, height });
```

and use the same per-node height in the center→top-left conversion (~149-150). Leave `layoutXyflowNodes` (read-only `GraphVisualization`) alone.

- [ ] **Step 3: Run to green; commit:**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/canvas/auto-layout.test.ts`

```bash
git add apps/frontend/src/features/workflow-builder/canvas
git commit -m "fix(workflow-builder): auto-arrange uses real per-port node heights"
```

### Task 10: E2E — rewrite tier2-typed-io, verify tier2-autowire

**Files:**
- Rewrite: `tests/e2e/workflow-builder/specs/tier2-typed-io.spec.ts`
- Verify (should already pass after Task 3): `tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts`

- [ ] **Step 1: Rewrite tier2-typed-io** (same `prep → submit → extract → clean` fixture; same page objects). New assertions:

```ts
test("activity nodes render one row per catalog port with kind colours", async () => {
  // clean = ocr.cleanup (1 in / 1 out)
  await expect(page.getByTestId("port-row-clean-in-ocrResult")).toBeVisible();
  await expect(page.getByTestId("port-row-clean-in-ocrResult")).toHaveAttribute("data-port-kind", "OcrResult");
  // extract = azureOcr.extract → 5 input rows
  await expect(page.getByTestId(/port-row-extract-in-/)).toHaveCount(5);
});

test("bound inputs carry data wires; unbound required inputs show the amber ring", async () => {
  await expect(page.locator('[data-wire-variant="data"]')).toHaveCount(/* # of auto-bound hops in the fixture */);
  await expect(page.getByTestId("port-row-submit-in-fileData")).toHaveAttribute("data-needs-source", "false");
});

test("auto wires expose provenance", async () => {
  // the poll←submit identifier hop if the fixture includes it, else nearest-kind on the prep→submit hop
  await expect(page.locator('[data-wire-variant="data"][data-provenance^="auto:"]').first()).toBeVisible();
});

test("a bindings-free hop renders as a dashed sequence wire", async () => {
  // add one edge between two nodes with no compatible ports to the fixture
  await expect(page.locator('[data-wire-variant="sequence"]')).toHaveCount(1);
});
```

Adapt counts to the exact fixture; drop the old `port-tooltip-*` / `node-type-pill-row` tests (that surface no longer exists on activity nodes).

- [ ] **Step 2: Run both specs** (frontend+backend up):

Run: `npx playwright test tests/e2e/workflow-builder/specs/tier2-typed-io.spec.ts tests/e2e/workflow-builder/specs/tier2-autowire.spec.ts`
Expected: all PASS.

- [ ] **Step 3: Full deterministic e2e sweep** to catch selector fallout elsewhere (other specs select nodes/edges):

Run: `npm run test:e2e`
Expected: green; fix any spec that asserted the old single-handle testids.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/workflow-builder
git commit -m "test(e2e): per-port handles + derived-wire coverage in tier2-typed-io"
```

### Task 11: Documentation

**Files:**
- Modify: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` (Parts 7, 8.5 canvas notes, 16.3/16.4)
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` (Typed I/O + both Auto-wire entries)
- Modify: `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` (status header)

- [ ] **Step 1: MANUAL_TEST_PLAN.** Rewrite Part 7 items 7.1-7.3 for port rows (colored per-port handles, row tooltips `name: Kind — description`, amber rings; the pill-row items are replaced by row assertions). Add to Part 8 a canvas note: auto-wire results render as colored port-to-port wires with provenance tooltips; sequence wires are dashed gray; data wires are not deletable yet (Phase 3). Update 16.3 (pills removed on activity nodes) and the §1.6 stale-handles note if any text remains.

- [ ] **Step 2: FEATURE_DEMO_GUIDE.** Update the Part-7 and Part-8 demo walkthrough steps to describe rows/wires instead of single handles/pills (the seeded configs themselves need no change — schema untouched). Re-run `npm run seed:demos` locally to confirm the demos still load.

- [ ] **Step 3: PORT_WIRING_DESIGN.** Status header → `Phases 1–2 implemented <date> (this plan); Phases 3–5 pending.` Note the Phase-2 slice deltas: control-flow/source nodes keep node-level handles; `⚙︎` renders as a count line only; childWorkflow mappings unwired.

- [ ] **Step 4: Commit**

```bash
git add docs-md
git commit -m "docs(workflow-builder): port-wiring phases 1-2 documentation"
```

---

## Self-review notes (done at plan time)

- **Spec coverage:** §4.1/4.2 → Tasks 6-7 (⚙︎ summary scoped to a count line, recorded in Task 11 Step 3); §4.3 → Task 7 (rows only for catalog ports) + Task 9; §4.4 → deliberately sliced out (out-of-scope table); §5 → Task 5; §5.4+§7 tooltips → Tasks 2, 8; §8 → Tasks 1, 4 (coverage pre-existed; plan corrects the spec); §12 → Task 3; §13 → no-op by construction; §14 → Tasks 5-10; §6, §9, §10, §11 → later phases, not this plan.
- **Known drift risks for the executor:** line numbers are anchors, not gospel; the source-node config shape in Task 5 MUST be verified against `resolve-producer-kind.ts` before implementing; `resolveInputPort` inside `deriveWires` is O(ports × upstream-walk) per render — fine at <100 nodes (same complexity auto-wire already pays on every edit), but memoize the `deriveWires` call in `projectFlowNodes`/`projectFlowWires` behind the existing config-fingerprint gate rather than calling it per-node.
- **Type consistency:** `DerivedWire`/`DataWire` (Task 5) are imported by Tasks 6-8; `PortRowModel`/`estimateNodeHeight`/`NODE_BASE_HEIGHT`/`PORT_ROW_HEIGHT` (Task 6) by Tasks 7 and 9; `via: AutoBoundVia` (Task 2) feeds `DataWire.via` (Task 5) and `wireTooltip` (Task 8).
