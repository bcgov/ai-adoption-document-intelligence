# D24 (structural half) — default the map node's item ctx key, warn on collision

Worklog for the change Alex approved out of **D24** in `CHECKLIST.md`. The
question that produced it, and the for/against, are in
[`comprehension-copy.md`](comprehension-copy.md) under *"D24 — `currentSegment`
is unexplained and possibly redundant"*; the copy half (the field's help text)
already shipped there. This worklog covers only the two behaviour changes:

1. a freshly-dropped **Run for each item** node creates its *Item ctx key*
   pre-filled with `currentSegment`;
2. a validator **warning** — never an error — when a second map node in the same
   workflow reuses an item ctx key another map already writes.

---

## Why these two, together

A map node's `itemCtxKey` is free text with no default, and the palette skeleton
created it **empty**. Empty is a hard validation error on every single new loop
(`validator.ts:819-824`, `requireNonEmpty` → `severity: "error"`), so the author
was guaranteed a red badge on a node they had just dropped and had not yet
touched.

`currentSegment` is the value every shipped template uses, and not by habit: the
`segment.<field>` shorthand available in condition expressions is **hard-wired**
to read `ctx.currentSegment` —

- `packages/graph-workflow/src/validator/context-utils.ts:16-19` —
  `CTX_NAMESPACE_PREFIXES = { doc: "documentMetadata", segment: "currentSegment" }`
- `apps/temporal/src/expression-evaluator.ts:150` —
  `traversePath(bindings.ctx, ["currentSegment", ...rest])`

so any other name silently disables the shorthand (`segment.segmentType`
resolves to `undefined` rather than erroring).

The cost of defaulting it is the collision the warning covers: **two map nodes
in one workflow now start life sharing a key.** That is not a runtime data race
— the executor gives each iteration its own branch ctx
(`apps/temporal/src/graph-engine/node-executors.ts:624-628`,
`const branchCtx = { ...state.ctx }; branchCtx[node.itemCtxKey] = item`) — it is
a **design-time ambiguity** in three places:

- `collectCtxWriters` / `nodeTypeCtxWrites`
  (`packages/graph-workflow/src/auto-wire/ctx-source.ts:179`) records one writer
  per map, so a duplicated key yields two writers competing for the same
  downstream binding;
- `resolve-producer-kind.ts:163-169` already carries a comment saying "two maps
  sharing an `itemCtxKey` would resolve by node order" — it scopes by the
  consumer's body specifically to avoid that;
- **nesting is the destructive case**: a map inside another map's body writing
  the same key overwrites the outer loop's item for everything in the inner
  body, because the inner branch ctx is a copy of the outer one.

A warning rather than an error because sharing the key is legal and often
harmless (two sibling loops over the same kind of thing, nothing downstream
reading the key outside either body). Blocking Save on it would be wrong.

## Where the warning had to be produced

The warning path is not invented here. `validateGraphConfig` pushes
`{ path, message, severity: "warning" }` into the same `errors` array as
everything else and only counts `severity === "error"` toward `valid`
(`validator.ts:199-201`), which is exactly how the existing map warning works —
G-067's "no concurrency limit" at `validator.ts:841-856`.

The editor surfaces it with no extra wiring: `useGraphValidation`
(`apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:113`)
calls `validateGraphConfig` directly, buckets by `severity` into
`errorCount` / `warningCount` (lines 142-144) and by node id from the `path`
(line 145) — so anchoring the warning at `nodes.<id>.itemCtxKey` puts it on that
node's canvas badge and in the Validation drawer automatically.

---

## Change 1 — the creation-time default

**`apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts:76-99`**
— new exported constant `DEFAULT_MAP_ITEM_CTX_KEY = "currentSegment"`, carrying
the reason the value is not arbitrary (the `segment.<field>` coupling) so the
next reader does not "tidy" it to `item`.

**`control-flow-skeletons.ts:107`** — `itemCtxKey: ""` → `DEFAULT_MAP_ITEM_CTX_KEY`.
The module header's per-type default list (lines 7-8) was updated to match; it still
said "empty ctxKey strings".

### Nothing rewrites a saved config

`buildMapSkeleton` is reachable only through `buildControlFlowSkeleton`, whose
only callers are the two palette-drop paths (`WorkflowEditorV2Page.tsx`,
`WorkflowEditorCanvas.tsx`). There is no load-time or migration path through this
module at all, so an existing workflow — including the seeded one at
`scripts/seed-feature-demos.mjs:755` that uses `currentDoc` — is untouched. The
e2e test *"a saved map keeps the key it was authored with"* proves it end to end:
it stores a map with `currentDoc`, opens the editor, and re-reads the config from
the API afterwards.

