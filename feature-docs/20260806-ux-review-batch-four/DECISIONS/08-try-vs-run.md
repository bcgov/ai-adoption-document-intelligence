# Decision 08 — "Try" vs "Run this workflow"

**The question:** the editor's top bar has two buttons that open the *same*
drawer on different tabs, and nothing in the UI says which one you want — so do
we collapse them into one entry point, or keep two and label the difference?

**The recommendation:** collapse to **one** top-bar button (`Run…`) opening the
existing drawer, with the two tabs renamed to say what each is for — **"Try on
canvas"** and **"Call from outside"** — and the tab pre-selected by what the
workflow's inputs actually are. This is Alex's own proposal from the call and it
is cheap, because the tabbed surface **already exists**; only the second button
and the labels change.

---

## What the two buttons really do

They are not two features. Both write one state slot and open one drawer:

- Try — [WorkflowEditorV2Page.tsx:1779](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1779) — `onClick={() => setRunDrawerMode("try")}`
- Run this workflow — [WorkflowEditorV2Page.tsx:1799](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1799) — `onClick={() => setRunDrawerMode("run")}`

The value only picks a default tab: [RunWorkflowDrawer.tsx:198](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L198)
— `<Tabs defaultValue={openMode}>`, tabs `try` and `run` at
[:204](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L204)
and [:211](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L211).
**The reviewer's "even if I choose one, I still have the option to go to the other"
is literally true** — the other button's destination is a tab one click away
inside the surface the first button opened. That is the whole complaint, and the
code confirms it.

Underneath the tabs there *is* a real difference — four of them:

