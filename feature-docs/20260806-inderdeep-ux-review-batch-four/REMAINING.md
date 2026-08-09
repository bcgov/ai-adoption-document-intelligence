# What is left — batch four and the rest of Inderdeep's work

**As at 2026-08-09.** All **33 of 33** checklist items are done and committed on
`feature/visual-workflow-builder` (item 33 keeps one open half — a cold setup
walk that needs a name, not code). The branch is clean and every suite is green:
frontend unit **2,706 / 213 files**, `@ai-di/graph-workflow` **1,082**, default
workflow-builder e2e **65**, `RUN_INFRA=1` e2e **11**.

This file exists so the chat can be compacted without losing the thread. The
narrative is in [WORKLOG.md](WORKLOG.md), the pictures and the written change log
are in [ILLUSTRATED.md](ILLUSTRATED.md), the index is
[CHECKLIST.md](CHECKLIST.md), and the six rulings are in [DECISIONS/](DECISIONS/).

---

## Ready to build — Alex has ruled

### ~~1. Item 9 — the Try reflow~~ · **DONE 2026-08-09**

Shipped as Option C in `b6877863` + `033664cf`. Measured 0px height and width
drift across a whole Try on all fifteen `standard-ocr` cards. The cache-evicted
alert bug went with it — `evicted` is now reachable only in replay. Before and
after are in [ILLUSTRATED.md §18](ILLUSTRATED.md); the narrative is Wave F in
[WORKLOG.md](WORKLOG.md).

### ~~2. Item 33 — fix the failing `@infra` tests~~ · **DONE 2026-08-09**

All eleven `@infra` tests in `tests/e2e/workflow-builder/` pass — three
consecutive full runs, no flake. Three were failing; the causes were all
different and only one lived in the product's own test logic:

- **`tier3-dynamic-node-run`** (both tests) — worker configuration, as
  diagnosed. `PLATFORM_API_KEY` now lives in `~/.config/bcgov-di/temporal.env`
  (the loader's first source, ahead of the repo-root `.env`), worker restarted.
  The spec's assertion message now carries the prerequisite, because Temporal
  reports the cause as a bare `Activity task failed` and the failure otherwise
  tells the next person nothing.
- **`tier3-dynamic-node-security` 14.11 (grant half)** — the test's clock was
  **DNS**, not the sandbox. Inside the runner container a lookup for a
  non-existent public host takes **8.1 seconds** (six search domains, corporate
  forwarders), overrunning the runner's own 5s timeout. Now an A/B on one script
  and one host — a closed loopback port, ~40ms, no resolution at all: denied
  without `allowNet`, permitted with it. Manual step 14.11 told a human to do the
  same misleading thing and was corrected.
- **`tier3-try-preview`** — pre-existing, and unsound as written. Fixed by
  re-opening the run from **Run history**, which is the product's own answer to a
  reload losing the run and what the preview copy already tells authors to do.
  That surface had no e2e coverage before this.

`RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test
tests/e2e/workflow-builder/ --grep "@infra"` → **11 passed**, ×3.

**What is still open on item 33** is the half that produces new information: a
cold walk of 14.1–14.6 by a developer who has *not* built this repo. Naming that
person is Alex's — see [DECISIONS/33-infra-test-steps.md](DECISIONS/33-infra-test-steps.md).

<details><summary>The original entry, and the diagnosis it recorded</summary>

Alex, 2026-08-08: *"just fix the tests."* Run with the **whole stack up** —
frontend, backend, Temporal worker **and the deno-runner**. His standing rule from
the same message: *"it's part of the app, so always run everything, include
deno."* He also gave standing permission to kill and manage the worker, and to
reset or reseed the database.

Command: `RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test
tests/e2e/workflow-builder/specs/tier3-dynamic-node-*.spec.ts`
(skip the DB reset so the seeded demos and the agent-chat demo row survive).

- **`tier3-dynamic-node-run` — "a published node executes in a run and the node
  succeeds"** fails in 55ms with a bare `Activity task failed`. **Diagnosed
  2026-08-09** by reading the worker log this session, which is the thing the
  last one could not do. The worker says it plainly:

  > `PLATFORM_API_KEY is not configured on the worker; dynamic-node scripts
  > cannot authenticate their platform callbacks. Set the
  > temporal-worker-secrets PLATFORM_API_KEY.`

  So it is a worker configuration gap, not a code defect, and the 55ms is the
  activity refusing before it ever reaches the sandbox. The fix is to give the
  local worker that variable (name only — never the value) and re-run.
- **`tier3-dynamic-node-security` — 14.11, "granting the host lifts the denial"**
  returns exit code −1; the runner log shows that `/execute` taking **5,006ms**,
  i.e. a timeout. The test assumes a fetch to a non-existent host fails fast; on
  this machine the lookup appears to hang. Note the permission gate itself was
  fine — the failing assertion is the exit code, and the companion test proving
  the allowlist *blocks* an ungranted host passed.

**`tier3-try-preview` is a THIRD pre-existing failure**, found on 2026-08-09
and proven pre-existing by running it at `ebd52e1b`, where it fails *earlier* —
at the wire peek, line 201, before reaching the node preview at all. Its later
assertion is also unsound on its own terms: it reloads the editor and then
expects a preview, but `RunStateProvider` starts every mount with
`activeRunId = null`, which the result strip correctly reports as "Not run yet".
Decide whether the assertion moves before the reload or the provider learns to
restore the run.

The other three passed. Also worth fixing while there: the five experiment
runtime suites are gated on `CI` alone rather than an opt-in flag, so locally they
run **by default** and connect to Temporal unguarded — a developer without the
stack up gets a hard failure rather than a skip. That inverts the repo's own
contract in `docs-md/TESTING.md`. Tracked separately under the EXPERIMENTS
FOLLOWUP item / AI-1641.

### ~~3. Item 20 — the colour vocabulary~~ · **DONE 2026-08-09**

Shipped as Option D **plus** the node accents folded in, on Alex's *"ok, can do
#20 now"*. Port families 7 → 5, each with a shape; node accents 13 → 5 by role;
seven separate copies of the palette collapsed to one. Worst colour-vision pair
went from ΔE 5.2 to **14.2** on the ports and from ΔE 0 to **12.9** on the
accents. Full detail in Wave H of [WORKLOG.md](WORKLOG.md) and the "Ruled" block
in [DECISIONS/20-colour-vocabulary.md](DECISIONS/20-colour-vocabulary.md).

**One thing in it wants Alex's eye, not his approval in the abstract:** the
seven activity *category* accents collapsed into one slate, so every OCR /
validation / storage / transform card now has the same border. The measurement
forced a reduction (13 hues cannot be separated); the choice of axis is taste as
much as evidence. Reverting to per-category is one line in `catalog-utils.ts`,
and brings the collisions back with it.

---

## Needs a design call — found 2026-08-09, not invented

### ~~Where toasts live~~ · **DONE 2026-08-09**

Alex: *"i also like your idea of toast moving down below the header."* Toasts now
start at `top: 120px` — measured in Chromium, the app header ends at 65 and the
workflow top bar at 112, and a toast used to run 16 → 110, covering both.

It also had to stop the container eating clicks. Mantine's `Notifications` root
is a 440px `position: fixed` box that exists whether or not it holds anything; at
16px it only overlapped the header, but moved down it lands on the canvas and an
**empty** toast container swallowed every node click and wire hover in the
top-right quadrant. 2,706 unit tests passed with that in — jsdom runs no layout
and cannot see a fixed overlay. The e2e caught it in one run.

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
