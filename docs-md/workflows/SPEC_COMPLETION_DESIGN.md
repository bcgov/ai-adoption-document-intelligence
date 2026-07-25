# Workflow Builder — Spec Completion Design

**Date:** 2026-07-24 · **Scope:** MANUAL_TEST_PLAN Parts 3–9 (canvas, control-flow forms, typed I/O, auto-wire, port wiring, try-in-place/previews)

Design for a one-time effort to find and close the genuine specification gaps in the visual
workflow builder, so that a manual walkthrough of the authoring core surfaces zero functional
or UX findings — only subjective polish.

---

## 1. Problem

Manual testing of the workflow designer is finding a steady stream of gaps that get fixed
reactively. The last five commits on `feature/visual-workflow-builder` illustrate the pattern:

| Commit | What was missed |
|---|---|
| `fbc6c2dd` | `PreviewWidget` rendered "cache evicted" for *every* missing cache row; failed / didn't-run / branch-not-taken / control-flow-produces-nothing were never enumerated |
| `167f5d83` | Map body box sized from a flat 220×100 node footprint, so a wide port-row card spilled outside it |
| `39acd551` | childWorkflow Library↔Inline toggle discarded the authored graph; inline child was read-only; join required a separate manual "declare a variable" step; humanGate signal name was undiscoverable free text |
| `fc255284` | Seeded demos and shipped templates were wired to ports that do not exist |
| `f236e38e` | Cross-cutting typing correctness found only by a post-hoc review pass |

The hypothesis under test — that the solution was under-specified — is correct, but the
specific failure is not *volume* of documentation. There are 30 design documents in
`docs-md/workflow-builder/`, a 90 KB manual test plan with an automated coverage map,
77 frontend components, 108 unit specs and 25 Playwright specs.

### 1.1 Diagnosis: the docs are the wrong shape

The existing specs are **implementation-shaped** — one document per build wave
(`TYPED_IO_DESIGN`, `AUTO_WIRE_DESIGN`, `TRY_IN_PLACE_DESIGN`, `KIND_TAXONOMY_REFINEMENT_DESIGN`,
…). Each describes the feature that wave shipped. None describes, for a given surface, the
complete set of states it can be in, or, for a given author goal, the complete path to reach it.

`MANUAL_TEST_PLAN.md` was written **from** what got built. It is a mirror, not an oracle: it
can confirm the implementation matches itself, but it cannot fail on something nobody thought
of. Every gap above was invisible to it.

### 1.2 Evidence the diagnosis holds

A 90-second probe of the workflow-builder frontend for capabilities a visual editor is
normally expected to have:

- **No canvas-level undo/redo.** The only `undo|redo` matches in
  `apps/frontend/src/features/workflow-builder/` are inside `ConfusionMapEditor.tsx` and
  `ChildWorkflowNodeSettings.tsx`.
- **No node duplicate / copy / paste.**
- **No find-a-node** for navigating a large graph.
- Node deletion **does** exist and cascades (`canvas/NodeContextMenu.tsx`, keyboard +
  context menu) — with no undo behind it.

None of these appear anywhere in the 90 KB manual test plan — not as gaps, not as deferred
items, not as known discrepancies. They are structurally invisible to a plan derived from the
implementation.

### 1.3 Why invariants are not the answer

An early proposal was to generalise each fixed bug into an invariant and audit every surface
against it. This was rejected as the *primary* strategy: invariants are derived from a biased
sample (the bugs hit on the demo paths that happened to be walked), so they find siblings of
known bugs and are structurally incapable of surfacing a capability nobody has considered.

Invariants remain in the design, demoted to a **regression floor** (§6.3).

---

## 2. Goal and non-goals

**Goal.** Produce an oracle for Parts 3–9 that is independent of the implementation, use it to
find genuine design and implementation gaps, close the ones worth closing, and leave behind a
specification that future manual testing walks *against* rather than *alongside*.

**Acceptance criterion.** A manual walkthrough of Parts 3–9 produces zero functional or UX
findings — only subjective polish.

**Non-goals.**

- **Re-specifying what already works.** The 30 existing design docs stand. This effort writes
  spec only for territory the discovery passes prove is unspecified, plus a consolidation index
  over what exists (§5.6).
- **Parts 10–16** (library, versioning, workflow-as-API, sources, dynamic nodes, AI agent).
  Deliberately out of scope; the method is reusable there later.
- **Fixing everything found.** Findings pass a disposition gate (§6.1); `defer` and
  `won't-support` are first-class outcomes.

---

## 3. Architecture: inverted ordering

