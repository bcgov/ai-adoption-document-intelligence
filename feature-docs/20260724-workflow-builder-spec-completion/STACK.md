# The stack — how deep we are and how we get back out

**Purpose:** one page that shows every layer opened since the original ask, what closes each
one, and what order to unwind in. Update the status column; don't rewrite the history.

**Verified 2026-07-25:** branch `feature/visual-workflow-builder`, **464 commits ahead of
`develop`, 0 behind**. PR **#230** open as a draft. Gap register holds **106 entries**.

---

## Layer 0 — the original ask

> *"I want my manual testing to be like a walk in the gallery rather than stumbling through a
> bunch of bugs and issues and going back to fix them manually."*

**Exit criterion:** Alex walks the builder and it is uneventful.

**Status:** not yet met, but measurable for the first time. The 2026-07-25 walkthrough is the
first evidence we have either way — and it came back mostly clean, with 4 real defects and 4
broken checks.

---

## Layer 1 — spec completion (opened by Layer 0)

The hypothesis was that the builder was under-specified. Rather than write a spec first, we
inverted: discover what was unspecified, *then* specify only the proven territory.

| Item | Status |
|---|---|
| Design doc (`SPEC_COMPLETION_DESIGN.md`) | ✅ |
| Discovery plan (Phases 1–5) | ✅ |
| Four-oracle discovery → 154 findings → **106-entry** register | ✅ |
| Disposition gate over the 27 blocker/corroborated entries → **24 fix, 3 defer** | ✅ |
| 10 fix batches shipped | ✅ |
| G-104 (map-item wires), G-105 (Vite/source export) | ✅ |
| **The walkthrough of Parts 3–9** — this layer's stated acceptance criterion | ✅ 2026-07-25 |
| **~79 register entries never gated** (52 ungated + 14 proposed-defer + 12 proposed-won't-support) | ❌ open |
| Batch epic — G-023 (no batch concept), G-025 (single-file intake), G-006 (map >20 threshold) | ⏸ deferred by Alex |

**Exit criterion:** every register entry has a ruling, and everything ruled *fix* has shipped.
**Blocking gap:** the ~79 ungated entries. They carry each discovery pass's *proposed*
disposition and have never been reviewed.

---

## Layer 2 — opened by the walkthrough

| Item | Status |
|---|---|
| **G-106** — should a body node see producers outside its map? | ✅ ruled: **option A** |
| G-106 implementation | ❌ open |
| **P-1…P-4** — four test-plan checks that cannot fail | ❌ open |
| **D-1** — run history / replay show a fabricated `v0` | ❌ open |
| **D-2** — creating a group gives no feedback | ❌ open |
| **D-3** `<h4>` inside `<h2>`, **D-4** save toast drops the API's anchor | ❌ open |
| ~15 checks not reached (9.6, 9.9a–c, 9.10x, 5.3, 5.7, 6.1, 7.5–7.8, 8.3, 8.6, 8.11–8.14) | ❌ open |

**Exit criterion:** plan defects fixed, product defects fixed, remaining checks walked.

---

## Layer 3 — opened by discussing the walkthrough

Methodology, not product. Each traces to a concrete failure rather than a preference.

| Item | Status |
|---|---|
| Should we build a regression suite? → re-ranked to **5 coupling specs + page object** | ❌ open, sized to the G-106 ruling |
| **Cross-feature obligations** into `CLAUDE.md` (+2 graph-specific into workflow docs) | ❌ open |
| **Workflow conformance linter** + **shape-coverage report** | ❌ open |
| `writing-checks` skill (falsifiability, check-vs-description labelling) | ❌ open |

**Exit criterion:** the obligations are written where they fire upstream, and the linter runs
in CI.

**Why this layer exists:** the specs, plans, TDD and 25 e2e specs were all present and the
defects shipped anyway — because every artifact was written by the same mind from the same
understanding at the same time. All four items here target that, not the individual bugs.

---

## Orthogonal — the thing that grows while we work

**PR #230: 464 commits, open draft.** Not reviewable by a human in any meaningful sense, and
every day on this branch makes it worse. Independent of every layer above; must be decided
regardless of how they resolve. Machinery exists (`STACKED_PR_SPLIT_PLAN.md`, the
`split-branch-into-prs` skill) — the open question is land-as-is on the strength of the suites,
or split for review.

---

## Unwind order

Cheap-and-unblocking first, then the design decision that shapes the tests, then the tests.

1. **P-1…P-4** — plan defects. Cheap; they currently misreport coverage.
2. **G-106 implementation (A)** — determines what the tests must assert, so it precedes them.
3. **Tier-1 coupling specs + page object** — sized to what (2) changed.
4. **D-1** — the only walk finding with downstream consequences (replay + re-run key off it).
5. **D-2, D-3, D-4** — small, independent.
6. **Linter + shape coverage** — independent; pays for itself the next time the catalog moves.
7. **CLAUDE.md obligations** — ~15 minutes, independent.
8. **Gate the ~79 register entries** — the big remaining Layer 1 gap.
9. **Decide PR #230.**
10. **Walk the remaining ~15 checks**, then re-walk Parts 3–9 → closes Layer 0.
