# Gap register — decision sheet

Collapses the 76 ungated entries in [GAP_REGISTER.md](GAP_REGISTER.md) into a small number of
rulings. Ordered so the cheapest decisions come first.

**Read this first:** gating is two jobs, not one, and they were conflated.

1. **Is this still true?** — mechanical verification. Mine to do.
2. **What should we do about it?** — the ruling. Yours.

Ruling on a stale entry wastes your time, so every batch below states its verification status
plainly. Batches A and B are rulable now. Batch D is not, and says so.

## Why verification is needed at all

The register was written before ten fix batches landed, and **261 commits followed it while
only 30 name a gap id**. Sampling four entries found two already fixed:

| Entry | Claim | Actual |
|---|---|---|
| G-062 | save discards the validator's anchors | **fixed** — `WorkflowSaveError` carries them (the D-4 fix, which never named G-062) |
| G-073 | two NUL bytes make the canvas file read as binary | **fixed** — 0 NUL bytes today |
| G-037 | skeletons ship empty-string required fields | still true — `collectionCtxKey: ""` et al. |
| G-067 | map fan-out defaults to unbounded concurrency | still true — no `maxConcurrency` in the skeleton |

Two of four stale is too high to hand you the register as written.

**No mechanical proxy works.** I tried "has the cited evidence file changed since the register
was written?" and it fails in both directions: G-037 and G-067 were flagged *changed* but are
still true, while G-062's evidence files were *untouched* yet it is fixed — because the fix
landed in different files than the entry cited. The heuristic is useful for ordering the work
and worthless as a conclusion. Each entry needs a real check.

---

## Batch A — confirm "do nothing" (29 entries, ~6 rulings)

**Verification status:** low risk. These propose no work, so staleness costs little — a stale
"defer" is still deferred. The `won't-support` ones assert deliberate design and are worth a
sanity read, not an investigation.

Nearly 40% of what is ungated proposes doing nothing. Ruling these as blocks clears the pile
fastest.

| # | Theme | Entries | Ask |
|---|---|---|---|
| A1 | **Run-history depth** — no ctx blackboard view, no export, no run-to-run compare, no partial re-run, no structural diff | G-076, G-079, G-082, G-085, G-094, G-059 | confirm defer |
| A2 | **Editor ergonomics** — no align/distribute/snap, edge type immutable after drawing, nested conditions unreadable on canvas | G-084, G-086, G-087 | confirm defer |
| A3 | **Deliberate scope limits** — no live collaboration, no breakpoints/stepping, `join.strategy: "any"` unsupported | G-080, G-088, G-100 | confirm won't-support |
| A4 | **Deliberate status collapses** — Terminated/TimedOut/ContinuedAsNew → `failed`; `cancelled` renders as `pending` until the cancel UX lands | G-089, G-103 | confirm won't-support |
| A5 | **Deliberate badge/indicator choices** — ambiguous & unsatisfied carry no settings badge; `ctx-bound` shows neither badge nor CTA; severity × anchor cross-product not a target | G-090, G-101, G-102 | confirm won't-support |
| A6 | **Long-tail hygiene** — ctx declarations never GC'd, orphaned param values, dotted-node-id path split, one merged error+warning count, and the rest | G-045, G-053, G-058, G-068, G-077, G-083, G-092, G-093, G-096, G-097, G-098, G-099 | confirm defer / won't-support as proposed |

### Per-item recommendations

I agree with the proposal on 21 of the 29. The eight below I would not rubber-stamp. Full
itemisation, in plain language, is in the companion status page (see *Related* at the bottom).

| Entry | Proposed | Recommend | Why |
|---|---|---|---|
| G-098 | defer | **promote to fix** | Ctx declarations are never garbage-collected. Same reference-integrity family as the shipped G-002/G-104, and the sweep machinery already exists. |
| G-099 | defer | **promote to fix** | A key removed from a `parametersSchema` leaves its saved value on the node forever, invisible and uneditable. Same family as G-098 — pair them. |
| G-077 | defer | **promote to fix** | The node problems badge counts unbound inputs and almost nothing else, missing most failure modes the journeys hit. The badge is the primary trust signal; this belongs with the "surface says fine when it isn't" group we cleared first, not in a long tail. |
| G-058 | defer | **promote to fix** | Human corrections leave no readable trail. Notable because the data is *already recorded* — `submitCorrections` writes reviewer, timestamp, original and corrected values plus an audit event. Nothing renders it. This is a viewer, not a feature. |
| G-096 | defer | **fix — cheap** | `nodeIdFromPath` splits at the first dot while `parseInputPortPath` is greedy, so a dotted node id buckets under a non-existent node and clicking selects nothing. Small, self-contained, currently misleading. |
| G-097 | defer | **fix — cheap** | The top bar sums errors + warnings into one red count (1 error + 5 warnings reads "6 issues"). Every other surface keeps the split. Cheaper to fix than to keep re-reading. |
| G-092 | won't-support | **route, don't drop** | Correct for the builder — removing failed documents belongs to the documents module — but it is a real journey requirement, and "won't-support" reads as "no". Raise it against the documents module. |
| G-093 | won't-support | **close — not a gap** | Records that routing an unmatched section *works*. A pass written into a gap register; leaving it inflates the backlog. |

Two further notes that need no action:

- **G-103** is filed `won't-support` but its own note defers to US-141. It is a park with an
  owner, not a permanent no — worth relabelling so it is revisited when the cancel UX lands.
- **G-079** and **G-094** are the same underlying fact (the diff is textual, not structural).
  Consider merging them into one entry.
