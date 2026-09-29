# Pass A — Author Journeys: narrative notes

38 findings in `findings-a.json`: **10 blocker, 18 major, 10 minor**.
Every journey hit at least one wall. Three (J2, J5, J7) cannot be completed at all.

---

## How I worked

I walked J1→J7 in order, step by step, asking the four questions the brief sets
(possible at all? discoverable? how many steps? does anything destroy prior work?).
Where a step's answer was a negative — "nothing writes this", "nothing calls that" —
I confirmed it by reading the file, not by an empty search result. That discipline
paid off twice: `errorPolicy` (A-010) and `sendHumanApproval` (A-019/A-020) both look
implemented from a keyword grep and are in fact dead ends, and I would have got both
backwards from a grep hit count alone.

I used `grep -a` on `canvas/WorkflowEditorCanvas.tsx` throughout, per the brief. Worth
recording for later passes: with `-a` the file is **3180 lines**, not the ~2800 the
brief estimates, so any line citation into that file taken from a non-`-a` tool should
be re-checked.

Every `file.ts:NNN` in `findings-a.json` resolves;
`node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-a.json`
exits 0 (38 findings, clean).

---

## The three findings I would put in front of anyone first

**1. A workflow can only ever have one run in flight (A-001).**
`listRunningInLineage` queries `WorkflowLineageId = "<id>" AND ExecutionStatus =
"Running"` — no Try/production discriminator — and *both* run entry points call
`cancelInFlightTriesForLineage` before starting. The cancel-on-new-Try affordance
from test-plan 9.7 is an editor convenience that was implemented on the shared run
API, so it silently governs the documented Workflow-as-API endpoint too. This single
fact ends J2 at step 1 and J1 at step 6, and it makes A-032's "Re-run" recovery button
into a live-traffic hazard. I rate it the highest-leverage finding in the pass because
it is one predicate away from correct: the query needs a marker that distinguishes an
editor Try from a production run.

**2. `errorPolicy` has no authoring surface at all (A-010).**
The engine honours `fail` / `fallback` / `skip` and `retryable: false`. The canvas
mounts the bottom `error` handle when `onError === "fallback"`. The validator validates
`fallbackEdgeId`. `swapNodeType` carefully preserves the field. The test plan's item 5.2
opens with "*On a node with `errorPolicy.onError = "fallback"`*" — presupposing it is
already set. Nothing in the product sets it. This is the cleanest example in the pass
of the failure mode the brief warns about: the test plan was written from the
implementation by people who could hand-edit JSON, so the missing control never
registered as missing. It kills J2's entire failure-containment branch and J4 step 7.
`RetryPolicy` and `TimeoutPolicy` are in the same state.

**3. A humanGate can never be resumed by the product's own review queue
(A-019 + A-020).**
Two independent breaks, either of which alone is fatal. (a) The queue's approve action
(`POST /hitl/sessions/:id/submit` → `approveSession`) updates the session row and sets
the document to `complete`; it sends no Temporal signal. The only signaller in the repo
is `POST /api/documents/:id/approve`, which the review UI never calls. (b) Even calling
that endpoint by hand fails, because the source-upload handler creates the Document with
`workflow_execution_id: null` and never writes the `runId` it just received back onto the
row, so the endpoint 400s. Net: the gate blocks, the document appears in the review queue,
a reviewer approves it, the document goes `complete`, and the run sits blocked until the
1 h timeout fires and — with the palette's default `onTimeout: "fail"` — fails. J5 steps
5 and 7 and its whole "done" definition are unreachable, and the product's headline
human-in-the-loop story is broken end to end.

---

## Per-journey walk

### J1 — Priya, first contact
- **Step 1** (name it) — clean.
- **Step 2** (hand it files) — `source.upload` is in the palette's Sources section with
  a description; discoverable. But one file at a time (A-002).
- **Step 3** (say what happens) — the wall for a first-timer (A-004). 41 activities,
  no recipe reachable from the editor, and the template picker lives on the list page
  she has already left. `mistral-ocr.process` is a merciful two-node chain if she finds
  it; the Azure path is four nodes plus a `pollUntil` and is not guessable.
- **Step 4** (see the actual values) — **the journey's own acceptance test fails**
  (A-003). Every `OcrResult` in ctx is a blob pointer by design; the preview shows
  `blobPath` / `byteLength` / `status`. She sees that OCR ran, never what it read.
- **Step 5** (fix what the trial exposed) — she can swap the model (node swap, 6.6) but
  the specific failure she anticipates — "the result is being read but not kept
  anywhere" — is exactly the state the validator calls **Valid** (A-005).
