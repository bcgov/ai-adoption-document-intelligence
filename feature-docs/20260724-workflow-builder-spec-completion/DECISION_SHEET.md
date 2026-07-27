# Gap register — decision sheet

Collapses the 76 ungated entries in [GAP_REGISTER.md](GAP_REGISTER.md) into a small number of
rulings. Ordered so the cheapest decisions come first.

**Read this first:** gating is two jobs, not one, and they were conflated.

1. **Is this still true?** — mechanical verification. Mine to do.
2. **What should we do about it?** — the ruling. Yours.

Ruling on a stale entry wastes your time, so every batch below states its verification status
plainly. Batches A and B are rulable now. Batch C is not, and says so.

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
| G-098 | defer | ~~promote to fix~~ → **already shipped** | **My recommendation was wrong — verified 2026-07-26.** `removeNodesFromConfig` prunes orphaned ctx declarations unconditionally at the single choke point every delete path funnels through (`findOrphanedCtxKeys` + `pruneCtxDeclarations`), with an author prompt via `describeOrphanedDelete`; and `WorkflowSettingsDrawer` already renders `Used by {n}` plus an explicit "declared but unused" row at zero. Both halves of the entry are addressed. Mark shipped, do not reimplement. |
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

---

## C1 verification — 2026-07-26

The reference-integrity cluster, checked against current code. Verify-before-rule
in practice: **2 of 11 had already been fixed** and would have been ruled on as
though open.

| Entry | State | Evidence |
|---|---|---|
| G-030 exposed params destroyed by mutations | ✅ **already fixed** | `prune-node-from-groups.ts` drops any `exposedParams[i]` whose `nodeId` referenced a deleted node |
| G-048 two divergent node-delete implementations | ✅ **already fixed** | Both `WorkflowEditorV2Page` and `WorkflowEditorCanvas` import the same `removeNodesFromConfig`, whose docstring names it "the single node-removal implementation, shared by every delete path" |
| G-029 control-flow edge-id refs never swept | ❌ still true | `remove-nodes.ts` handles nodes, edges, entry pointer, groups and ctx — but never `switch.cases[].edgeId`, `switch.defaultEdge`, or a humanGate's fallback edge |
| G-040 `source.api` field rename orphans consumers | ❌ still true | no rename sweep in the source settings |
| G-049 ctx kind retype never re-checks consumers | ❌ still true | `onUpdate({ ...declaration, kind: next })` writes the new kind with no consumer pass |
| G-050 lineage delete cascades to pinned versions | ❌ still true | `onDelete: Cascade` on `WorkflowVersion.lineage` |
| G-063 lost update when two tabs save | ❌ still true | no `If-Match` / `expectedVersion` / 409 path on the update endpoint |
| G-065 `isInput` rename rewrites the public run-spec silently | ❌ still true | no warning on the toggle |
| G-074 ctx rename collision is a silent no-op | ❌ still true | no collision handling in the drawer |
| G-039 entry-node reassignment on delete | ⚠️ partial | reassignment happens in `remove-nodes.ts`; whether it is *announced* needs a UI check — `describeOrphanedDelete` exists and may already cover it |
| G-051 dynamic-node soft-delete breaks pinned nodes | ⚠️ partial | soft-delete + restore semantics exist in `dynamic-node.repository.ts`; whether a version-pinned node is guarded at run time needs a runtime check |

**Staleness in this cluster: 2 of 11 (18%)** — lower than the 50% the first
four-entry sample suggested, which is worth knowing: the sample was too small to
extrapolate from, and I should not have implied a rate from it.

**The seven that remain are one shape**, and it is the shape G-002 already
established: *a reference survives the thing it points at*. The rename sweep and
the ctx prune both exist; most of these are "do what those already do" for a
different reference type.

## C5 verification — 2026-07-26 (partial)

| Entry | State | Evidence |
|---|---|---|
| G-067 map fan-out unbounded | ✅ **fixed this session** | `8fb19d57` — skeleton default + validator warning |
| G-060 multi-selection move not persisted | ❌ still true | `handleNodeDragStop(_event, node)` writes the position of the ONE dragged node; the rest of the selection moves visually and is never saved |
| G-061 switch cases cannot be reordered | ❌ still true | no reorder affordance in `SwitchNodeSettings` |
| G-070 humanGate signal collision inside a map | ❌ still true | no validator rule pairs a humanGate's signal name with map iteration |
| G-071 map body-entry picker unfiltered | ❌ still true | `MapNodeSettings`' own docstring: "each a `NodePicker` over all nodes (no `filterType`)". A reachability filter does apply *after* an entry is chosen, so the entry overstates it slightly |
| G-032, G-046, G-066, G-069, G-081, G-091 | ⏳ **not yet verified** | need more than a grep — deliberately left unmarked rather than guessed at |