**1. Different endpoint, and the endpoint decides who can cancel you.**
Try posts `POST /workflows/:id/tries` ([useWorkflows.ts:511](apps/frontend/src/data/hooks/useWorkflows.ts#L511));
Run posts `POST /workflows/:id/runs` ([useWorkflows.ts:471](apps/frontend/src/data/hooks/useWorkflows.ts#L471)).
Both land in the same handler, `startLineageRun`
([workflow.controller.ts:590](apps/backend-services/src/workflow/workflow.controller.ts#L590)),
with one differing argument: `RunTrigger`, a stamp of `"try"` or `"api"` recorded
on the Temporal execution ([temporal-client.service.ts:53](apps/backend-services/src/temporal/temporal-client.service.ts#L53)).
The stamp is **not** a request field — it is set by which URL you hit
(`/runs` → `"api"` at [:534](apps/backend-services/src/workflow/workflow.controller.ts#L534),
`/tries` → `"try"` at [:582](apps/backend-services/src/workflow/workflow.controller.ts#L582)).
What it buys: every start of either kind first cancels in-flight runs stamped
`"try"` for that workflow ([:626](apps/backend-services/src/workflow/workflow.controller.ts#L626)).
So **a Try is disposable — your next Try or Run kills it. A Run is not — nothing
later sweeps it up.** The controller says why in its own words:

> *"production runs run to completion regardless of how many others are in
> flight for the same lineage (feeding 240 documents through must not have
> document #2 cancel document #1)."*

**2. Different result surface.** Try calls `runState?.setActiveRunId(...)` and
closes the drawer ([RunWorkflowDrawer.tsx:740](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L740)),
which is what starts the canvas polling and animates the graph. Run does none of
that: it keeps the drawer open and prints the execution id inline
([:388](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L388)).
**Try's answer is the canvas; Run's answer is an id you copy.**

**3. Different supporting content.** The Run tab is mostly *documentation for
calling the workflow from outside the editor* — Trigger URL, Input schema, Sample
curl, Authentication ([:349–:363](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L349)),
with a "Test run" box at the bottom. The Try tab has none of that — just Version
+ Initial ctx JSON ([:754](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L754)).

**4. Different visibility rules.** Try is hidden when a file upload is the *only*
way into the workflow (`tryButtonVisible`, [WorkflowEditorV2Page.tsx:1547](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1547));
in that case the drawer's Upload section is the Try affordance instead
([RunWorkflowDrawer.tsx:447](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L447)).
Run is always shown.

**What is NOT different, contrary to what the two buttons imply:** persistence
(both start a real Temporal execution against the saved version — neither is a
simulation), preconditions (both are gated by the identical `runBlockedReason`
at [:992](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L992):
saved, no validation errors, not dirty), and run history (both invalidate
`["workflow-runs"]` and both appear in the Run-history drawer — nothing there
filters on trigger).

## So what is the difference *for*

One sentence: **Try = "show me what this graph does, on the canvas, and throw it
away." Run = "prove the outside world can invoke this, and let the result
stand."** Try is for authoring iteration; Run is for handing the workflow to a
caller — a CHEFs intake, a script, a colleague with the curl. The one asymmetry
with real consequence is cancellation: a Try you started can be silently killed
by your next click, which is exactly wrong for the second use and exactly right
for the first.

## Options

| Option | What changes | Cost | Risk |
|---|---|---|---|
| **A — One button, two named tabs** (Alex's proposal) | Delete the `Run this workflow` button; keep `Run…`. Rename tabs to **"Try on canvas"** / **"Call from outside"**, each with a one-line subtitle. Default the tab from `tryButtonVisible`'s existing input analysis instead of from which button was pressed. | 2 source files (`WorkflowEditorV2Page.tsx`, `RunWorkflowDrawer.tsx`) + 4 test/page-object files that assert on `try-button` / `run-this-workflow-button`: `WorkflowEditorV2Page.test.tsx`, `RunWorkflowDrawer.test.tsx`, `tests/e2e/workflow-builder/pages/WorkflowEditorPage.ts`, `tests/e2e/.../tier2-run-drawer.spec.ts`. | Try becomes two clicks instead of one — and Try is the *frequent* action during authoring. `openMode` stops being driven by a button, so its prop and the `data-open-mode` attribute need re-basing rather than deleting. |
| **B — Keep both buttons, each states its difference** | Replace the two tooltips (currently *"Run this graph now"* and *"Open the run-trigger panel for this workflow"* — which do not distinguish anything) with ones that name the real difference. Remove the *other* mode's tab from each entry so the drawer opens on one thing only. | 2 source files, small edits. Tests mostly unaffected. | Does not fix what the reviewer actually objected to — two buttons still sit side by side and still look like alternatives. Removing the tabs *loses* the ability to switch, which some users will want. Two top-bar buttons for the same underlying action stays a standing "what's the difference?" question. |
| **C — Split by purpose, not by run mode** | `Try` stays a one-click top-bar button (no drawer for the common case: reuse last ctx, or the stub). `Run this workflow` becomes a `More →` menu item named **"Call from outside…"**, opening the URL/schema/curl/auth reference. | 2 source files + the same 4 test files; the tabs come out entirely. | Biggest behaviour change of the three. Loses the ability to edit ctx before a Try unless a secondary path is kept, which reintroduces a surface. The "Test run" box inside the outside-calling panel then has no obvious home. |

## Recommendation — Option A

Take Alex's proposal. Three reasons, in order:

1. **It is the smallest true fix.** The tabbed surface already exists and already
   holds both behaviours correctly separated. What is redundant is the *second
   top-bar button*, not the drawer. Option A deletes the redundancy and leaves
   the working machinery alone.
2. **The current labels encode the wrong axis.** "Try" vs "Run" names a
   *strength of commitment* that does not exist — both are real Temporal
   executions on the saved version, both land in run history. The axis that does
   exist is *where the answer appears*: on your canvas, or through a URL someone
   else calls. Tab labels naming that axis ("Try on canvas" / "Call from
   outside") answer the reviewer's question in the label itself, with no tooltip.
3. **It removes the "I can still go to the other one" trap by construction.**
   With one entry point, switching tabs is switching *modes inside one task*,
   which is what a tab is for — not two doors into the same room.

Two things to carry into the implementation, both from the code above:

- **Pre-select the tab from the workflow, not from a click.** The logic exists:
  `tryButtonVisible` at [WorkflowEditorV2Page.tsx:1547](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1547)
  already decides whether a canvas-driven Try is meaningful. Default to
  "Try on canvas" when it is, "Call from outside" when it is not.
- **State the disposability where it happens.** One line under the Try button
  inside the drawer: *"Starts a throwaway run — your next Try or Run cancels
  it."* That is the one difference a user can be burned by, and today nothing
  anywhere says it.

Not recommended: Option B, because it answers the label question while leaving
the layout that raised it; Option C, because it is the most disruptive and its
main gain (one-click Try) can be added to Option A later as a
"Try again with the same inputs" repeat action.
