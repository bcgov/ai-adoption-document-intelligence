# Fix Batch 10 — G-104: map-item wires

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A node inside a loop that reads the loop's current item shows a wire from the map, like every other binding — and pinning that wire binds to the key the map actually writes.

**Source:** G-104 in [GAP_REGISTER.md](../../../feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md)

---

## The defect, and two corrections to the register entry

A map node writes the current item into `itemCtxKey`. Two halves of the same lookup disagree about what that output **port** is called:

- The resolver reports `producerPort: producer.itemCtxKey` — the author's variable name (`resolve-input-port.ts:177`).
- `nodeTypeCtxWrites` records the same write under the fixed port name `"item"` (`ctx-source.ts:179`).

So a derived wire would carry a `sourcePort` its own provenance lookup could never match, and `derive-wires.ts:183` **excludes `map` from the producer index entirely**. A body node correctly auto-bound to the map's item gets **no wire at all** — a binding the author can neither see nor delete.

**Correction 1 — there is no data migration.** The register says *"a rename on either side is a data migration over saved configs, not a local edit"* and recommends a standalone epic. Measured: **0 of 2** map nodes in the shipped templates and **0 of 2** in the seeded database persist an `outputs[]` row. Maps write ctx through the dedicated `itemCtxKey` field. The port name is an in-memory convention only. Nothing on disk encodes it.

**Correction 2 — `MapBodyContainer` is not a complication.** The register flags it as something the fix "has to reckon with". It is documented as *"Pure presentational … Background container rendered behind the body nodes"* — body nodes are ordinary siblings, not children, so a map→body wire is an ordinary wire.

**A third defect found while scoping, which belongs in this batch.** `wire-mutations.ts:56` computes the pinned ctx key with `synthesiseCtxKey(producerNodeId, producerPort)` unconditionally. For a control-flow producer that is wrong: the map really writes `itemCtxKey`, a join writes `resultsCtxKey`, a humanGate writes `<id>Payload`. Pinning such a wire would persist `__auto.<mapId>.item` and silently break the binding. `producerCtxKeyForPort` (`ctx-source.ts:269`) already answers this correctly and is used by the resolver — the pin path just never adopted it. **This affects every control-flow producer G-007 made bindable, not only map.**

---

## Standing rules

- **NEVER run an install command.** If something looks like it needs installing, STOP and report.
- Stack is running: backend :3002, frontend :3000, Temporal worker, docker infra. Logs in `/tmp/claude-1000/-home-alstruk-GitHub-ai-adoption-document-intelligence/6fd1008d-6f71-49e0-b3de-e96e8d99551c/scratchpad/`.
- **This branch just merged develop.** `docs-md` is reorganised — workflow docs live in `docs-md/workflows/`, templates in `docs-md/workflows/templates/`.
- After changing `packages/graph-workflow`, run `npm run build -w packages/graph-workflow`. The Vite `optimizeDeps.exclude` fix (G-105) means the dev server now picks up source changes without a cache clear — but check `frontend.log` anyway.
- `apps/temporal`'s suite needs `--forceExit` or it hangs on open handles after passing.
- Jest config lives in each workspace's `package.json`; frontend script is `type-check`.
- Commit after each task.

---

## Task 1 — Make the two halves agree on `"item"`

**Pick `"item"`, not `itemCtxKey`.** Every other control-flow producer already uses a stable port identifier — join `"results"`, humanGate `"payload"`, childWorkflow `mapping.port`. The author's chosen variable name is the *ctx key*, not the port. Renaming the enumeration to match the resolver would make `map` the odd one out and break the symmetry `producerCtxKeyForPort` depends on.

**Files:**
- Modify: `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:177`
- Test: `packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("reports a map's item producer under the stable port name 'item'", () => {
  // body node with an input whose kind matches the map's element type
  // expect: { status: "auto-bound", producerNodeId: <mapId>, producerPort: "item", via: "map-item" }
});

it("still resolves the map item's element kind correctly", () => {
  // regression guard — the kind derivation must not change
});
```

- [ ] **Step 2: Run, watch fail.**

```bash
npm test -w packages/graph-workflow -- resolve-input-port 2>&1 | tail -15
```

- [ ] **Step 3: Change `producerPort: producer.itemCtxKey` to `producerPort: "item"`**, and update the surrounding comment to say why the port name is stable while the ctx key is author-chosen.

- [ ] **Step 4: Find every consumer that assumed the old value.**

```bash
grep -rn "map-item" --include=*.ts --include=*.tsx apps/frontend/src packages/graph-workflow/src | grep -v test
```

Known consumers: `WorkflowEdge.tsx:97` (already styles map-item wires — the rendering exists and has simply never received one), `input-row-resolution.ts`, `ctx-source.ts`. Check each for a dependency on `producerPort` being the ctx key.

- [ ] **Step 5: Green, build, commit**

```bash
npm test -w packages/graph-workflow 2>&1 | tail -6
npm run build -w packages/graph-workflow 2>&1 | tail -2
git commit -am "fix(graph-workflow): a map's item producer uses the stable port name 'item' (G-104)"
```

