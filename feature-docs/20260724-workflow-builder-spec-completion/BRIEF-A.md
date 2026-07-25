# Pass A — Author Journeys

## Standing rules for this pass

- **Scope:** workflow-builder MANUAL_TEST_PLAN Parts 3–9 only (canvas, control-flow
  forms, typed I/O, auto-wire, port wiring, try-in-place/previews). Parts 10–16 are
  out of scope.
- **Discovery only.** Do not modify any source file. Do not fix anything you find.
- **Cite the inventory.** Use the short surface names from
  `feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md`. Do not
  invent names for artifacts or surfaces.
- **Do not read the other passes' outputs.** Independence is the point; overlap
  between passes is a priority signal and is handled at merge.
- **`MANUAL_TEST_PLAN.md` is not an oracle.** It was written from the implementation.
  Something being absent from it is not evidence the behaviour is correct or
  intentional — it is often evidence of exactly the gap you are looking for.
- **Evidence must be real.** Every `evidence` value is either `path/to/file.ts:123`
  that actually resolves, or concrete reproduction steps. Invented citations fail
  the validator.
- **Deliverables:**
  - `feature-docs/20260724-workflow-builder-spec-completion/findings-a.json`
    — a JSON array conforming to the schema below.
  - `feature-docs/20260724-workflow-builder-spec-completion/notes-a.md`
    — your narrative: what you covered, your reasoning on judgement calls, and an
    explicit list of what you could **not** check and why.
- **Self-check before finishing:**
  `node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-a.json`
  must exit 0.
- **Never run an install command** (`npm install`, `npx playwright install`, etc.).
  This repo prohibits it.

## Finding schema

```json
{
  "id": "A-001",
  "pass": "A",
  "title": "one line",
  "severity": "blocker | major | minor",
  "type": "design-gap | impl-gap | non-goal",
  "evidence": "path/to/file.ts:123  OR  concrete reproduction steps",
  "surfaces": ["short-name-from-inventory"],
  "disposition": "fix | defer | won't-support",
  "rationale": "why that disposition"
}
```

`design-gap` = the capability or behaviour was never specified.
`impl-gap` = it was specified and the implementation does not match.
`non-goal` = it is genuinely out of scope and should be recorded as a deliberate
decision so it stops being rediscovered.

## Your task

Walk each journey in
`feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md` against the
implementation, in order, as an author who has read the product's own documentation
and nothing else.

For each step of each journey, establish:

- Can it be done at all?
- Would a competent author **discover** how, without reading source or asking someone?
- How many steps does it take versus how many it should?
- Does anything along the way destroy work already done?

A finding is any **wall** (cannot be done) and any **unguessable step** (can be done,
but only by someone who already knows).

Weight discoverability heavily. A control that exists but cannot be found is a gap,
not a success — the humanGate signal-name field was a free-text input with no way to
know what to type, and it shipped that way because everyone testing it already knew
the answer.

Record where in the journey each finding occurred; that ordering is what makes these
journeys reusable as e2e acceptance scenarios later.

**Do not fix the journeys.** If a journey is wrong about the product, that is itself
worth reporting in `notes-a.md` — but the journeys were written and corrected
deliberately before you ran, so treat them as the requirement.
