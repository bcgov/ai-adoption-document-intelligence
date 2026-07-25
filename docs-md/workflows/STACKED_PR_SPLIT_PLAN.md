# Stacked PR Split Plan — `feature/visual-workflow-builder`

Status: **planning / for review.** Nothing has been split yet. This document
captures the agreed plan so it can be reviewed before execution.

---

## 1. Why split

The branch is a single long-running line of work spanning ~8 phases of the
visual workflow builder. Measured against the intended base (`develop`):

- **185 commits**, **~781 files**, **~139K insertions** ahead of `develop`
  (merge-base `0a131f96`).

That is far too large to review as one PR. The work was, however, built in
clean dependency-ordered phases, each closed out with an end-to-end Playwright
walkthrough — so the history already has natural cut points. The plan is to
carve it into a **stack of phase-aligned PRs**, each independently reviewable
and each with its own tests green.

---

## 2. Base branch

- **Target `develop`, not `main`.** `develop` is the integration branch; the
  alerting/monitoring/CHES work at the base of this branch is already merged
  there. Diffing against `main` would re-surface 150+ unrelated `develop`
  commits.
- **Prerequisite: the branch is currently behind `develop`** (`develop` is not
  an ancestor of HEAD). Rebase or merge `develop` into the branch **before**
  cutting the stack, so each PR diffs cleanly.

---

## 3. Review fixes already applied (must be relocated into the stack)

During the pre-split review, fixes were committed **on top of the branch**, each
tagged with the phase it belongs to (`pX-…`) precisely so they can be moved onto
the right PR at split time. Commit **subjects are stable; resolve SHAs at
execution** (`git log --oneline`), as hashes drift on rebase.

| Commit subject (tag) | Relocates to |
|---|---|
| `fix(p1-foundation): validator rejects structurally-incomplete condition expressions` | PR 1 |
| `refactor(p1-foundation): extract useHoverExtend from WorkflowEditorCanvas` | PR 1 (or the trailing polish PR) |
| `fix(p3-typed-io): correct storeResults ocrResult binding in multi-page template` | PR 3 |
| `fix(p6-dynamic-nodes): wire deno-runner deploy config + fail-closed egress` | PR 6 |
| `docs(p6-dynamic-nodes): record review hardening + accepted risk` | PR 6 |
| `fix(p7-ai-agent): validate + document chat surface; fix latent agent.service bugs` | PR 7 |
| `test(p7-ai-agent): SWC transform for agent specs + bound jest workers` | PR 7 (the jest-worker cap is general infra — could also lead the stack) |
| `test(workflow-builder): repair pre-existing controller spec drift` | **spans PR 4 (workflow.controller) + PR 6 (dynamic-nodes, activity-catalog)** — split this commit across those two PRs, or land in the earliest of them |

Note: the `fix(deps): resolve zustand…` commit is separate dependency work, not
part of this review; place it wherever the frontend deps land (≈ PR 1).

---

## 4. The stack (phase → PR)

Cut points are the phase **closeout commits** (stable; resolve current SHA with
the grep shown). Sizes are approximate (measured pre-fixes) and indicate review
burden.

| PR | Scope | Cut at (closeout subject) | ~Size | Notes |
|----|-------|---------------------------|-------|-------|
| 1 | Canvas foundation (Phase 1A + 1B): xyflow V2 canvas, catalog-driven palette, switch/case edges, validation-rule editors, auto-layout, context-menu + node-swap, hover-extend, group editing | `…refresh session handoff post-Phase-1B closeout` | 242f / 42K / 50c | **Too big — sub-split** (1A canvas vs 1B features). Also deletes the old editor. |
| 2 | Library workflows + workflow-as-API + versioning UI (Phase 2, all 3 tracks) | `…post-Phase-2-Track-3 closeout` | 99f / 10K / 19c | Clean. |
| 3 | Typed I/O artifacts (Phase 3): `ArtifactKind` registry + `isAssignable`, kind-coloured handles, typed catalog | `…Phase 3 closeout` (+ the catalog fan-out commit just after) | 113f / 9K / 12c | Clean. The typed-I/O validation that this PR introduces is what surfaced the template fix above. |
| 4 | Try-in-place + caching + per-node previews (Phase 4): activity-output cache, status streaming, preview widgets, run history/replay | `…close Phase 4 with end-to-end…` | 149f / 21K / 12c | Large but cohesive. |
| 5 | Document sources as nodes (Phase 8): `source.api`/`source.upload`, upload endpoints, source palette/settings | `…Phase 8 closeout` | 75f / 11K / 14c | Clean. (Phase 8 predates Phase 4 in history — keep that order or reorder; verify either way.) |
| 6 | Dynamic nodes + Deno sandbox (Phase 6): `deno-runner`, signature parser, Temporal `dyn.run`, in-app Monaco editor | `…Phase 6 closeout` | 172f / 21K / 20c | **Security-sensitive — review in isolation.** Carries the p6 hardening fixes. |
| 7 | AI agent (Phase 7) + UX polish + auto-wire | branch tip (`Add workflow builder simplified view…`) | 145f / 24K / 49c | **Phase 7 and the polish/auto-wire work are interleaved in history** — a clean SHA cut isn't perfect; expect light reordering or a combined "Phase 7 + polish" PR. Carries the p7 fixes. |