The conventional approach — write the full spec, then diff it against the implementation — is
rejected on two grounds. It costs weeks re-describing behaviour that 30 documents already
describe, and a spec written from the same head that built the system reproduces the same blind
spots.

Ordering is inverted: **discover first, specify second.**

```
  Domain & surface inventory            shared vocabulary, ~1 page
              │
   ┌──────────┼──────────┬──────────┐
   B          D          A          C   four independent oracles, run in parallel
   │          │          │          │
   └──────────┴────┬─────┴──────────┘
                   │
          Merge · dedupe · rank          corroboration across passes = priority signal
                   │
        ┌──────────┴──────────┐
   Gap register        Behavioral spec   spec covers only newly-discovered territory
   (fix/defer/won't)   (+ consolidation) plus an index over the existing docs
                   │
     Implement · test · regression floor
                   │
     MANUAL_TEST_PLAN regenerated FROM the spec
```

The passes tell us *where* specification is missing. Spec is then written for that territory
only. This is the difference between a two-week effort and a two-month one, and it yields a
better spec because the territory was found by an oracle rather than by recall.

---

## 4. The four oracles

Each is independent of the implementation and of the other three. Each runs as one subagent
against the shared inventory, with a fixed output schema (§4.5). **Discovery only — no code
changes, no fixes.**

### 4.0 The shared inventory

Built first, in one head, because four passes inventing their own vocabulary produces findings
that cannot be merged. Contents:

- **Artifacts** — every authored object: node types (activity, six control-flow, source,
  dynamic), ports, kinds and their family tree, bindings, ctx keys, edges (normal / conditional
  / error), groups and exposed params, workflows, versions, runs, cache rows.
- **Surfaces** — every UI surface in Parts 3–9 that renders or edits an artifact, with its
  component path.
- **Dependency edges** — which artifact depends on which, the input D consumes directly.
- **State sources** — every enum a surface can render (run status, validation severity, binding
  state, auto-wire state), the input C consumes directly.

Naming in the inventory is authoritative; all four passes cite it.

### 4.1 Pass B — Editor-environment obligations

The builder is a programming environment. Programming environments carry a known duty roster.
Audit every Parts 3–9 surface against it:

CRUD · undo/redo · duplicate · copy/paste · multi-select operations · find & navigate ·
refactor (rename, extract, inline) · inspect & debug · error recovery · diff & compare ·
concurrent editing · keyboard access.

For each obligation: **present / partial / absent**, with evidence. Absent-and-reasonably-expected
is a finding. Three confirmed hits before the pass starts (§1.2).

Cheapest high-yield oracle; produces capability-level findings that no bug-derived method reaches.

### 4.2 Pass D — Mutation & cascade

**Owns the change/delete axis outright.** For every dependency edge in the domain model —
node→binding, binding→ctx key, group→member, catalog→port kind, version→reference, run→cache —
specify what happens when the upstream mutates or disappears.

A finding is any edge where behaviour is undefined, silently destructive, or leaves the graph
invalid with no recovery path.

This is where the observed "stumble" bugs live: the `exposedParams` pruning fix and the
dynamic-node slug tombstone were both cascade findings discovered one at a time.

### 4.3 Pass A — Author journeys

Six to eight goal-first journeys drafted from real workloads — mixed and encrypted PDFs,
keyword-based splitting, per-page OCR, classification, low-confidence routing to human review —
**written before consulting the UI**, then walked against it.

A finding is any wall, and any step a competent author would not guess.

**This pass requires user input.** Journeys are drafted from observable workloads, then
red-penned by Alex before the walk. Un-corrected journeys are plausible fiction and the walk
against them is worthless.

### 4.4 Pass C — Domain cross-product (static cells only)

Scoped explicitly **off** the mutation axis, which D owns — otherwise the two passes return the
same findings in different words.

Enumerate and mark every cell **specified / unspecified / won't-support** across:
control-flow nesting combinations · port-kind × binding-state · run-status × every surface that
renders it · validation severity × anchor target.

Highest volume, lowest density. Its distinctive output is the **won't-support** cells, which
become the non-goals register (§5.5).

### 4.5 Shared finding schema

So the merge is mechanical:

```
id            stable identifier, prefixed by pass
pass          B | D | A | C
title         one line
severity      blocker | major | minor
type          design-gap | impl-gap | non-goal
evidence      file:line, or reproduction steps
surfaces      affected surfaces from the inventory vocabulary
disposition   proposed: fix | defer | won't-support
rationale     why that disposition
```

Findings corroborated by multiple passes rank highest — independent discovery is the strongest
available priority signal.

---

## 5. Deliverables

### 5.1 Surface contracts

One per surface in Parts 3–9: canvas, node cards, settings panels (per node type), variable
picker, validation drawer, preview widget, run drawer, wire menus.