- **G-053** (no way to exercise a failure path without really breaking a file) is the deferral
  that most directly contradicts a stated user need — Marcus asks for it explicitly. I still
  recommend deferring, because a simulation mode is a genuine feature, but it is the largest
  thing we are choosing not to build.

**Recommendation:** confirm A1–A5 as proposed, then work A6 item by item using the table above.

---

## Batch B — the 2 contested entries (2 rulings)

**Verification status:** unverified, but these need a decision regardless — the passes
disagreed, so neither can be rubber-stamped.

| Entry | Severity | Disagreement |
|---|---|---|
| **G-047** | major | C-040 says fix / C-049 says defer |
| **G-072** | major | C-022 + C-023 say fix / C-024 says defer |

I read both. In each case the disagreement is real and resolves the same way: **the entry
bundles a live defect with a piece of cleanup.** Split them and both passes are right.

**G-047 — three divergent node-status unions.**

| Half | Recommend |
|---|---|
| A cancelled run polls forever | **fix now** — a live defect burning requests on every cancelled run |
| Three overlapping status unions, one with no consumer, converter or renderer | **defer** — real tidiness, not urgent |

**G-072 — canvas port rows collapse the six-state binding model.**

| Half | Recommend |
|---|---|
| `locked-unbound` renders as *satisfied* — the canvas says fine while the settings panel says "Disconnected by you" | **fix now** — squarely in the "surface lies" category we agreed to clear first |
| The canvas shows two states where the model has six | **defer** — fidelity, can wait |

---

## Batch C — verify, then rule (43 fix proposals)

45 entries proposed `fix`; **G-062 and G-073 are already fixed** (see the table above) and are
excluded here, leaving 43 to verify. 40 major, 5 minor, less those two.
**None are blockers — every blocker-severity fix has already shipped.**
That is the single most important fact about the remaining register, and it means this batch
is a quality backlog, not a risk list.

They cluster into five families. The clusters matter more than the individual entries: most
share a root cause with something already fixed, so one design decision disposes of many.

| # | Family | Entries | Note |
|---|---|---|---|
| C1 | **Reference integrity on delete/rename** — edge-ids, exposed params, `source.api` field rows, ctx kind retype, `isInput` rename, rename collisions, two divergent delete paths, entry-node reassignment, lineage/dynamic-node cascades, lost-update when two tabs save | G-029, G-030, G-039, G-040, G-048, G-049, G-050, G-051, G-063, G-065, G-074 | **Same family as the shipped G-002/G-104.** The rename sweep already exists; most of these are "do what rename does". Highest-leverage cluster. |
| C2 | **Validation surfacing** — three canvas element types render no validation state, workflow-level rows inert, extract-then-store-nothing passes, map/join scope unchecked, skeleton empty-strings uncaught | G-031, G-034, G-036, G-037, G-038, G-052, G-075 | Mostly "the rule exists, the surface does not show it". |
| C3 | **Composition & authoring** — no duplicate/copy/paste/export, no extract-to-sub-workflow, no keyboard authoring, first-timer empty canvas, no logical-stages overview, keyword pattern untestable before commit | G-028, G-033, G-035, G-041, G-054, G-056 | The largest *product* gaps. G-033 (keyboard) is also the accessibility exposure. |
| C4 | **Run observability & parameterisation** — slow vs wedged, failure reason not attached to the run, cannot find a run by document, step inputs never shown, cache-hit metadata rendered nowhere, wire-peek false alert, group status collapse, threshold not variable per group at run time | G-042, G-043, G-044, G-055, G-057, G-064, G-078, G-095 | Journey-driven (J2, J7). |
| C5 | **Control-flow & registry correctness** — unbounded map concurrency, humanGate signal collision inside a map, nested map body group overlap, body-entry picker unfiltered, switch case reorder, multi-select move not persisted, node-swap carries stale metadata, orphan port families, group chip delete no-op, `ctx-bound` unmodelled, `KindSelect` frozen registry snapshot | G-032, G-046, G-060, G-061, G-066, G-067, G-069, G-070, G-071, G-081, G-091 | Several are genuine engine-correctness issues (G-067, G-070), not UI polish. |

**Recommendation:** do not rule on these yet. Verify first — the sample says roughly a third
may already be fixed. Verification order should follow leverage: **C1 first** (largest, most
concentrated root cause, and the family where a single decision covers ten entries), then C5
(engine correctness), then C2, C4, C3.

---

## What I propose next

1. Rule Batch A now (~6 decisions, clears 29 entries).
2. Read and rule Batch B (2 entries, needs your judgement).
3. I verify C1 against current code and come back with a per-entry still-true/fixed table.
4. Repeat for C5, C2, C4, C3.

That converts 76 undifferentiated entries into 8 decisions you can make immediately and a
verification backlog that shrinks predictably.

## Standing correction to the register

Two entries should be marked shipped regardless of any ruling: **G-062** (fixed by D-4) and
**G-073** (0 NUL bytes today). Neither was credited because the commits never named them.
Worth fixing the register as verification proceeds, so this drift does not compound.

## Related

- [GAP_REGISTER.md](GAP_REGISTER.md) — the 106 entries themselves
- [FIX_SET_EXPLAINED.md](FIX_SET_EXPLAINED.md) — plain-language companion for the 24 already approved
- [STACK.md](STACK.md) — the whole work stack, layer by layer
- Status page (browser) — https://claude.ai/code/artifact/e91c2835-1d4d-4ff9-958a-73aebe708342