Each PR targets the previous PR's branch (a true stack) — or, if you prefer
non-stacked, each targets `develop` and is merged in order.

---

## 5. How to execute (mechanical)

Because the cuts are exact commit boundaries, **no cherry-pick is needed for the
phase bodies** — just branch at each closeout SHA:

```bash
git fetch origin
# 0. rebase the branch onto current develop first (prerequisite)
# 1. resolve current closeout SHAs (subjects are stable; hashes drift):
git log --oneline origin/develop..feature/visual-workflow-builder \
  | grep -iE 'post-Phase-1B closeout|Track-3 closeout|Phase 3 closeout|close Phase 4|Phase 8 closeout|Phase 6 closeout'
# 2. create one branch per cut:
git branch wb-1-foundation   <phase-1b-closeout-sha>
git branch wb-2-library-api  <phase-2-closeout-sha>
# …one per phase…
# 3. relocate each pX-tagged review-fix commit onto its phase branch
#    (cherry-pick; they are small + file-local, so conflicts are unlikely)
# 4. open each PR with base = the previous branch (stacked) or develop
```

A repo skill, **`split-branch-into-prs`**, automates sequential draft PRs to
`develop`; the manual SHA-cut above gives more control over boundaries. Either
is viable.

---

## 6. Caveats / risks

- **Rebase onto `develop` first** — the branch is behind it.
- **PR 1 is 42K lines** — sub-split (foundation vs features) before opening.
- **PR 7 / polish / auto-wire are interleaved** — not a clean single cut.
- **`test(workflow-builder): controller spec drift`** touches files owned by
  PR 4 *and* PR 6 — split that one commit across both PRs.
- **`packages/graph-workflow/dist` is gitignored** and auto-built on
  `npm install` (graph-workflow `prepare`). Don't commit it; just ensure each
  PR's CI runs the build. (A stale local `dist` was what hid several failures
  during the review.)
- **Verify each PR independently** — run its package's tests after cutting, so
  no PR ships red.

---

## 7. What the final result should look like

- **~7 stacked PRs** (PR 1 likely sub-split → ~8), all targeting `develop`, in
  dependency order, each:
  - independently reviewable (≤ ~10–20K lines where possible),
  - with its tests green on its own,
  - carrying the relevant `pX-` review fixes folded in (so no PR knowingly ships
    a bug "fixed two PRs later"),
  - documented by its phase's `feature-docs/` design + closeout notes (those
    ride along with their phase).
- The original branch becomes redundant once the stack is merged; delete it.

---

## 8. Open decisions to settle in review

1. **Merge model:** incremental (each PR merges to `develop` as approved) or
   all-at-once (whole stack approved, then merged together)? This decides
   whether the `pX-` fixes *must* be in-phase (incremental) or could ride a
   trailing commit (all-at-once).
2. **Sub-split PR 1?** (foundation vs 1B features) — recommended given size.
3. **PR 7 shape:** one combined "Phase 7 + polish + auto-wire" PR, or untangle
   into two? (History is interleaved.)
4. **Keep Phase 8 before Phase 4** (history order) or reorder to chronological
   phase numbers?
5. **Who reviews which** — the security-sensitive PR 6 (Deno sandbox) likely
   warrants a dedicated reviewer.

---

*Companion: see [DYNAMIC_NODES_DESIGN.md](DYNAMIC_NODES_DESIGN.md) §5.4 for the
Phase 6 security posture + accepted risk recorded during this review.*
