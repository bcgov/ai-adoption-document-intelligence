# Coverage gap log — demos to seed, e2e specs to add

Running log from the 2026-07-27 walkthrough. **Nothing here is implemented yet**
— this is the sized list to work from once the gallery/coverage split is agreed.

## The rule that generates this list

> If walking a check required me to **build a fixture**, that check is not
> gallery-shaped and the gap belongs here.

It needs no judgement, which is the point. A gallery step reads *"open this, see
that"*; a step that reads *"build this, then check that"* has no artifact to
open. **29 of the plan's 152 checks** open with a construction verb (Build,
Create, Publish, Author, Drag, Declare); only **10 of 16 parts** carry a
`▶ Demo:` link.

## Routing

| Route | For | Notes |
|---|---|---|
| **Gallery** | anything a user should *see* | seed the **end state**, not the procedure — a demo that already references a deleted lineage beats "go delete one", because walking it doesn't consume it |
| **e2e** (`tests/e2e/`, 76 specs across tier1/2/3) | deterministic regression risk | where bug fixes go; they do **not** become gallery steps |
| **Manual-only** | human judgement, real IDIR, cross-group needing a second API key | genuinely not automatable |

---

## G1 — Demos to seed (`scripts/seed-feature-demos.mjs`)

| # | Demo | Covers | Why it's a gap | Size |
|---|---|---|---|---|
| **D1** | **Library workflow with typed ports** — declare an input `kind: PreparedFile` and an output `kind: DocumentContent` | **7.8**, and enriches Part 10 | 7.8 is the only check for typed library ports, and no seeded library declares a `kind`. I had to author `WALK-7.8 typed ports` to walk it at all | S |
| **D2** | **Workflow referencing a deleted `dyn.*` lineage**, seeded already-deleted | **14.8** (deleted half) | The plan asks you to delete a lineage yourself — destructive, and it consumes the Part-14 demo for the next walker. Seeded in the end state, the user just opens it and sees the red **DELETED** badge, the settings alert and the validator error | S |
| **D3** | **Runnable dynamic node** — extend the existing Part-14 demo rather than add one | **14.9** | 14.9 says "build `source.api → dyn.uppercase-url`". The existing Part-14 demo shows the DYN pill and script editor but is not wired to run. Also the natural home for **D-12** once the preview message is fixed | M |

| **D4** | **Part-10 demo library needs declared ports and a second version** | **7.8**, **12.5**, **10.4** | The seeded `Demo — Library workflow (Part 10)` declares **0 inputs / 0 outputs**, so the childWorkflow signature summary renders empty — nothing to look at. It also has **only one version**, so 12.5's "pick `v2` → stamps `version:2`" cannot be walked at all. Giving this one demo typed ports and a v2 closes D1 as well | S |

Each replaces a throwaway I created. Everything I built is listed under
"Artifacts created" in `WALKTHROUGH_PARTS_2_14.md`.

## G2 — e2e specs to add

Deliberately short. Bug fixes earn an e2e only where a unit test *structurally
cannot* see the failure.

| # | Spec | Guards | Why a unit test is not enough | Size |
|---|---|---|---|---|
| **E1** | `tier1-dynamic-node` — **system-admin identity** variant | the `/dynamic-nodes` breakage (`dd6cdafb`) | The one that actually bit us. Unit tests mock `fetch` and never assert what reaches the wire; the `x-api-key` path resolves to exactly one group, so **no** existing layer reaches the admin branch. Needs the request-level admin simulation recorded in the `app-browser-auth` skill | S |
| **E2** | `tier1-dynamic-node` — publish from the palette modal drops the node | 14.8 auto-drop (`64d86d73`) | The decisive argument: my unit test passes, but the live bug had a **second** cause (React render timing) the unit test did not model. I only found it in a browser | S |

**Explicitly not adding e2e for:** undo-during-replay (`fd3194bb`) and the 9.9c
replay chip. Both are fully pinned by falsifiable unit tests; an e2e would be
duplicate cost.

## G3 — Open product decisions (block gallery steps)

Neither can become a gallery step until ruled on, because the correct
observable behaviour is undecided.

| # | Question | Blocks |
|---|---|---|
| **D-11** | Does **any** validation error disable Try/Run, or only errors that make the graph structurally unrunnable? | 14.8's "Try disabled" criterion |
| **D-13** | Bundle Monaco locally (`loader.config({ monaco })`) instead of fetching it from `cdn.jsdelivr.net`? | nothing in the plan, but it decides whether the authoring surface works on a locked-down network at all |

## G4 — Plan structure

Proposed split, to do **after** the walk finishes:

- **Gallery** — demo-driven, one path per feature area, every step "open this,
  see that", walkable end to end in well under an hour.
- **Coverage index** — the current matrix, repurposed. Not a document anyone
  walks: for each capability it records *where the assurance lives* (which e2e
  tier, which unit spec, or "human judgement"). That is the honest job it is
  already doing — its own "unit/integration-backstopped" notes are exactly that
  index, written in the margins.

The 29 construction-verb steps are the conversion worklist: each is either
`→ Gallery` (seed a demo, rewrite as "open this") or `→ Coverage index`
(already automated; stop asking a human).
