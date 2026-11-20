# Demo & E2E Review — 2026-07-11

A full review pass over the workflow-builder feature demos (`FEATURE_DEMO_GUIDE.md`)
and the Playwright e2e suite (`tests/e2e/workflow-builder/`): every demo was opened
headlessly and inspected visually (screenshots at 2× DPR), the full suite was run
(hermetic + `@infra`), gaps were closed, and the cosmetic issues found were fixed.

## What was verified

- **All demos load and render** — every `🎯 Demo —` workflow opened via its guide
  link past the auth gate, canvas mounted, nodes/edges/groups/diamonds/error edges
  all painted as the guide describes. The guide now has **14** entries (Part 14
  dynamic-node demo added, see below).
- **E2E suite** — full run (`RUN_INFRA=1`, DB-reset skipped): **45 passed** on the
  first pass with 9 failures, *all* sharing one signature (30 s canvas-mount
  timeout). Re-run in isolation: 14/15 passed — the failures were resource
  contention from 13 concurrent headless-Chromium screenshot sessions competing
  with the test browsers, plus the backend rate limiter (finding 5 below).
  **Final verified state: all 59 tests pass in one full parallel run
  (`RUN_INFRA=1`, 49 s)** — including the 4 new tests added in this pass.

## Cosmetic issues found & fixed (vision pass)

| Issue | Fix |
|---|---|
| Connection handles ("dots") nearly invisible — xyflow's default 6×6 px | `workflow-editor-canvas.css`: 12×12 px + 2 px body-colour ring, scoped to `.wb-editor-canvas` so the read-only `GraphVisualization` keeps defaults. Also a bigger drag target. |
| **Cleanup** node wrapped onto a second row in the Typed I/O demo | Seeder position fix — `clean` now continues the row at `(1040, 120)`. |
| Red **unsatisfied** dots on `Store Results` / `Cleanup` / `Wait until condition` in demos that should read clean/Valid | `ocr.storeResults` requires an `ocrResult` (kind `OcrResult`) input, `ocr.cleanup` requires `ocrResult`, `azureOcr.poll` requires `apimRequestId` — none were bound. The seeder now binds them explicitly (locked bindings) in every demo where the dot is noise. Demos that *demonstrate* the dots (auto-wire Part 8) keep them. |
| `Normalize B` (ambiguous-picker demo) carried its own red dot, distracting from the amber ambiguous dot the demo is about | Bound its `blobKey` input in the seeder. |
| Graphs rendered small — `fitView` padding 0.25 wasted ~½ the viewport | Padding tightened to **0.15** everywhere (initial fit, node-add refit, auto-arrange refit) + test expectations updated. |

Non-issues (checked, deliberately left):
- **"Preview unavailable" chips** on load were an artifact of my scripted sessions
  (429/401 on the preview-cache fetch → error state). Real sessions get 404 →
  silent. No change.
- **`□` tofu before node headers / demo names** — missing emoji font in headless
  Chromium only; renders fine in a desktop browser.
- The grey box bottom-right is the **minimap** — intentional.

## Real bugs found & fixed

1. **False "Activity type `dyn.<slug>` is not registered" validation error**
   (`apps/frontend/.../validation/useGraphValidation.ts`). The client-side
   validator checked the *static* `ACTIVITY_CATALOG` only, so every workflow using
   a published dynamic node showed a red "1 issue" badge while the palette/canvas
   rendered it fine. Now it consults the merged catalog
   (`useActivityCatalog`) and gives `dyn.*` the benefit of the doubt while the
   catalog is still loading. (Found by seeding the new Part 14 demo; all 982
   frontend unit tests pass.)
2. **`@infra` try-spec timeout budgets** — `tier3-try-preview` declared 60 s
   per-assertion waits inside Playwright's default 30 s per-test budget; under
   parallel-worker load the whole test timed out before its own waits could.
   `test.describe.configure({ timeout })` now gives `tier3-try-preview` 180 s and
   `tier3-try-infra` 90 s. (The spec passes in isolation in ~8 s.)
3. **Preview widget locks into "Preview unavailable" on a transient 429/5xx**
   (`useActivityOutputPreview.ts` had `retry: false` across the board). Under
   full-suite parallel load the backend rate-limiter 429'd one preview fetch and
   the widget stayed red forever. The hook now retries **only** 429/5xx (3
   attempts, exponential backoff); 404 still normalises to `null` and
   non-transient errors (401/403…) still surface immediately. Unit tests updated
   + a new 429-retries-then-succeeds test.