The default also introduces no new validation error of its own: the only
"undeclared ctx key" rule (`validatePortBindings`, `validator.ts:927-967`) reads
`inputs[]` / `outputs[]` binding rows, and a map's `itemCtxKey` is neither, so
the pre-filled key does not need a matching `config.ctx` declaration.

### Tests

`control-flow-skeletons.test.ts` — the existing shape test was updated
(`itemCtxKey` now asserted against the constant), plus a new
`describe("map skeleton seeds an item ctx key (D24)")` with four cases: non-empty
and untrimmed-free; the value is specifically `currentSegment` *and why*; the
collection key is deliberately still empty; and construction is per-call.

```
$ npx vitest run src/features/workflow-builder/palette/control-flow-skeletons.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

---

## Change 2 — the collision warning

**`packages/graph-workflow/src/validator/validator.ts:888-955`** — new
`validateMapItemKeyCollisions`, registered at **`validator.ts:185`** immediately
after `validateMapJoinNodes`.

It walks the map nodes in node-record order, keeping the first node to claim each
(trimmed, non-empty) item key, and pushes a warning for every later map that
claims the same one.

### The wording, and where it appears

The message an author actually gets (verbatim from the browser, two
palette-dropped loops):

> Map node **"Run for each item"** reuses the item variable
> **"currentSegment"**, which **another loop on this canvas** already writes.
> Steps that read "currentSegment" can bind to the wrong loop, and if one of
> these loops runs inside the other the inner item replaces the outer one. **Give
> this loop its own item variable** unless both loops really mean the same item.

When the two loops have been renamed and their labels differ, the middle clause
names the incumbent instead: *…which map node **"Loop A"** already writes*.

Three things by design.

1. **It says what will actually happen, both ways.** The sibling case (a step
   that reads the key can bind to the wrong loop) and the nested case (the inner
   item replaces the outer) are different failures with different severities, and
   a message that mentioned only one would be misleading in the other case.
2. **It ends with the action** — *give this loop its own item variable* — and
   says which change that is. An earlier draft ended "Rename this one", which is
   ambiguous between renaming the loop and renaming the variable.
3. **It only names the incumbent when the name distinguishes it.** This was
   caught in the browser, not in the unit tests. Both maps arrive from the
   palette labelled *Run for each item*, and the drawer additionally rewrites any
   quoted node id into that node's label (`humanizeNodeIds`,
   `ValidationDrawer.tsx:82-87`), so the obvious phrasing rendered as
   `Map node "Run for each item" reuses … which "Run for each item" already
   writes` — a sentence that identifies nothing. When the labels are equal the
   message now says *another loop on this canvas*; the author reaches the
   offending node from the row itself, which is click-to-select.

**Severity `warning`, never `error`.** `validateGraphConfig` computes `valid`
from `severity === "error"` only (`validator.ts:199-201`), so a collision cannot
block Save. That is deliberate: two independent sibling loops sharing a key run
correctly, and turning the new default into a Save-blocker would make it worse
than the empty field it replaced.

**Where it shows up, with no extra wiring.** The `path` is
`nodes.<secondMapId>.itemCtxKey`, which is the anchor format
`useGraphValidation` buckets by (`nodeIdFromPath`), so the warning lands:

- on the **second map's canvas badge** — `ValidationBadge` renders whenever
  `errorCount === 0 && warningCount > 0` is false, in its warning (yellow)
  styling;
- in the **Validation drawer**, under that node's heading, with the drawer's
  "N warnings" chip (`ValidationDrawer.tsx:212, 231-233, 281-284`);
- in the top-bar validation count.

The first map keeps a clean node — the warning is anchored on the one the author
just added, not on the one that was already working.

### Tests

New file
**`packages/graph-workflow/src/validator/validator-map-item-key-collision.test.ts`**
— 11 cases: silent for one map and for two maps with different keys; warns once
on the second; anchored at `nodes.m2.itemCtxKey`; names both labels and contains
the consequence and the instruction; **does not** name the incumbent when both
labels are the palette default; id fallback when a label is blank; warns on the
third as well as the second; whitespace-insensitive; two EMPTY keys are not
reported as a collision (and the pre-existing two required-field *errors* are
asserted still present); and a collision never contributes a blocking error.

```
$ cd packages/graph-workflow && npx jest src/validator/
Test Suites: 10 passed, 10 total
Tests:       173 passed, 173 total

$ cd packages/graph-workflow && npx jest        # whole package
Test Suites: 49 passed, 49 total
Tests:       1094 passed, 1094 total

$ cd apps/backend-services && npx jest src/workflow/graph-schema-validator.spec.ts
Tests:       53 passed, 53 total