**Not extrapolating from this.** C1 came out 18% stale after the first sample
suggested 50%; the honest position is that each cluster has to be measured, and
six C5 entries are still unmeasured.

## C1 — all seven ruled and shipped, 2026-07-27

| Entry | Commit | Shape of the fix |
|---|---|---|
| G-029 edge-id refs never swept | `11b627c3` | `pruneEdgeReferences` on all three edge-removal paths; a `fallback` mode whose edge dies downgrades to `fail` (behaviour-preserving — both executors already threw) |
| G-074 rename collision silent | `eefa8389` | the row shows the collision live and KEEPS the typed text; the refusal was already right, saying so was missing |
| G-049 kind retype unchecked | `71e1b61e` | the row names the pinned inputs the kind no longer satisfies, read from the same resolution the validation drawer uses |
| G-040 `source.api` field rename | `11f18c2b` | drives `renameCtxKeyInConfig` — G-008's sweep from the other end; the name commits on blur, which is load-bearing |
| G-065 `isInput` rewrites run-spec | `15db9e5f` | the row states the contract effect, including the two cases where the flag is inert |
| G-063 two-tab lost update | `f9049ab3` | `expectedVersion` REQUIRED on `PUT`; 409 `workflow_version_conflict`; checked again inside the append transaction |
| G-050 lineage delete cascade | `5873aaa9` | scoped down on verification — see below |

**G-050 is the one that changed shape under verification.** The entry read as
"cascade-deletes versions pinned by runs and by other workflows' childWorkflow
nodes". Both of those turn out to be already guarded: benchmark definitions and
ground-truth jobs are `Restrict` FKs that block the delete outright, and library
references are caught by G-019's guard. The single silent loss is
`Document.workflow_config_id` (`SetNull`) — the record of which graph produced
each document. That is what got fixed; the rest of the entry was already true.

Two of the seven needed a **behavioural decision** rather than just code, and
both were resolved by finding that the conservative option was already the
runtime's behaviour: G-029's `fallback` → `fail` downgrade (both executors
already threw a non-retryable error on a missing edge) and G-050's
"permit-but-name" (refusing would make any workflow that had processed a
document undeletable).

**One pre-existing failure surfaced and was fixed**: G-067's map-concurrency
warning (`8fb19d57`, earlier this session) had broken a backend
`graph-schema-validator` spec. The frontend and package suites were run when
that shipped; the backend one was not. Recorded here rather than buried in the
commit, because the lesson is about which suites a package-level change reaches.

## Verification complete — all 43 C-cluster entries measured, 2026-07-27

The remaining 27 are verified. Combined with C1 and the earlier C5 pass, **every
`fix` proposal in the register has now been checked against current source.**

| Cluster | Verified | Already fixed | Still true |
|---|---|---|---|
| C1 reference integrity | 11 | 2 (G-030, G-048) | 9 → **all 7 remaining now shipped** |
| C5 control-flow & registry | 11 | 1 (G-067, this session) | 10 |
| C2 validation surfacing | 7 | **1 (G-038)** | 6 |
| C4 run observability | 8 | **1 (G-064)** | 7 |
| C3 composition & authoring | 6 | 0 | 6 |
| **Total** | **43** | **5 (12%)** | **38** |

**Measured staleness is 12%, not the 50% the first four-entry sample suggested
and not the 33% I estimated from it.** The estimate was wrong in the safe
direction, but it was still an extrapolation from four entries and should not
have been offered as a rate. The clusters differ sharply — C1 ran 18%, C3 ran
0% — and the only reason to know that is to have measured each.

### The two newly-found stale entries

- **G-038** (workflow-level validation rows inert) — fixed by G-010.
  `resolveAnchorTarget` now routes edge, group, entryNodeId, ctx and
  library-port anchors; only the genuinely workflow-level ones stay inert. The
  fix commit says so in a comment, which is why this was cheap to confirm.
- **G-064** (wire-peek blames the cache for a producer that never ran) — fixed
  by G-012. `WirePeekPopover` reads `producerStatus` from `nodeStatuses` and
  shares `noOutputReasonForNode` with the node card, so the two surfaces agree.

### Three entries are TRUE but not LIVE — this changes what they are worth

Verification turned up a distinct category the register does not have a column
for: the code is exactly as described, but nothing shipped can reach it. These
should not be ruled `fix` on the same footing as the rest.

| Entry | Structurally true | But |
|---|---|---|
| **G-066** `KindSelect` reads the frozen registry snapshot | yes — `Object.keys(ARTIFACT_REGISTRY)` | `registerArtifactKind` has **zero production call sites** (tests only). No kind can be dynamically registered today, so the value it would destroy cannot exist. |
| **G-046** half 1 — kindless input ports | yes — `resolveInputPort` returns `unsatisfied` on `kind === undefined` | **0 of the catalog's activities declare a kindless input port.** Five unreachable binding states, for an empty port family. |
| **G-081** `ctx-bound` unmodelled | yes | already downgraded to minor in pass C for the same reason: `computeNodeStatus` has no production caller. |

