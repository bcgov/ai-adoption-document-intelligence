# Pass D — Mutation & Cascade

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
- **`MANUAL_TEST_PLAN.md` is not an oracle.** It was written from the implementation.
  Something being absent from it is not evidence the behaviour is correct or
  intentional — it is often evidence of exactly the gap you are looking for.
- **Evidence must be real.** Every `evidence` value is either `path/to/file.ts:123`
  that actually resolves, or concrete reproduction steps. Invented citations fail
  the validator.
- **Deliverables:**
  - `feature-docs/20260724-workflow-builder-spec-completion/findings-d.json`
    — a JSON array conforming to the schema below.
  - `feature-docs/20260724-workflow-builder-spec-completion/notes-d.md`
    — your narrative: what you covered, your reasoning on judgement calls, and an
    explicit list of what you could **not** check and why.
- **Self-check before finishing:**
  `node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-d.json`
  must exit 0.
- **Never run an install command** (`npm install`, `npx playwright install`, etc.).
  This repo prohibits it.

## Finding schema

```json
{
  "id": "D-001",
  "pass": "D",
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

You own the **change/delete axis** of the domain model. For every dependency edge in
the INVENTORY's §3 "Dependency edges" table (D1–D107), determine what actually
happens when the upstream artifact mutates or disappears.

For each edge, establish and report:

- What the code does today (cite it).
- Whether that behaviour is specified anywhere in `docs-md/workflow-builder/`.
- Whether the author is told it happened.
- Whether there is any recovery path.

A finding is any edge where behaviour is **undefined**, **silently destructive**, or
**leaves the graph invalid with no recovery**.

**Start with INVENTORY §3.10 (D96–D107), "Node → its own bindings."** That subsection
was added specifically because the node-swap and node-delete cascades were missing
from the original edge list. Two leads recorded there, both verified against source:

- `canvas/swap-node-type.ts:156-167` returns `inputs: node.inputs` and
  `outputs: node.outputs` verbatim while changing `activityType` — so bindings
  survive onto an activity type that may not declare those ports.
- `WorkflowEditorV2Page.tsx:730` (`deleteSelected`) removes the node, filters its
  edges, reassigns the entry node and prunes groups — and touches no other node's
  `inputs[]`. A consumer bound to `__auto.<deletedId>.<port>` keeps a dangling
  reference.

Then work the full table. Also cover:

- Rename a ctx key (`settings/rename-ctx-key.ts`) — do all consumers follow,
  including condition refs and `outputs[]` materialisations?
- Remove a group member that an `exposedParam` references.
- Change a port's kind in the catalog while workflows bind to it.
- Delete a workflow version referenced by a `childWorkflow` node.
- Delete or edit a node whose output is in the activity-output cache.
- Delete a `map` node that a downstream `join` names as its source map.

This class is live and under-explored: the `exposedParams` pruning fix and the
dynamic-node slug tombstone were both cascade findings discovered one at a time, in
production use, months apart.

Read INVENTORY §5.13 and §5.14 before you start — they record the delete-handler
asymmetry and the swap carry-over as open questions, deliberately left for you to
adjudicate rather than pre-judged.
