# Pass D — Mutation & Cascade: narrative notes

Scope: MANUAL_TEST_PLAN Parts 3–9, the change/delete axis. 37 findings in
`findings-d.json` (5 blocker, 26 major, 6 minor; 19 impl-gap, 18 design-gap;
35 `fix`, 2 `defer`, 0 `won't-support`).

---

## 1. How I worked the table

I started where the brief pointed — INVENTORY §3.10 (D96–D107) — confirmed both
recorded leads against source, then worked outward through §3.1–§3.9. For each
edge I asked the four questions the brief specifies (what the code does, whether
it is specified in `docs-md/workflow-builder/`, whether the author is told,
whether there is a recovery path) and only filed a finding where the answer to at
least one of the last three is "no".

I did **not** file a finding for every edge. Roughly a third of the 107 edges turn
out to be well-handled, and I think that is worth recording explicitly so the
merge doesn't read silence as absence of work:

- **D4/D5/D6 (map body entry/exit, join source map).** Deleting the referenced
  node leaves a dangling id, but the validator errors hard
  (`validator.ts:583/:590/:602/:610`), the node badge lights, `NodePicker`
  renders "Referenced node … no longer exists in the graph", and the settings
  form offers a re-pick. This is the reference model for what the other
  categories are missing, and it is why D-004 (`errorPolicy.fallbackEdgeId`)
  reads as a blocker rather than as "one more dangling id".
- **D9/D34 (`__auto.` namespace).** The synthesised-key design is clean:
  `isAutoCtxKey` exempts them from the declared-key check on both the input and
  output side with an explicit comment, and the VariablePicker filters by
  membership rather than by shape. No finding.
- **D53 (switch case condition → edge label).** An edge no longer named by any
  case degrades to an `(unmatched)` label on canvas. That is exactly the kind of
  visible degradation the *forward* direction (D-009) lacks.
- **D63–D68 (kind registry reads).** Every read consumer degrades gracefully on
  an unknown kind — `resolveKindFamilyRoot` returns the input, `resolveKindFields`
  returns `[]`, colour resolvers fall back to gray, and `isAssignable`
  deliberately fails closed. The single exception is the *write* path
  (D-025).
- **D89 (Try cancels the prior in-flight run).** Defined and implemented.
- **D93/D94 (lock strip/normalise round-trip).** Correct in isolation; the only
  problem is what happens when the ports underneath them change (D-007).
- **Wire-peek lifecycle.** Popover state is derived from the edge's `selected`
  flag, so it unmounts with the wire. No staleness.

## 2. Judgement calls

**§5.13 — the delete-handler asymmetry: I judge this a real defect, not a
deliberate scope line.** The inventory left it open. My reading is that the
groups prune exists because a dangling `nodeGroups.<id>.nodeIds[i]` is one of the
few cross-references the validator *does* catch, so it blocked saves and got
fixed; bindings dangle silently (D-002, D-006) so nothing forced the issue. That
is a fix driven by the error surface rather than by the model, which is why the
same class keeps being rediscovered. The helper's own doc comment rationalises
the toast asymmetry as "interactive concerns owned by the settings UI" — I did
not accept that (D-028): the most destructive path is the one with no toast.

**§5.14 — the swap carry-over: specified, but only halfway.** The
guide does say the swap "keeps the label, ports, error/retry/timeout policy".
So carrying `inputs`/`outputs` is intended and I filed it as a *design*-gap
(D-006) rather than an implementation defect: what was never specified is what
happens when the new activity type does not declare the carried ports. The two
consequences I filed separately as impl-gaps because they are unambiguous
misbehaviour rather than unspecified behaviour: the engine writing `undefined`
through a stale output binding (D-005) and the lock metadata riding along
(D-007).

