# Item 33 — getting a developer through the infrastructure test steps

> ## Ruled: *"just fix the tests"* — and what that turned up
>
> **Alex, 2026-08-08.** Done 2026-08-09: all eleven `@infra` tests in
> `tests/e2e/workflow-builder/` pass, three consecutive runs, no flake.
>
> **The recommendation below was too generous in one specific way.** It said the
> `@infra` tests "exist, they pass when run, and nothing runs them
> automatically". The first two clauses were assumptions — nobody had run them.
> When they were run, **three of eleven failed**, and each failed for a
> different reason:
>
> | Test | Cause | Where the defect was |
> |---|---|---|
> | `tier3-dynamic-node-run` (×2) | worker had no `PLATFORM_API_KEY`; `dyn.run` refuses in ~50ms | configuration — and an unreadable failure message, now fixed |
> | `tier3-dynamic-node-security` 14.11 grant half | DNS for a non-existent public host takes 8.1s in the runner container, overrunning its own 5s timeout | the test's clock was somebody else's network — and **the manual step told a human to do the same thing** |
> | `tier3-try-preview` | reloads the editor, and `RunStateProvider` restores no run | the test, pre-existing, unsound as written |
>
> That last column is the point. Two of the three were **not** product defects,
> which is what the table below predicted. But the 14.11 finding travels: the
> written manual instruction ("add the host to `allowNet` → same script
> succeeds") fails the same way for any person on a corporate network, and no
> amount of automation would have found that — running it did.
>
> **What is still open is the half this document argued was the valuable half:**
> the cold walk of 14.1–14.6 by somebody who has not built this repo. Naming
> that person is still Alex's, for the reason given at the end.
>
> One more thing surfaced by running things: the **default** e2e suite — the
> hermetic one, not the opt-in `@infra` tier — has **12 failing tests** on this
> branch, pre-existing, mostly pointing at this batch's own top-bar and drawer
> rework. Recorded in WORKLOG.md "Wave G".

---


**The question:** The reviewer could not execute the `curl`/infrastructure steps of
Part 14 (14.1–14.6 and 14.11–14.13), so who should, and on what?

**The recommendation:** don't assign nine steps to a developer. Seven of the
nine are already machine-verified; run the two opt-in `@infra` suites yourself
(one command), and give a developer the *narrower and more valuable* job — a
cold walk of 14.1–14.6 on a machine that has never built this repo, because
what the reviewer actually hit was setup, not code.

**Why this changes the ask:** the nine steps are not nine unverified steps. They
are nine steps with existing automated backstops that nobody has run, plus one
genuine gap that automation cannot close — whether the documented commands work
as written for a second person.

---

## What the reviewer said

> *"This network egress blocked, I had no clue. Remote import blocked,
> environment isolation … mostly the technical stuff, I could not."*

Alex's response in the call: *"it would be good to get some of the technical
walkthrough — maybe some of the guys can help me. Developers."*

That is the right instinct. What follows narrows it.

---

## What is already verified, and by what

**"Backstopped"** below means an automated test asserts the same pass criterion
the test plan states in prose. **`@infra`** is a Playwright tag for tests that
need live infrastructure — a Deno runner sidecar and a Temporal worker — and
they are **excluded from every default run**
([playwright.config.ts:26](playwright.config.ts#L26): `if (!process.env.RUN_INFRA) excludedTags.push(/@infra/)`).
So they exist, they pass when run, and nothing runs them automatically.

| Step | What it checks | Backstopped by | Runs in CI? |
|---|---|---|---|
| 14.1 Publish (create) | 201, v1, signature | [dynamic-nodes.controller.spec.ts:88](apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts#L88), [dynamic-nodes.service.spec.ts:94](apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts#L94) | yes |
| 14.2 Publish negatives | each 400 stage; 409 on live duplicate | service.spec [L137–L223](apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts#L137) (stage short-circuits), controller.spec [L112–L143](apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts#L112) | yes |
| 14.3 New version | 200 v2; `@name` mismatch → 409; unknown → 404 | controller.spec [L151–L191](apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts#L151), [dynamic-node.repository.spec.ts:358](apps/backend-services/src/dynamic-nodes/dynamic-node.repository.spec.ts#L358) | yes |
| 14.4 List / detail | sorted by slug, excludes soft-deleted, `headVersion`, `versionCount`, `usedInWorkflowCount` | controller.spec [L192–L288](apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts#L192), repository.spec [L450–L591](apps/backend-services/src/dynamic-nodes/dynamic-node.repository.spec.ts#L450) | yes |
| 14.5 Soft-delete | 200 + `deletedAt`, idempotent, used-in-N | controller.spec [L289–L328](apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts#L289), repository.spec [L592–L629](apps/backend-services/src/dynamic-nodes/dynamic-node.repository.spec.ts#L592) | yes |
| 14.6 Merged catalog | statics first, dynamic sorted, cross-group isolation, 30s TTL cache | service.spec [L370–L521](apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts#L370) — five named scenarios incl. "invalidating g-1 does not affect g-2" | yes |
| 14.11 Network egress | allowlist gate + runtime denial | `tests/e2e/workflow-builder/specs/tier3-dynamic-node-security.spec.ts` | **no — `@infra`, opt-in** |
| 14.12 Remote import | allowlisted-host rejection at publish or runtime | same file | **no — `@infra`** |
| 14.13 Env isolation | `Deno.env.get("PATH")` denied | same file | **no — `@infra`** |

Every step the reviewer skipped has coverage. Six of the nine run on every CI
build. The three security ones run only when somebody sets `RUN_INFRA=1`.

---

## What the automation does *not* cover

Three things, and they are what a human is for:

1. **The commands in the document, as written.** The specs call the service and
   controller directly with a mocked identity. Nobody has ever executed the
   literal `curl` lines in Part 14 against a running stack with real
   authentication. A copy-paste error in the docs is invisible to every test.
2. **Setup on a machine that is not Alex's.** This is the one that actually bit.
   the reviewer's Part 14 failure and his Part 15 failure (the agent chat, item 23)
   and his 404 on the Part 14 demo link (item 31) were all the same class of
   problem: the environment was not what the document assumed. Item 31 in
   particular turned out not to be a code defect at all — the seeder and the
   test plan agreed character for character; the demos had simply never been
   seeded on his box.
3. **The real sandbox.** `dynamic-nodes.service.spec.ts` asserts the *allowlist
   intersection logic* with a mocked runner ([L224](apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts#L224)).
   Only the `@infra` suite drives a real Deno runner and proves the sandbox
   actually denies egress. That distinction matters: the unit test proves we
   ask for the right thing; the infra test proves the sandbox enforces it.

---

## Recommendation, split by who does it

### You, tonight or any time — one command, no person needed

```bash
RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test \
  tier3-dynamic-node-security tier3-dynamic-node-run
```

Covers **14.9–14.13**. Needs the Deno runner sidecar and a Temporal worker up,
and `tier3-dynamic-node-run` additionally needs the worker's `PLATFORM_API_KEY`
set (the variable name — nothing here needs its value). `PLAYWRIGHT_SKIP_DB_RESET=1`
is not optional locally: the e2e global-setup resets and reseeds the database
before every run, which would wipe your dev data and the seeded demos.

If those pass, 14.11–14.13 are verified and item 33 shrinks to the walk below.

### A developer — the cold walk of 14.1–14.6

**The selection criterion is counterintuitive: pick someone who has *not* set
this repo up.** The walk's value is not "do the endpoints work" — six CI tests
already answer that. It is "can a second person follow this document from a cold
machine and get to a working stack", which is the exact failure the reviewer hit
three separate times. Somebody who already has the repo running will silently
skip the steps that break.

What to hand them: Part 14 steps 14.1–14.6, the env table in Part 15, and one
instruction — **record where you got stuck, not just whether it passed.** The
output that matters is the list of assumptions the document makes and does not
state.

**Naming the person is yours.** The store does not record who on the team has
capacity, and guessing a name here would put a task on somebody without their
knowing.

### Not needed

14.7, 14.8, 14.14 were not in the reviewer's skipped set and already have e2e
coverage (`tier1-dynamic-node`, plus 14.14 `@infra`).

---

## What closing this looks like

Item 33 is done when: the two `@infra` suites have been run once and their
result recorded in the plan's checkboxes, **and** one developer has walked
14.1–14.6 cold and reported what the document failed to tell them. The second
half is the one that produces new information.
