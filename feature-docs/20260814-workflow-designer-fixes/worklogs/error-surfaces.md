# Worklog — error surfaces (I4, I5)

Branch `feature/visual-workflow-builder`, 2026-08-14. Both items come from
Inderdeep's note (`source/inderdeep-note.txt`) and his mock-up
`source/inderdeep-mockup-error-card.png`.

Verified in a real browser (Playwright + the `app-browser-auth` interception,
1920×1080), against the two seeded workflows the capture script uses:
`probe-clean-failure` for the chip, `demo-typed-i-o-coloured-handles-type-pills-part-7`
for the card. Both had to be *really run and really failed* — neither surface
renders without an `activeRunId`.

---

## I4 — the node error chip's icon sat above the label's optical centre

### What was wrong

`NodeFailureChip` in
`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:593`
draws the `× ERROR` chip as a Mantine `Badge` (`size="xs"`) with an `IconX` in
`leftSection`. Mantine's Badge is an `inline-grid` with `align-items: center`
(`node_modules/@mantine/core/styles/Badge.css`), so it centres **the icon's box**
and **the label's line box**. A line box is symmetric about the font's ascent
and descent; the ink of an all-caps word is not — `ERROR` has cap height above
the baseline and nothing below it, so the empty descender space drags the ink
down relative to the box it lives in.