- **Step 6** (run the folder) — wall (A-001 + A-002).

### J2 — Marcus, quarterly batch
Dead at step 1 (A-001). I walked the remaining steps anyway on the assumption that the
concurrency bug is fixed, because their gaps are independent: no batch entity (A-006),
no stuck-vs-slow signal (A-007), failure reason as a transient hover tooltip (A-008),
no export (A-009, speculative), no failure containment (A-010), no way to rehearse it
(A-011). Step 6 (delete failed documents) is genuinely outside Parts 3–9 and I logged
it as a `non-goal` (A-012) rather than dropping it, so it gets routed at merge instead
of rediscovered.

Worth flagging: the production incident this journey is grounded in — documents stranded
in "Processing" — is *not* obviously prevented by anything I found. Nothing resets a
document's status when a run fails, and A-008 means the reason is not retained.

### J3 — Marcus, sections
The best-supported journey in the set. Steps 1, 4, 5 and 6 all work: `splitAndClassify`
emits `unknown` for unmatched ranges, the switch default edge routes it and renders as
`otherwise`, and `ValidationRuleEditor` supports arithmetic + field-match + array-match
rules with both absolute and percentage tolerance — Marcus's "arithmetic and matching
rules with a tolerance, not code" is met almost exactly.
Two gaps: he cannot try a keyword pattern against a sample before committing (A-013),
and the map+join shape the model forces means a branch that dead-ends inside the body
silently drops that section with only a yellow warning (A-014) — which is precisely the
"unrecognised page silently dropped" outcome step 4 says must not happen. I logged the
passing behaviour as A-015 (`non-goal` / `won't-support`) so the merge does not read
J3.4 as unexplored.

### J4 — Marcus, per-page fan-out
Steps 1, 2, 4 and 5 work: `document.split` has a real `per-page` strategy, its
`DocumentSegment[]` output carries `segmentIndex` and `pageRange`, map preserves index
order, and `join` collects. Steps 3, 6 and 7 all fail:
- default concurrency is `Infinity` (A-016) — the exact throttling he says he wants to
  avoid finding out about the hard way;
- **no progress at all** for his document sizes (A-017). Over 20 items the map runs its
  body in child workflows whose statuses never reach the parent's query, so the canvas
  shows the map node "running" and nothing else, for 300 pages;
- one bad page fails the whole document (A-018) — `Promise.all`, not `allSettled`, and
  no skip policy to author.

### J5 — Dana, classify → route → review
Steps 1 and 2 work; step 6 (timeout policy) is genuinely well served — a required
timeout with `fail` / `continue` / `fallback` and a fallback-edge picker that appears
only for `fallback`. Everything else fails: no per-group runtime threshold (A-021), the
gate can't be resumed (A-019/A-020), corrections can't be routed anywhere because
control-flow nodes can't be given output bindings through the UI (A-022), three of four
signal-name presets are dead ends (A-023), and escalation has no expression in the graph
model (A-024).

The humanGate form has visibly improved since the free-text-signal-name era the brief
cites — there is now an explanatory Alert naming `humanApproval` and a preset list. That
makes the *name* discoverable and leaves the *plumbing* broken, which is arguably worse
for an author: the form tells her she has done it right.

### J6 — Sam, inherited workflow
Steps 4 and 7 are partially or fully served. Steps 1, 3, 5 and 6 are not:
the "logical stages" overview only exists if the departed author happened to create
groups (A-025); there is no find-in-workflow and no consumers view, so Sam's stated
fear — "the three branches share one setting and the ticket only wants one changed" —
can only be discharged by opening all 16 nodes (A-026); and **replay does not load the
run's version** (A-027), so step 5's "look at a previous real run to confirm the
reading" overlays historical statuses onto the current graph.

The canvas's derived data wires are a real, under-credited partial answer to step 3 —
they render producer→consumer for anything that flows through a bound port. That is why
A-026 is `major` and not `blocker`.

### J7 — Dana, debugging a wrong total
The journey that fails most completely, because its method — bisecting a pipeline by
comparing consecutive intermediate values — is defeated three separate ways:
- **the values are pointers** (A-003), so for the OCR and correction chain there is
  nothing to compare;
- **they are 24 h old** (A-032). `DEFAULT_CACHE_TTL_MS` is exactly 24 hours and J7's
  premise is "the run happened yesterday". She gets `cache-evicted` on node after node,
  and the only offered remedy starts a fresh run against **head**, creating the second
  official result step 8 explicitly forbids;