Each states: purpose · **complete** state enumeration · affordances · keyboard access · copy for
every non-happy state.

This is the artifact that makes "cache evicted for everything" structurally impossible.

### 5.2 Cascade table

From D. Every dependency edge with its defined behaviour on upstream mutate/delete. No such
table exists today, which is why each cascade bug has been discovered individually.

### 5.3 Capability roster

From B. What the editor supports, what it deliberately does not, and why. Undo, duplicate and
find land here as explicit decisions rather than accidental absences.

### 5.4 Journey specs

From A, post-correction. Canonical acceptance narratives; also the source for e2e scenarios.

### 5.5 Non-goals register

From C. The won't-support cells, written down — as valuable as any fix, because it stops the
same non-decision being rediscovered months apart.

### 5.6 Consolidation index

Maps the existing 30 `docs-md/workflow-builder/` documents into the structure above, so nothing
is orphaned and there is one entry point instead of thirty.

### 5.7 Regenerated manual test plan

**The change that matters most.** `MANUAL_TEST_PLAN.md` stops being hand-maintained and is
derived from the spec.

Today it mirrors the implementation, so walking it can only confirm what was already built.
Derived from the spec, walking it checks *specified* behaviour — and a gap becomes a failed
checkbox rather than a surprise.

---

## 6. Closing the gaps

### 6.1 Disposition gate

The passes will find more than is worth building. Every finding is dispositioned
`fix` / `defer` / `won't-support` — recommended by the implementer, **approved by Alex** —
before any implementation starts. Without this gate the effort has no natural end.

### 6.2 Tests at the cheapest reliable level

Matching the existing tier structure:

| Finding shape | Test level |
|---|---|
| State matrices, pure logic, geometry math | Unit (Vitest / Jest) |
| Form and panel behaviour | Component (Vitest — where the existing 108 specs live) |
| Gestures needing a real browser | e2e tier2 (CI) / tier3 (`@infra`) |

Not every finding warrants a Playwright spec. Pretending otherwise is how suites become slow
and flaky — a failure mode this suite has already hit once (`DEMO_E2E_REVIEW_20260711.md`,
finding 5).

### 6.3 Regression floor

For each gap **class** closed, one cross-surface check so it cannot silently reopen. Examples
drawn from already-fixed bugs:

- Every "unavailable" surface branches on cause; every reason the data model can produce maps
  to distinct copy, and adding a new reason fails the test until handled.
- Container geometry derives from the renderer's own size function, never a hard-coded footprint.
- No mode toggle discards authored state — one generic harness walking every settings form with
  a mode/variant toggle.
- Every seeded demo and shipped template loads badge-clean through the real validator.

This is where the invariant idea belongs: as a consequence of the work, sized to what was
actually found — not as the gap-finding strategy it was never good at.

---

## 7. Execution sequence

1. **Domain & surface inventory** — built in one head to keep the vocabulary consistent.
2. **Fan out B, C, D** as parallel subagents against the inventory.
3. **In parallel:** draft the A journeys → Alex red-pens → launch A.
4. **Merge, dedupe, rank** by corroboration → gap register.
5. **Disposition gate** — Alex's call, per finding.
6. **Write the spec** — newly-specified territory + consolidation index.
7. **Implement + test** the `fix` items.
8. **Regenerate `MANUAL_TEST_PLAN.md`** from the spec; add the regression floor.

Steps 1–4 are the discovery investment. Step 5 is where the size of everything downstream is
controlled.

### 7.1 Locations

| Artifact | Location |
|---|---|
| This design | `docs-md/workflow-builder/SPEC_COMPLETION_DESIGN.md` |
| Pass outputs, gap register | `feature-docs/20260724-workflow-builder-spec-completion/` |
| Spec artifacts (§5.1–5.6) | `docs-md/workflow-builder/` |
| Regenerated test plan | `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Discovery finds more than can be built | Disposition gate (§6.1); `defer` and `won't-support` are first-class |
| D and C return the same findings twice | C explicitly scoped off the mutation axis (§4.4) |
| A journeys are plausible fiction | Mandatory red-pen by Alex before the walk (§4.3) |
| Pass findings use incompatible vocabulary | Shared inventory built first (§7 step 1); fixed finding schema (§4.5) |
| Spec becomes another unmaintained document | Test plan derived from it (§5.7), so drift shows up as a failing walkthrough |
| New e2e specs slow or destabilise the suite | Cheapest-reliable-level rule (§6.2) |

---

## 9. Open items

- `CLAUDE.md` references a `docs-md/README.md` taxonomy file that does not exist. Not blocking;
  worth creating or correcting the reference separately.