Measured on the live chip (canvas at 2.00×, converted back to CSS px and
expressed from the chip's top edge):

| | before |
|---|---|
| chip height | 16px |
| font | 700 9px / 14px, ascent 10, descent 3, cap height 6, descender ink 0 |
| label line box | top 1.0, centre **8.0** |
| cap band (the visible ink) | 5.5 → 11.5, centre **8.5** |
| icon box (11px `IconX`) | top 2.5, centre **8.0** |
| **icon centre − cap centre** | **−0.5px** (icon high) |

Half a CSS pixel — which is exactly the size of complaint he filed ("nitpicking
but…"), and it is a full pixel in the zoomed frame he was looking at.

### What changed

`WorkflowEditorCanvas.tsx:591` adds a documented constant,
`FAILURE_CHIP_GLYPH_OPTICAL_NUDGE = "translateY(0.5px)"`, applied to the glyph
at `:612`. The value is derived, not tuned by eye:
`(ascent − descent − capHeight) / 2 = (10 − 3 − 6) / 2 = 0.5px`.

**The nudge is on the glyph, not on the label, and that is the sibling-chip
decision.** Moving the label up would have aligned this chip and desynchronised
it from every other chip on the same card — `DYN` / `Deleted`
(`WorkflowEditorCanvas.tsx:914`, `:1309`), `ENTRY`, `GroupChipNode`'s node-count
badge, and `ValidationBadge`'s error/warning count — all of which are text-only
and therefore correctly box-centred today. Nothing about their text moved; the
only element that moved is the one glyph that was disagreeing with its own
label. There is no warning/info/success *chip* with an icon+label pair to keep
in step: the corner `NodeStatusBadge` is icon-only in a disc, and the count
badges carry digits with no icon.

### Evidence it is fixed

Same measurement after the change: icon box top 3.0, **icon centre 8.5, cap-band
centre 8.5 — delta 0.00px**.

---

## I5 — the "no output" card: destructive-red CTA, and an unexplained scope

Key file: `apps/frontend/src/features/workflow-builder/preview/NoOutputNotice.tsx`.

### What was wrong

- `NoOutputNotice.tsx:150-164` (before): the Re-run CTA was
  `variant="filled" color="red"` — computed style in the browser was
  `background rgb(130, 38, 35)` (`#822623`, the theme's `red-6`) with white
  text. Filled red is this UI's destructive treatment (it is what the Delete
  buttons in `DynamicNodeEditor`, `GroupNodeSettings` and `InputsSection` use);
  re-running deletes nothing.
- The alert was a tint with no border and an `IconAlertTriangle` — the B.C.
  Design System inline alert is a tinted panel with a 1px semantic border and,
  for *danger*, an exclamation-in-a-circle (the triangle is its *warning*
  icon).

### What changed

| line | change |
|---|---|
| `:153` | `bd="1px solid var(--mantine-color-red-4)"` — BC danger red `#CE3E39`, taken from the theme token (`src/theme/appTheme.ts` maps Mantine `red` to the BC DS red scale), not pasted as a hex |
| `:154` | icon `IconAlertTriangle` → `IconAlertCircle` (BC DS danger icon; triangle stays for *warning* states) |
| `:158` | first line bold-weight 600 → 700, per the inline-alert title |
| `:196-210` | CTA `variant="filled"` → `variant="outline"`, on `bg="var(--mantine-color-body)"`, right-aligned in a `justify="flex-end"` group with the Dismiss link to its left — the mock-up's layout |
| `:170` | the in-flight `<Loader>` lost `color="white"`, which was only right on a filled button |

Computed style after: `background rgb(255,255,255)`, `color rgb(130,38,35)`,
`border 1px solid rgb(130,38,35)`. That is the mock-up.

### The re-run scope question — answered: it restarts the WHOLE workflow

He asked: *"not sure if clicking Re-run workflow would re-run only this step or
complete workflow from start. If only this step, maybe 'Try again' might be
better."*

Traced end to end:

1. `StepFailedAlert.onRerun` (`NoOutputNotice.tsx:110-132`) calls
   `fetchInputCtx(workflowId, runId)` — `GET /workflows/:id/runs/:runId/input-ctx`,
   the **original input of the whole run**, not anything scoped to the failed
   node. `CacheEvictedAlert.tsx:196` says so explicitly: *"the input ctx is
   per-run, not per-node"*.
2. It then calls `startRunWithCtx(...)`
   (`preview/CacheEvictedAlert.tsx:158`), which POSTs
   `/api/workflows/:id/tries`.
3. Backend `WorkflowController.startTry`
   (`apps/backend-services/src/workflow/workflow.controller.ts:537`) delegates to
   `startLineageRun`, which validates `initialCtx` against the workflow's input
   schema and calls `this.temporalClient.startGraphWorkflow(...)` — **a brand
   new Temporal execution of the whole graph from its entry node.** The
   endpoint's own Swagger text: *"Same execution path as `POST /:id/runs`"*,
   differing only in the `RunTrigger` stamp.
4. There is no re-execute-one-step endpoint anywhere in the workflow
   controller.

**So "Try again" would have been the untrue label, and "Re-run workflow" is
kept.** Because a whole-workflow restart is *not* what a reader assumes from a
card sitting on one failed step, the card now says the scope in words rather
than leaving it to be inferred — `RERUN_SCOPE_NOTE` at `NoOutputNotice.tsx:71`,
rendered dimmed above the button at `:177`:

> Runs the whole workflow again from the start, with the same input.

Nothing else in the surrounding copy implies a per-step retry: the title
(`"This step failed — no output was produced to preview."`) and the reason line
describe the step, and the only action words on the surface are the button's.

### Sibling surfaces swept

Searched every `color="red"` in the preview / run / run-history panels for the
same recoverable-action-in-destructive-clothing pattern. One repeat:

- **`preview/CacheEvictedAlert.tsx`, `error` mode** (`:259-273`) — its Re-run
  button was `buttonVariant: "filled"` + `buttonColor: "red"`, reached when the
  re-run itself fails. Changed to `"outline"` (the `ModePresentation.buttonVariant`
  union at `:237` is now `"default" | "outline"`, so filled is no longer
  expressible), and its danger icon changed to `IconAlertCircle` to match. Its
  `idle` / `rerunning` / `retention-cleaned` modes were already neutral
  `"default"` buttons and were left alone.

Not changed, and why:

- `RunWorkflowDrawer.tsx:187/447/651/815` — red `Alert`s carrying an error
  message, no CTA inside them.
- `PreviewWidget.tsx:190` — red "Preview unavailable" alert, no CTA.
- `NodeStatusBadge` / `ClassificationPreview` filled reds — status discs and
  badges, not actions.
- Red buttons in `DynamicNodeEditor`, `GroupNodeSettings`, `InputsSection`,
  `NodeContextMenu`, `WireContextMenu` — Delete / Remove / Ungroup. Genuinely
  destructive; filled red is correct there and is what makes it meaningful on
  the recoverable surfaces.

---

## Tests

Added:

- `preview/NoOutputNotice.test.tsx` — *"draws the Re-run CTA as an outlined
  button, not the destructive filled red"* (asserts `data-variant`), and
  *"keeps the whole-workflow label and says the scope in the card"* (pins both
  the label and `step-failed-rerun-scope`).
- `preview/CacheEvictedAlert.test.tsx` — *"retries from an outlined button — a
  failed re-run is recoverable, not destructive"*.
- `canvas/WorkflowEditorCanvas.test.tsx` — *"nudges the chip's glyph onto the
  label's optical centre (I4)"*. jsdom cannot see the misalignment; the spec
  holds the correction in place, and the browser measurement above is what
  proves it correct.

Runs (`apps/frontend`):

```
npx vitest run src/features/workflow-builder/preview
  Test Files  13 passed (13)       Tests  267 passed (267)

npx vitest run src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx
  Test Files   1 passed (1)        Tests  218 passed (218)

npx tsc --noEmit -p tsconfig.json
  (clean)
```

## Notes on shared files

`canvas/WorkflowEditorCanvas.tsx` is being edited by another agent (canvas
re-render path). The edit here is confined to the `NodeFailureChip` block: one
new constant above it (`:568-591`) and one `style` prop on its glyph (`:612`).
Its test file gained one `it(...)` appended to the existing failure-chip
`describe`. Nothing else in either file was touched, and neither was
reformatted (both already fail a stock `prettier --check` at `HEAD`, so a
format pass would have produced a diff that was almost entirely not mine).
