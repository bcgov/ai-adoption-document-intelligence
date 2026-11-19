# Pass C — Static Domain Cross-Product

## Standing rules for this pass

- **Scope:** workflow-builder MANUAL_TEST_PLAN Parts 3–9 only (canvas, control-flow
  forms, typed I/O, auto-wire, port wiring, try-in-place/previews). Parts 10–16 are
  out of scope.
- **Discovery only.** Do not modify any source file. Do not fix anything you find.
- **Cite the inventory.** Use the short surface names from
  `feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md`. Do not
  invent names for artifacts or surfaces.
- **Do not read the other passes' outputs.** Independence is the point; overlap
  between passes is a priority signal and is handled at merge.
- **`docs-md/workflow-builder/MANUAL_TEST_PLAN.md` is not an oracle.** It was written from the implementation.
  Something being absent from it is not evidence the behaviour is correct or
  intentional — it is often evidence of exactly the gap you are looking for.
- **Evidence must be real.** Every `evidence` value is either `path/to/file.ts:123`
  that actually resolves, or concrete reproduction steps. Invented citations fail
  the validator.
- **Deliverables:**
  - `feature-docs/20260724-workflow-builder-spec-completion/findings-c.json`
    — a JSON array conforming to the schema below.
  - `feature-docs/20260724-workflow-builder-spec-completion/notes-c.md`
    — your narrative: what you covered, your reasoning on judgement calls, and an
    explicit list of what you could **not** check and why.
- **Self-check before finishing:**
  `node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-c.json`
  must exit 0.
- **Never run an install command** (`npm install`, `npx playwright install`, etc.).
  This repo prohibits it.

## Finding schema

```json
{
  "id": "C-001",
  "pass": "C",
  "title": "one line",
  "severity": "blocker | major | minor",
  "type": "design-gap | impl-gap | non-goal",
  "evidence": "path/to/file.ts:123  OR  concrete reproduction steps",
  "surfaces": ["short-name-from-inventory"],
  "disposition": "fix | defer | won't-support",
  "rationale": "why that disposition"
}
```

`design-gap` = the capability or behaviour was never specified.
`impl-gap` = it was specified and the implementation does not match.
`non-goal` = it is genuinely out of scope and should be recorded as a deliberate
decision so it stops being rediscovered.

## Your task

Enumerate the static cross-product of the domain model and mark every cell
**specified / unspecified / won't-support**.

**You do NOT own the mutation axis** — change and delete behaviour belongs to Pass D.
Anything about an artifact changing or disappearing is out of your scope. Report
static cells only.

Axes, from the INVENTORY's §4 "State sources" section:

1. **Control-flow nesting** — every meaningful combination of the 6 control-flow node
   types nested inside one another. `map` containing `switch`; `switch` inside `map`
   inside `map`; `join` whose source map is inside a `switch` branch; `pollUntil`
   inside a `map` body; `humanGate` inside a branch that may not execute.
2. **Port kind × binding state** — each kind family against every binding state.
   Note the INVENTORY records **six** binding states, not five: the engine's
   `PortResolution` (`packages/graph-workflow/src/auto-wire/resolve-input-port.ts:11`)
   declares five, and `apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:77` adds a frontend-only
   `ctx-bound`. Grid all six.
3. **Run status × surface** — every surface that renders run state, against every
   status it can receive. The INVENTORY records **three divergent unions** for this
   one concept: `NodeStatusValue` (`packages/graph-workflow/src/types.ts:430`,
   uses `completed`), `NodeRunStatusValue`
   (`apps/frontend/src/features/workflow-builder/run/node-status.types.ts:26`, uses
   `succeeded` and adds `cancelled`), and the backend DTO enum which has neither.
   **Grid all three, not one.** Also include the derived states the INVENTORY flags
   as having no backing enum — `PreviewWidget`'s "didn't run" / "branch not taken"
   copy exists only as strings, and `WirePeekPopover` carries the same concept under
   a different name with `state` typed as bare `string`.
4. **Validation severity × anchor target** — `error | warning`
   (`packages/graph-workflow/src/types.ts:423`) against every anchor path shape in the
   INVENTORY's 32-row anchor table. Note only 2 of those 32 deep-link; the other 30
   fall back to workflow-level despite naming a specific node, group or edge.

Output the grid in `notes-c.md`. Emit a **finding** for every `unspecified` cell and
for every `won't-support` cell.

**The `won't-support` cells are a first-class deliverable**, not leftovers. Written
down, they become the non-goals register and stop the same non-decision being
rediscovered months apart. Give each one a real rationale.

This is the highest-volume, lowest-density pass. Prefer a complete grid with terse
cells over a partial grid with essays.