**G-046's other half is the opposite — much bigger than the entry implies.**
There are **26 optional base-`Artifact` input ports** across the catalog
(`file.prepare.fileName` / `.fileType` / `.contentType`, `azureOcr.poll.modelId`,
`azureOcr.extract.fileName`, …). Every one owns a canvas handle you can drag
onto while being invisible to the Inputs panel, the badge and the drawer. These
are the same ports behind the agent scenario-1 catalog-vs-runtime mismatch, so
this is a live gap with a known second symptom, not a theoretical one.

The lesson is the same one the linter's shape-coverage pass taught: *a check
nothing can exercise and a gap nothing can hit are the same kind of finding.*
Both halves of G-046 were written as one entry because they share a code path;
they should be ruled separately because one is empty and one is 26 ports wide.

### Method note

Every check was a direct read of the cited evidence line against current source,
plus — where the claim was about reachability rather than code — an enumeration
of what the catalog or the call graph actually contains. The second kind found
all three latent entries; grepping the cited line alone would have confirmed
every one of them as "still true" and been useless.

## Ship-readiness batch — 10 fixes, 2026-07-27

Alex's steer: *"I'm not too interested in new features, I just want to ship an
initial implementation, bug free."* That reframes the 27 confirmed gaps — **16
are missing capability** (copy/paste, keyboard authoring, run search,
extract-to-sub-workflow) and were set aside. The other 11 are things BROKEN in
what already ships; 10 were fixed (the 11th is G-031's edge half, see below).

| Entry | Commit | What was actually wrong |
|---|---|---|
| G-037 | `df343e19` | Palette skeletons ship 4 required fields as `""`; no rule referenced any of them |
| G-060 | `9e6a1515` | xyflow passes the whole dragged set; the handler read one node |
| G-032 | `e188f58c` | Stale output rows wrote `undefined` over live ctx (`writeToCtx` has no guard) |
| G-070 | `7702e5e8` | One signal name per iteration; resume address is fixed, so unfixable as-is |
| G-039 | `117a6801` | `Object.keys()[0]` promoted a node that usually cannot be an entry, unannounced |
| G-036 | `9de30797` | Join scope unchecked; picker offered the configurations that throw |
| G-071 | `9de30797` | Body-entry picker had no filter at all |
| G-091 | `4544ab19` | Chip Delete inert; `activeGroupId` stranded on a deleted group |
| G-095 | `4544ab19` | 4 of 6 statuses; collapsing a group destroyed two |
| G-031 | `affb5cd9` | Source cards and chips had no badge (edges deferred) |

### What verification changed before any code was written

I re-checked the five highest-ranked entries against source rather than trusting
the register — G-051 had just turned out to be describing the opposite of the
truth. Two came back **worse** than written:

- **G-032** — the register said the engine "writes `undefined` through stale
  output rows". Confirmed at the leaf: `writeToCtx` ends `current[finalKey] =
  value` with no undefined guard. It is real data corruption, not a display bug.
- **G-070** — the register said the gate registers duplicate handlers. Also
  true, but the resume path is worse: the backend signals by workflow id with
  the FIXED name `"humanApproval"`, so there is no per-iteration address even if
  the handlers were distinct. That is what made "refuse it" the honest fix
  rather than "route it".

### Two entries where refusing was the fix

G-070 and G-091 were both resolved by **declining to guess**. A human gate in a
loop cannot work, so Save refuses it and says why; a chip's Delete has two
plausible readings (drop the grouping, drop the steps) so it refuses and names
the affordance that does work. Building either behaviour would have been a new
feature, and picking one for the author is how work gets lost.

### What was deliberately NOT fixed

- **G-031's edge half.** Five anchor shapes name an edge. Marking one needs a
  visual language for "this connection has a problem" that the canvas does not
  have, and inventing it is a design decision. They are navigable from the
  drawer (G-010) — just not marked in place. Stays open.
- **G-036's untaken-switch-branch half.** A map behind a branch that is not
  taken leaves its join ready. That is a reachability question, not a scope one.
- **G-052** (extract-then-store-nothing validates Valid). The underlying check
  was measured earlier this session: it fires on **23 of 111 nodes** across
  shipped workflows. It would be noise on day one.
- **G-034** (a branch dead-ending in a loop body drops results with a warning)
  is documented as INTENTIONAL in the test plan and ships that way in the
  showcase demo. A design decision to revisit, not a bug to fix.

## Remaining verification (historical — now complete)

C2 (validation surfacing, 7), C3 (composition & authoring, 6), C4 (run
observability, 8), plus the six C5 entries above — 27 entries. The method is
established and mechanical; it is the volume that remains.
