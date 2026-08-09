# What is left — batch four and the rest of Inderdeep's work

**As at 2026-08-08, end of session.** 30 of 33 checklist items are done and
committed on `feature/visual-workflow-builder`; the branch is clean and the full
suites are green (backend 2863 tests / 153 suites, frontend 2614 / 210).

This file exists so the chat can be compacted without losing the thread. The
narrative is in [WORKLOG.md](WORKLOG.md), the pictures and the written change log
are in [ILLUSTRATED.md](ILLUSTRATED.md), the index is
[CHECKLIST.md](CHECKLIST.md), and the six rulings are in [DECISIONS/](DECISIONS/).

---

## Ready to build — Alex has ruled

### 1. Item 9 — stop the Try reflow · **Option C**

Pressing Try grows each node's card by up to 200px into a 60px gap, twice (the
loading skeleton, then the real content), so cards overrun their neighbours.
Option C: reserve a **small fixed strip** in the card at rest — one line, roughly
30px, showing a quiet "not run yet" — and move the full scrollable preview into
`WirePeekPopover`, which already renders that widget from the same query. The
card's height then never changes, so nothing can reflow.

Files: `preview/PreviewWidget.tsx`, `canvas/WorkflowEditorCanvas.tsx` node sizing,
`canvas/port-rows.ts` (`estimateNodeHeight`), `canvas/WirePeekPopover.tsx`.

**Do at the same time — the cache-evicted alert bug**, because it is the same
file. `PreviewWidget`'s docblock says the recovery alert must only appear in
replay, but the code has no replay check, which is how item 10 was reproduced on
a first non-replay Try. Consequence: that preview row was probably never
*written* rather than expired, which is why the copy says "isn't in the preview
cache" rather than "has expired".

**Then re-shoot** `screenshots/01-node-status-badge-failed.png` and
`02-…-succeeded.png` as one wide frame. They are two tight crops only because the
reflow made a wide frame unreadable; `12-BEFORE-try-reflow-overlap.png` is the
kept before-shot.

**Open sub-question:** does the strip show the **first line of the value**, or
only **kind and status**? Recommended: the first line, accepting that it will
look ragged across kinds.

### 2. Item 33 — fix the two failing `@infra` tests

Alex, 2026-08-08: *"just fix the tests."* Run with the **whole stack up** —
frontend, backend, Temporal worker **and the deno-runner**. His standing rule from
the same message: *"it's part of the app, so always run everything, include
deno."* He also gave standing permission to kill and manage the worker, and to
reset or reseed the database.

Command: `RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test
tests/e2e/workflow-builder/specs/tier3-dynamic-node-*.spec.ts`
(skip the DB reset so the seeded demos and the agent-chat demo row survive).

- **`tier3-dynamic-node-run` — "a published node executes in a run and the node
  succeeds"** fails in 55ms with a bare `Activity task failed`. Too fast to be the
  sandbox, which is healthy. **Undiagnosed** — the real error is in the Temporal
  worker's console, which was not readable last session. Start the worker
  yourself and read it.
- **`tier3-dynamic-node-security` — 14.11, "granting the host lifts the denial"**
  returns exit code −1; the runner log shows that `/execute` taking **5,006ms**,
  i.e. a timeout. The test assumes a fetch to a non-existent host fails fast; on
  this machine the lookup appears to hang. Note the permission gate itself was
  fine — the failing assertion is the exit code, and the companion test proving
  the allowlist *blocks* an ungranted host passed.

The other four passed. Also worth fixing while there: the five experiment
runtime suites are gated on `CI` alone rather than an opt-in flag, so locally they
run **by default** and connect to Temporal unguarded — a developer without the
stack up gets a hard failure rather than a skip. That inverts the repo's own
contract in `docs-md/TESTING.md`. Tracked separately under the EXPERIMENTS
FOLLOWUP item / AI-1641.

### 3. Item 20 — the colour vocabulary · **Option D** · its own session

Four typed colours plus grey, each carrying a **handle shape** so colour is never
the only signal. Not combinatorial — the shape says the *same* thing the colour
says, so the vocabulary is five, not five-times-four. Today's real load is 32
rendered colour values carrying ~24 meanings plus 37 glyphs, with two measured
collisions: under deuteranopia the Untyped grey and References teal are the same
dot, and activity blue is identical to childWorkflow purple.

Alex deferred this until the rest landed. It changes how every saved workflow
looks, so it wants a session of its own. Full detail and the palette table in
[DECISIONS/20-colour-vocabulary.md](DECISIONS/20-colour-vocabulary.md).

**Open sub-question:** the ruling covers *port dots*. **Node accent colours** are
a separate, larger problem — 12 hex values across 10 activity categories and 6
control-flow types, with red/green at ΔE 5.4 and **blue/purple at ΔE 0.6**, which
is indistinguishable. Fold in, or keep separate? Recommended: fold in — same
channel, same files, and doing the ports alone leaves the louder collision on
screen. Three unambiguous drifts (two greys for one wire, two reds for one error,
blue meaning both "any data" and "document") will be fixed regardless.

---

## Known defects, unfixed, nobody reported them

**The settings drawer floods the undo stack.** The Description and Version fields
call `setConfig` on *every keystroke*, so typing one word pushes about eight
entries onto a 50-deep undo stack — eight Ctrl+Z presses to back out one word,
and real graph edits forgotten after a couple of sentences. Every other text
field in the feature commits on blur specifically to avoid this. Found while
fixing item 1.

**docker-compose gives the backend no LLM credentials** while giving them to the
worker, so the agent would refuse to boot in a container. The 2026-08-08 empty-
credential fix makes this stricter, not looser. Flagged, not fixed.

---

## Needs Alex, not code

- **Per-node removal from a group.** Inderdeep questioned whether the
  right-click-a-member gesture should exist at all: *"I don't know if we need
  that option … if that is the requirement, then this might make sense."* A
  requirements question, and it tangles with a still-open question from the
  2026-07-29 walkthrough about whether deleting one node deletes its group.
- **Canvas accessibility generally** — raised in the call as a constraint, with no
  specific item beyond 20, so none was invented.
- **Item 31 — one question to Inderdeep**: did re-seeding actually fix his 404?
  The item's own acceptance criterion was never met and it was ticked anyway. If
  the workflow was *invisible* rather than *absent* — item 24's exact failure mode
  — the new message sends him to a command that wipes and rebuilds the demo set
  for nothing.
- **Show Inderdeep the July fixes** — an open task in the work store from the
  2026-07-29 walkthrough, separate from this batch.
- **A PDF of ILLUSTRATED.md**, if he wants to send this batch to Inderdeep the way
  the previous one was sent. Offered, not built.

---

## Browser confirmation outstanding

Five manual-test-plan steps are deliberately unticked because they ask a tester to
eyeball copy or layout nobody has seen in a browser yet: **9.1, 9.2 and 11.2**
(the new single `Run…` button and the renamed drawer tabs), **15.2** (the model
picker's static label and a real send against the configured Azure deployment),
and **9.9d** (the replay banner's placement, its height, and the top bar still
fitting from 1920 down).

The standing lesson behind all of these: jsdom runs no layout and renders tooltips
a real browser does not. The one regression this batch introduced — the switcher
chevron losing its explanation — was found by the agent taking screenshots, not by
any of the 5,477 tests.