4. **Flaky canvas node selection under CPU load** — the e2e POM's `selectNode`
   read node coordinates once and clicked; when the fitView animation was still
   moving nodes the click hit empty pane and the test hung for its whole budget.
   `WorkflowEditorPage.selectNode` now re-reads coordinates and re-clicks (up to
   3 × 5 s) before failing.
5. **Full-suite 429 storms** — the root cause behind the recurring full-suite
   flakes (and only there): Playwright's default local parallelism is
   `cores/2` (10 on this box), all workers are `localhost`, and the backend's
   global throttle is 100 req/min/IP. Editor pages fire config + catalog +
   per-node preview/status fetches, so a 59-test run reliably trips the
   limiter — previews error out, interactions stall, and the same tests fail
   while passing in isolation every time. Even 6 workers still tripped it (56
   tests in ~48 s is >100 req/min regardless of concurrency), and the failure
   snapshot showed every node wearing a red "Preview unavailable" alert —
   which also changes node geometry enough to break click-selection. Two
   changes: local workers capped at **6** in `playwright.config.ts`
   (`PLAYWRIGHT_WORKERS` overrides), and **`THROTTLE_GLOBAL_LIMIT=2000` added
   to `apps/backend-services/.env`** (local only, gitignored; production keeps
   the code default of 100/min). Documented in the e2e README.

## Product findings

- **Soft-deleted dynamic-node lineages reserved their slug forever** — `POST` →
  `409 DUPLICATE_SLUG`, `PUT` → 404, no restore path, so anyone who deleted a
  dynamic node could never republish under that name. **FIXED (follow-up batch,
  see below):** create-mode now restores a soft-deleted lineage (clears the
  tombstone, appends the next version preserving history); a live collision
  still 409s. The seeder's `-N` suffix workaround was removed and the demo node
  is back to the stable slug `demo-uppercase`.
- The **429 rate limit** is easy to hit from scripted/burst navigation and turns
  the per-node preview widgets into red "Preview unavailable" alerts; partially
  addressed by the preview-hook retry (finding 3) — a quieter degradation on the
  canvas would still be friendlier.

## Follow-up batch (post-review improvements)

Working through the high-impact suggestions from the review's conclusion.
Batch one ("authoring friction"):

1. **Dynamic-node slug tombstone → restore-on-republish** — DONE. Create-mode
   (`DynamicNodeRepository.createWithFirstVersion`) now, in one transaction:
   creates fresh when the slug is free, **restores** when it's a soft-deleted
   tombstone (clear `deletedAt` + append `maxVersion+1` + move head), and still
   throws `DuplicateSlugError` on a live collision. TDD (repository spec) +
   verified live against the dev DB's real `demo-uppercase` tombstone (POST →
   201 `version:2`; re-POST while live → 409). Seeder suffix workaround removed.