- **the graph she is looking at is not the graph that ran** (A-027).
Plus: she can't find the run by document (A-031), can't see a step's inputs directly
(A-033), can't see which branch fired (A-034 — `computeActiveEdges` requires a node to
be `running`, so in replay the set is always empty), can't see who corrected what
(A-035), can't compare two runs (A-036), and can't re-run a part (A-037, speculative).

---

## Judgement calls

- **`non-goal` used sparingly and deliberately.** Three findings (A-012 document
  deletion, A-015 unmatched-section routing, A-030 no structural config diff) are logged
  as `non-goal` / `won't-support` because the brief asks that genuine out-of-scope
  decisions and genuine passes be *recorded* so they stop being rediscovered. A-015 is
  the unusual one: it records a step that *works*, because leaving J3.4 silent would
  read at merge as unexplored.
- **The two speculative expectations (A-009, A-037)** both begin their rationale with
  `SPECULATIVE REQUIREMENT:` and are ranked `minor` / `defer`, per the brief. Both are
  real walls; I have no evidence either is a real user requirement. A-037 is worth a
  second look at merge because the activity-output cache already delivers most of what
  step 8 asks for (unchanged upstream nodes come back `skipped`) — what is missing is
  only the "not a second official result" half.
- **Blocker vs major.** I reserved `blocker` for steps that cannot be completed by any
  route, including a documented workaround. A-026 (no search) is `major` not `blocker`
  because clicking 16 nodes does work. A-008 (failure reason) is `major` because
  hovering the badge during the run does work, for one document.
- **I did not split A-019 and A-020 into one finding** even though they are the same
  journey step, because they are independent defects in different modules and fixing
  either alone leaves the journey broken. The merge should treat them as a pair.
- **A-038 is a deliberate roll-up** of five "the problems badge doesn't count this"
  observations that would otherwise be five low-value findings. The underlying fixes are
  the individually-ranked ones.
- **I did not report any journey as wrong about the product.** The brief invites it; I
  found nothing. The one place I checked hardest — the brief's own note that
  `document.split` supports `per-page` at `document-split.ts:19` — is accurate, and J4's
  premise holds.

---

## What I could NOT check, and why

**Anything requiring the app to run.** This was a static pass by instruction; I did not
start the stack or a browser. Specifically unverified by observation:

1. **A-017's child-workflow status claim.** I established it by reading: over 20 items
   `executeMapNode` calls `executeChild("graphWorkflow", …)` and does not share
   `state.nodeRunStatuses` with the child, whereas the ≤20 path explicitly does
   (`nodeRunStatuses: parentState.nodeRunStatuses`, with a comment saying the last
   iteration wins). I am confident in the reading but it deserves one live 25-item map
   to confirm the canvas really shows nothing.
2. **A-032's eviction timing.** The TTL constant is unambiguous; whether the GC sweep
   runs on a schedule that makes a 25-hour-old run *reliably* unrecoverable is a
   deployment question I cannot settle from source.
3. **A-013's "no sample preview" claim.** I read `KeywordPatternEditor.tsx` end to end
   and it renders only pattern/segment-type rows plus a regex error. But the preview it
   would need might reasonably be considered to exist via `preview:segments` after a
   run; whether an author *finds* that as the answer to "try my pattern" is a live-UX
   question.
4. **A-004's discoverability claim.** Whether `hover-extend` in practice rescues a
   first-timer building the OCR chain is exactly the kind of thing a static pass gets
   wrong. I read `extend-filter.ts` and `use-hover-extend.ts`; the mechanism is
   kind-filtered and sound, but its *discovery* (hovering a handle you have no reason to
   hover) cannot be assessed without watching someone.
5. **The HITL review workspace itself** (J5 step 4 — "enough of the document alongside
   the extracted values, least certain first"). It lives in
   `apps/frontend/src/features/annotation/hitl/`, outside Parts 3–9, and I only traced
   its *linkage* to the graph engine (which is broken — A-019). Its adequacy as a
   reviewer surface is unassessed and belongs to whoever owns that module.
6. **Whether a stranded document's status is ever reset** after a failed run (J2's
   founding incident). I found no reset path but did not exhaustively trace every
   activity's error handling in `apps/temporal/src/activities/`, so I did not raise a
   finding on it. Flagging it here as a lead rather than asserting a negative.

**Deliberately not consulted:** `findings-b/c/d.json` and `notes-b/c/d.md`, per the
brief. Any overlap between this pass and those is independent corroboration.