$ cd apps/frontend && npx vitest run src/features/workflow-builder \
    --exclude "src/features/workflow-builder/dynamic-nodes/**"
Test Files  150 passed (150)
     Tests  2244 passed (2244)
```

*(`dynamic-nodes/**` excluded only because another agent was editing that
directory concurrently — nothing here touches it.)*

---

## Browser verification

Both halves are invisible to jsdom: the default is applied by the palette-drop
path, which needs a mounted React Flow canvas, and the warning had to be seen
where an author meets it rather than merely returned by `validateGraphConfig`.

### A new e2e spec

**`tests/e2e/workflow-builder/specs/tier2-map-item-key-default.spec.ts`** — three
tests, run against the live dev stack:

- *a freshly dropped map arrives with its item variable pre-filled* — clicks the
  palette's **Run for each item**, asserts **Item ctx key** = `currentSegment`
  and **Collection ctx key** still empty;
- *a saved map keeps the key it was authored with* — creates a workflow whose map
  uses `currentDoc`, opens it, and asserts both the form **and the stored config
  after the round-trip** still read `currentDoc`;
- *a second map collides on the default key, warns, and still saves* — drops two
  maps, asserts the top-bar button shows a warning count, opens the drawer,
  asserts the message text, then **Saves** and re-reads the config from the API.

```
$ PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test \
    tests/e2e/workflow-builder/specs/tier2-map-item-key-default.spec.ts \
    --reporter=line --workers=1
✅ Frontend type-check clean
⏭️  PLAYWRIGHT_SKIP_DB_RESET set — skipping database reset.
  3 passed (23.4s)
```

The suite's global setup type-checks the frontend before any test runs, so
`tsc --noEmit` clean is part of that output.

### And by hand, with screenshots

Driven through the `app-browser-auth` bypass against the running stack, dropping
two maps on a throwaway workflow (created and deleted through the API):

```json
{
  "val1": "currentSegment",
  "val2": "currentSegment",
  "btnLabel": "3 errors · 2 warnings",
  "warning": "Map node \"Run for each item\" reuses the item variable \"currentSegment\", which another loop on this canvas already writes. Steps that read \"currentSegment\" can bind to the wrong loop, and if one of these loops runs inside the other the inner item replaces the outer one. Give this loop its own item variable unless both loops really mean the same item.",
  "saved": true
}
```

What the screenshots show:

- **first map, settings panel** — *Item ctx key \** reads `currentSegment`,
  *Collection ctx key \** is still the empty placeholder, and the D24 help text
  from the copy half is under the label.
- **Validation drawer with two maps** — two buckets, both headed *RUN FOR EACH
  ITEM*. The **first** carries `3 errors · 1 warning` and **no collision row**;
  the **second** carries `3 errors · 2 warnings` and the collision row, amber
  triangle, anchored `nodes.map 2.itemCtxKey`. That is the intended asymmetry:
  the loop that was already there stays clean.
- **Save** — the toast confirms, and re-reading the workflow shows both maps
  persisted with `currentSegment`. The warning blocked nothing.

The three errors per map are pre-existing and unrelated (no collection key, no
body entry/exit) — a map dropped from the palette has always had those until the
author wires its body.

### One cosmetic thing worth knowing

With the key pre-filled, the **Item ctx key** picker now shows its `+ Create
variable "currentSegment"` affordance on a fresh map, because `currentSegment` is
not yet declared in `config.ctx`. That is the picker's normal prompt for any
unknown name, not an error — no validation rule requires a map's `itemCtxKey` to
be declared (`validatePortBindings` reads `inputs[]`/`outputs[]` only). Stop 7 of
the walkthrough already tells the author to accept that prompt.

---

## Walkthrough doc

**`docs-md/workflows/GALLERY.md`**, stop 7 (*Doing it for every page*):

- **Step 3** told the author to *"type `currentSegment` into Item ctx key"*. It
  now says the field already reads `currentSegment` and to leave it and accept
  the *Create variable* prompt.
- **New "Look for" bullet** explaining why the pre-filled value is that specific
  name (the `segment.field` shorthand always reads `currentSegment`, so renaming
  the item quietly costs you the shorthand).
- **New "Look for" bullet** on dropping a *second* loop: what the amber warning
  says, why it is a warning and not an error, and that it never blocks Save.
- **"Something's off if"** was built on the old behaviour — *"before you name it,
  no wire is correct"* — which is no longer reachable, since the item is named on
  arrival. It now hangs the diagnosis on **Collection ctx key** instead, and the
  adjacent bullet about the wire appearing "as soon as the item has a name" was
  corrected to "once the loop knows both what it is looping over and what to call
  each item".