2. **Actionable status dots** — DONE. The red/amber auto-wire dots were
   unexplained specks that, on click, dropped you at a generic panel. Now:
   - **Tooltip** — hovering a dot explains the problem and counts it
     (*"2 inputs need a source — click to fix"* / *"Ambiguous input source —
     click to choose a producer"*), set as the dot's `aria-label` for a11y.
   - **Deep-link on click** — selects the node AND opens the source picker for
     the first unresolved port: ambiguous → the producer list to disambiguate;
     unsatisfied → the *"add a producer"* guidance. One click from speck to fix.

   Implementation: `computeNodeInputIssues` (new, returns the problem-port list
   driving both count and target), a `tooltip` prop on `NodeStatusDot`, a
   `focusPort` prop on `InputsSection` that **derives** the picker-open state
   from the prop (not a mount effect — an effect that cleared the parent signal
   lost it under React StrictMode's double-mount), and an `onFixNodeInput`
   signal threaded canvas → V2Page → panel. TDD: `computeNodeInputIssues`,
   `NodeStatusDot` tooltip, `InputsSection` focus/clear (10 new unit tests, all
   992 frontend unit tests pass) + a new `tier2-autowire` e2e (dot tooltip +
   click-opens-picker) + manual browser verification on both demos.

   *Scoped out (per your call):* folding auto-wire issues into the validation
   drawer / top-bar "problems" count stays a separate item. *Known minor:*
   opening a picker via a dot then clicking away to another node **without**
   closing it leaves the deep-link armed, so revisiting that node re-opens the
   picker (the normal open→pick/close flow clears it). Left as-is because the
   defensive "clear on navigate-away" effect raced xyflow's selection churn and
   broke the main flow.

3. **Inline ctx-key creation** — DONE. The friction was worse than the review
   assumed: an undeclared ctx key on a **port binding** is a save-blocking
   `severity:"error"` (validator.ts:678), so binding a port to a new key and
   hitting Save *failed* until you detoured to Workflow Settings to declare it.
   Now the `VariablePicker` shows an inline **"+ Create variable 'foo'"** button
   whenever the typed text is a valid new identifier not already an option;
   clicking it declares `config.ctx.foo = { type: "object" }` in place and Save
   succeeds. (A button beneath the input, not a dropdown row — Mantine's
   free-text `Autocomplete` fires `onChange` with the raw string, so a synthetic
   action row would set the value to the action text.)

   Implementation: `declareCtxKey(config, key, type="object")` (pure, no-op if
   already declared), an optional `onCreateCtxKey` prop on `VariablePicker`
   (rendered in both the legacy and typed-I/O paths), wired through every
   consumer that owns `config`+`onConfigChange`: the **advanced port-bindings
   editor** (the save-blocking case — threaded through
   AdvancedBindingsToggle → PortBindingsFooter → PortBindingsEditor), **Map**
   and **Join** control-flow settings, and the **condition Ref editor** (threaded
   through the recursive `ConditionExpressionEditor` tree and its Switch/PollUntil
   parents). TDD: `declareCtxKey` (5) + `VariablePicker` create button (5) — 1002
   frontend unit tests pass — plus a `tier1-node-config` e2e proving the full
   round-trip (bind a port to a new key → Create → Save persists with the ctx
   declared) and manual browser verification. Type defaults to `object` (refine
   in Workflow Settings) per your call.

   *Nice side effect:* the button also surfaces pre-existing undeclared keys
   (e.g. a demo's `docIndex` map index key) as a one-click fix.

---

## Follow-up batch two (diagnostics) — DONE

Prompted by a user report: a **red dot behind the gray top-right circle**. Root
cause: every node has a **run-status badge** (top-right — gray "pending" when
idle, blue/green/red/violet during a run) AND a **validation badge** (error/
warning count), and both were positioned in the same top-right corner with the
run badge stacked on top — so a node's red/amber problem count was hidden behind
the gray run circle. Two changes:

1. **Overlap fix.** The per-node problems badge moved to the **top-left**;
   the run-status badge stays **top-right**. They can no longer collide.

2. **Unified "problems" surface (folded the auto-wire dots in).** The separate
   red/amber auto-wire status dot is gone. Unbound / ambiguous inputs now fold
   into the **same** validation surface as reachability warnings:
   - `autoWireIssuesToValidationErrors(config)` projects them to
     `GraphValidationError[]` (warning severity, anchored
     `nodes.<id>.inputs.<port>`); `useGraphValidation` concatenates them, so
     they feed the top-bar count, the one per-node badge, and the drawer for
     free. A port with an explicit manual ctx binding is treated as *satisfied*
     (it has a source) — no false positive.
   - **Deep-link preserved and made robust.** Clicking a node's problems badge
     (or its drawer entry) for an input issue opens that input's source picker.
     This surfaced a **long-standing bug**: programmatic node selection didn't
     stick (xyflow reasserts its own empty selection), which is why clicking a
     drawer entry never actually focused its node. Fixed by selecting through
     the ReactFlow **instance** (`setNodes`) so xyflow's own store updates — now
     both the badge and any drawer entry reliably jump to their node/fix.

   Result: one problem indicator per node (top-left), one count, one drawer;
   the run-status circle (top-right) only carries meaning during a run.

   TDD: `autoWireIssuesToValidationErrors` (5), `ValidationDrawer` deep-link (2),
   `NodeStatusDot` removed — 1004 frontend unit tests pass — plus updated
   `tier2-autowire` (dot→badge), a clean `tier2-validation`, and the full
   `@infra` e2e suite green (62). *Bonus the overlap fix revealed:* real
   reachability warnings that were previously hidden behind the run badge (e.g.
   an unreachable second-root node) are now visible.

## Batch-three (DONE)

The user declined the design/run mode split for now; the other three items
were implemented on their own.

1. **Idle run-status badge suppressed at design time** — DONE. The gray
   "pending" dot that every node wore before any run is gone: both
   `NodeStatusBadgeOverlay` and `GroupAggregateStatusBadgeOverlay` now render
   nothing until `RunStateContext.activeRunId` is set (a live Try or a replay).
   During a run the badges behave exactly as before. This also removes the
   last source of the top-right corner clutter that motivated moving the
   problems badge to the top-left in batch two. TDD (`NodeStatusBadge.test.tsx`).

2. **Batched per-node preview-cache endpoint** — DONE. The editor mounts a
   preview widget on **every** node, so the per-node
   `GET /:id/preview-cache?nodeId=…` fired one request per node on every load —
   an O(nodes) request storm that was the real driver behind the 429 class of
   problems (not just parallel e2e workers). New
   `GET /:id/preview-cache-batch[?runId=]` returns a `{ previews: { nodeId → row } }`
   map in one round-trip; `useActivityOutputPreview(nodeId)` now reads a single
   shared TanStack query and picks its node's row via a per-observer `select`, so
   N widgets cost **one** request (and one refetch on transition). The per-node
   endpoint is untouched (still used by the cache-evicted Re-run flow). TDD:
   repository (`findManyMostRecentFresh` / `findManyInRunWindow` + dedupe),
   controller (batch scenarios incl. unknown-run → empty map), and the rewritten
   `useActivityOutputPreview` / `PreviewWidget` unit tests.

3. **Stable / slug-based editor links** — DONE. `WorkflowLineage.slug` already
   existed (auto-derived, stable across reseeds); this exposes it. New
   `GET /api/workflows/by-slug/:slug[?groupId=]` resolves a slug (scoped to the
   caller's groups) to the workflow, and a new frontend route
   `/workflows/by-slug/:slug/edit` (`WorkflowBySlugRedirect`) resolves + redirects
   to the canonical `/workflows/:id/edit`. The feature-demo seeder now emits
   `by-slug` links, so demo links survive a reseed (the lineage id churns, the
   slug does not). TDD across service, controller, and the redirect component.

> **Note:** the committed `FEATURE_DEMO_GUIDE.md` still shows id-based links until
> the next `npm run seed:demos` run regenerates it with the slug links.

## Coverage gaps closed (new e2e)

| Plan item | New coverage | Where |
|---|---|---|
| 11.1/11.2 — Run drawer renders trigger URL, declared schema, sample curl, auth notes | e2e (browser) | `tier2-run-drawer.spec.ts` (new file) |
| 13.6 — upload-source workflow shows dropzone, no API tabs | e2e | `tier2-run-drawer.spec.ts` |
| 13.2/13.3 — SourceNodeSettings UI + `maxFileSizeMB` edit round-trip | e2e | `tier2-sources.spec.ts` (new browser describe) |
| 6.7 — More ▸ Auto-arrange spreads a stacked graph left-to-right + persists | e2e | `tier2-node-swap-grouping.spec.ts` |
| 4.2 — map full form values + `maxConcurrency` round-trip | e2e | `tier2-control-flow.spec.ts` |
| Part 14 editor surface — palette DYN entry, DYN pill, Edit script | **demo** (seeder now publishes `demo-uppercase` best-effort; skipped with a console note when the deno-runner is down) | `scripts/seed-feature-demos.mjs` |

All new tests are deterministic (no Temporal run started) and run in default CI.

## Assumptions / judgement calls made

1. **Handle size 12 px with a 2 px ring** — no design spec existed; chosen to be
   clearly visible at typical zoom without overpowering the 28 px-tall nodes.
   Scoped to the editor only.
2. **`fitView` padding 0.15** (was 0.25) — judgement call on "graphs render too
   small"; all three fit paths kept consistent.
3. **Binding demo inputs to declared-but-unwritten ctx keys** (e.g.
   `ocrResult: { type: "object" }`) — these demos are design-time showcases, not
   runnable pipelines; a locked binding that silences the red dot was preferred
   over restructuring each demo into a fully-runnable chain.
4. **Dynamic-node demo is best-effort** — seeding it needs the deno-runner
   (publish toolchain). When the runner is down the seeder logs a skip note and
   the guide footer says Part 14 isn't seeded, instead of failing the whole run.
5. **`@llm` tier not run** — costs real tokens; the agent demos stay manual per
   the existing guide footer.
6. **Suffix fallback for the demo dyn-node slug** rather than tombstone cleanup —
   see the product finding above.

## Residual manual-only items (unchanged)

Deeper control-flow editing (4.4 childWorkflow mappings, 4.5 pollUntil nested
params), 6.1/6.2/6.5 (rich widgets, group-creation gesture, hover-extend), 7.4–7.8,
8.7, Part 9 run history/replay/cache-evicted UI, 12.4/12.5, 14.8–14.10 via UI,
15.4–15.10, Part 16 polish. See `MANUAL_TEST_PLAN.md` §1.7 for the authoritative
map (updated in this pass).
