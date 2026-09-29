# Pass B — Editor-Environment Obligations

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
  - `feature-docs/20260724-workflow-builder-spec-completion/findings-b.json`
    — a JSON array conforming to the schema below.
  - `feature-docs/20260724-workflow-builder-spec-completion/notes-b.md`
    — your narrative: what you covered, your reasoning on judgement calls, and an
    explicit list of what you could **not** check and why.
- **Self-check before finishing:**
  `node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-b.json`
  must exit 0.
- **Never run an install command** (`npm install`, `npx playwright install`, etc.).
  This repo prohibits it.

## Finding schema

```json
{
  "id": "B-001",
  "pass": "B",
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

The workflow builder is a programming environment. Programming environments carry a
known duty roster. Audit every Parts 3–9 surface against it and report what is
missing and reasonably expected.

Roster — for each, report **present / partial / absent** with evidence:

1. CRUD on every artifact (create, read, update, delete)
2. Undo / redo
3. Duplicate a node or a selection
4. Copy / paste, including across workflows
5. Multi-select operations (move, delete, group, align)
6. Find & navigate — locating a node in a large graph
7. Refactor — rename, extract to sub-workflow, inline a sub-workflow
8. Inspect & debug — seeing intermediate values, understanding why a node did not run
9. Error recovery — undoing a destructive action, recovering from a failed save
10. Diff & compare — what changed between two versions
11. Concurrent editing — two tabs, or two people, on one workflow
12. Keyboard access — can the graph be authored without a mouse

Three holes are already confirmed and should appear in your findings with fuller
evidence than the probe that found them:

- No canvas-level undo/redo. The only `undo|redo` matches under
  `apps/frontend/src/features/workflow-builder/` are inside
  `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ConfusionMapEditor.tsx` and
  `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx`.
- No node duplicate / copy / paste.
- No find-a-node.

Node deletion **does** exist and cascades — `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx` (context
menu + keyboard), handler `deleteSelected` at
`apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:730`. Assess
what that means with no undo behind it.

**Judgement standard:** "absent" is only a finding when a competent author would
reasonably expect it in a graph editor of this ambition. Not every roster item
applies — say so explicitly and mark it `non-goal` with your reasoning rather than
silently dropping it.