---

## Task 2 — Draw the wire

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:~175-183`
- Test: `derive-wires.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("draws a data wire from a map to a body node bound to its item", () => {
  // expect a wire with sourcePort "item" and via "map-item"
});

it("stamps provenance on a map-item wire", () => {
  // the whole reason map was excluded — assert `via` is set, not undefined
});

it("still excludes source nodes from this pass", () => {
  // regression guard: sources are indexed by the branch above, which owns
  // their per-subtype kinds
});

it("draws nothing for a map whose item nothing reads", () => {});
```

- [ ] **Step 2: Run, watch fail.**

- [ ] **Step 3: Remove `map` from the exclusion** at `derive-wires.ts:183`, keeping `source` excluded. Rewrite the comment block above it: it currently explains why map is skipped, and that explanation is now the changelog of this fix rather than current behaviour.

- [ ] **Step 4: Check the rendering end to end.**

`WorkflowEdge.tsx:97` already has a `via === "map-item"` branch. Confirm it renders sensibly now that it actually receives wires — and that a map→body wire does not visually collide with the `MapBodyContainer` background box, which is drawn behind the body nodes.

- [ ] **Step 5: Green + commit**

```bash
npx vitest run --root apps/frontend src/features/workflow-builder/canvas 2>&1 | tail -8
git commit -am "fix(workflow-builder): map-item bindings draw a wire (G-104)"
```

---

## Task 3 — Pinning must bind to the key the producer actually writes

`wire-mutations.ts:56` computes the pinned ctx key as `synthesiseCtxKey(producerNodeId, producerPort)` unconditionally. For an activity that is right — its output ctx key really is `__auto.<node>.<port>` unless an `outputs[]` row says otherwise. For a **control-flow producer it is wrong**: the map writes `itemCtxKey`, the join writes `resultsCtxKey`, the humanGate writes `<id>Payload`. Pinning would persist a key nothing writes.

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/canvas/wire-mutations.ts:~50-60`
- Test: its spec

- [ ] **Step 1: Write failing tests**

```ts
it("pins a map-item wire to the map's own itemCtxKey, not a synthesised key", () => {});
it("pins a join-results wire to the join's resultsCtxKey", () => {});
it("still synthesises a key for an activity producer with no outputs[] row", () => {});
it("does not add a bogus outputs[] row to a control-flow producer", () => {});
```

That last one matters: a map writes through `itemCtxKey`, so appending `{ port: "item", ctxKey }` to its `outputs[]` would invent persisted state the engine ignores — and would create exactly the on-disk convention this batch established does not exist.

- [ ] **Step 2: Run, watch fail.**

- [ ] **Step 3: Consult `producerCtxKeyForPort` first**, falling back to the existing `outputs[]` lookup and then `synthesiseCtxKey`. Only append an `outputs[]` row when the producer genuinely binds through `outputs[]` — i.e. when `producerCtxKeyForPort` returned nothing.

- [ ] **Step 4: Green + commit**

```bash
npx vitest run --root apps/frontend src/features/workflow-builder 2>&1 | tail -8
git commit -am "fix(workflow-builder): pinning a control-flow producer binds to the key it writes (G-104)"
```

---

## Task 4 — Verify and close out

- [ ] **Step 1: Suites**

```bash
npm test -w packages/graph-workflow 2>&1 | tail -6
npx vitest run --root apps/frontend 2>&1 | tail -6
npm test -w apps/backend-services -- src/workflow 2>&1 | tail -6
npm run -w apps/frontend type-check 2>&1 | tail -4
```

- [ ] **Step 2: Templates still valid** — all 15 in `docs-md/workflows/templates/`, using the sweep pattern from earlier batches. Two of them contain map nodes, so this batch is exactly the case that could disturb them.

- [ ] **Step 3: Browser check.** This batch's whole point is a wire that appears on screen, so unit tests are not sufficient evidence. Open a workflow with a map — the control-flow demo, or the multi-page-report template — and confirm a wire now runs from the map to the body node that reads its item, with no console errors. Report what you see. Auth bypass: see `.claude/skills/app-browser-auth/`.

- [ ] **Step 4: Update the register.** Mark G-104 fixed, and record the two corrections to its original text (no data migration; `MapBodyContainer` not a complication) so the next reader does not inherit the overestimate.

- [ ] **Step 5: Manual test plan.** Part 7 (typed I/O) or Part 8 (auto-wire) should gain a check that a map-item binding draws a wire — it is the most common binding shape in the product and had no coverage.

---

## Notes for the implementer

**Do the tasks in order.** Task 2 cannot be verified until Task 1 makes the names agree, and Task 3's pin path depends on the wire existing to pin.

**Task 3 is broader than map.** It fixes pinning for every control-flow producer G-007 made bindable. Say in your report which producer types you covered and tested.

**Do not add `outputs[]` rows to control-flow nodes.** They write ctx through dedicated fields. Persisting a redundant row would invent the very on-disk convention this batch confirmed does not exist.