**Severity calibration.** I reserved `blocker` for the five cases where the graph
silently produces *wrong results* or becomes permanently unsaveable with no
in-builder repair: D-001 (pinned binding to a deleted node reads healthy), D-002
(producer-less ctx key is invisible to every surface), D-003 (cache serves
another activity's output), D-004 (`errorPolicy.fallbackEdgeId` unrepairable),
and D-032 (deleting a library workflow breaks parents that still validate
green). Everything that is merely undiscoverable-until-you-open-the-node is
`major`.

**Two deferrals.** D-017 (ctx declarations are never garbage-collected) and D-023
(a parameter key dropped from a catalog schema stays on the node forever) are
both real, but both fail as clutter rather than as incorrect execution, and both
need a definition of "still referenced" that D-016 shows we do not currently
have. Recording them so they stop being rediscovered is the point. Nothing in
this pass reads to me as a genuine `won't-support`.

**Two near-misses I want on the record**, because both would have been confident
false findings:

1. `grep` mis-detects `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
   as binary and silently reports no matches. My first sweep therefore concluded
   `NodeContextMenu` / `NodeTypeSwapModal` / `swapActivityType` were dead code —
   they are mounted at `:3087` and `:3135`. **Use `grep -a` on that file.** Two
   of the four sub-agents hit the same trap independently.
2. I initially read `computeConfigHash` (`packages/graph-workflow/src/config-hash.ts`,
   whole-graph) as the cache key and was about to file "dragging a node
   invalidates the entire cache". It is not — the cache decorator computes its own
   per-node `configHash` from `node.parameters` only
   (`apps/temporal/src/cache/cached-activity.ts:220`), which matches
   `TRY_IN_PLACE_DESIGN.md` §2.2. Two unrelated values share one name and one
   column name; that naming collision is itself worth a note even though it is
   not a finding.

## 3. The one chain that matters most

Three separately-defensible decisions compose into the worst outcome in this
pass:

- node ids are reused after deletion (`makeNodeId` returns the lowest free
  suffix) — D-021;
- nothing evicts a cache row on delete or retype, and there is no FK behind a
  deleted lineage — D-036;
- the cache key omits `activityType` — D-003.

Together: a deleted-then-re-added node, or a type-swapped node, can be served a
different node's cached output for up to 24 h, and the preview widget and status
badge both corroborate it (D-037) rather than exposing it. Each piece is
individually reasonable; only the composition is dangerous, which is exactly the
shape the brief predicted for this class.

## 4. What I could not check

- **No runtime verification.** I did not start the app, the worker or Temporal —
  this was a source-and-docs audit. Every runtime claim (engine injecting
  `undefined` for a dangling binding, a cache hit on a reused id, the retryable
  child-workflow failure) is traced through the executor and cache decorator
  source, not observed. D-003 in particular deserves a reproduction before it is
  actioned: I am confident in the key composition but have not watched a
  collision happen.
- **Backwards-compat / cross-release cascades are hypothetical.** D-006 (catalog
  port renamed or removed) and the kind-retype half of D-018 describe what
  happens when the catalog changes under a saved workflow. There is no migration
  mechanism and `SUPPORTED_SCHEMA_VERSIONS` has one member, so I could establish
  what the code *would* do but not point at an instance where it has happened.
- **Concurrency.** Two authors editing the same lineage, or an agent write
  landing during a manual edit, interacts with `lastHydratedConfigRef` in
  `WorkflowEditorV2Page`. I looked at the hydration guard but did not audit the
  mutation cascade under concurrent edits; that is arguably Part 12/15 territory
  anyway.
- **`EphemeralConfig` (`metadata.ephemeral`) cleanup.** Listed in INVENTORY §5.11
  as having no Parts 3–9 editing surface. I confirmed there is no editor but did
  not trace whether the cleanup policy interacts with cache-row lifetime; if it
  does, it belongs beside D-036.
- **Benchmark / ground-truth reference edges.** `BenchmarkDefinition` and
  `DatasetGroundTruthJob` both pin a `WorkflowVersion` and both do block a
  lineage delete. I recorded that in D-034 as context but did not audit those
  features' own cascades — out of scope.
- **`GraphEdge.sourcePort` / `targetPort`.** The type carries them and the
  data-wire model does not use them (INVENTORY §5.11). I found no writer and no
  reader in Parts 3–9, so there is no mutation cascade to test — but I could not
  rule out a Part 10–16 writer, so I did not file it as a non-goal.
- **Duplicate `inputs[]` rows for one (node, port)** — INVENTORY §5.12. I
  confirmed no validator enforces uniqueness and that the derived wire id would
  collide, but I could not find a mutation path that actually creates a
  duplicate row (`resolveBindings` filters by port before pushing, and
  `PortBindingsEditor.setBinding` does the same), so I left it unfiled rather
  than speculating.
