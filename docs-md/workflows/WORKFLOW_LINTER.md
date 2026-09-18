# Workflow linter — `npm run workflows:lint`

Validates every workflow document we ship, and reports what the *collection* does not
cover. Source: [`scripts/lint-workflows.mjs`](../../scripts/lint-workflows.mjs).

```bash
npm run workflows:lint             # templates on disk
npm run workflows:lint:all         # templates + the seeded demos (needs the postgres container)
npm run workflows:lint -- --strict # exit 1 on a required-shape gap
```

It answers two deliberately separate questions.

## 1. Is each workflow still a valid document?

Schema and semantic validity against the **current** catalog and kind taxonomy, using
`graph-workflow`'s own validator. Per-workflow, and the half that can regress from a code
change: a catalog edit or a kind retag can silently invalidate a shipped template that no
test ever opens, which is exactly what the 2026-07-18 taxonomy wave did.

This is why the linter runs in CI ([`backend-qa.yml`](../../.github/workflows/backend-qa.yml)),
on changes to `packages/**`, `docs-md/workflows/templates/**`, or the script itself. It runs
after `build:packages` because it loads the built validator.

## 2. Does the collection exercise every shape we support?

A property of the *set*, which no per-workflow check can answer. Shapes come from the spec's
own "X can be either A or B" clauses — a map's item key declared in `config.ctx` or not, a
map reached by a real edge or only by its `bodyEntryNodeId` setting, and so on.

The point is falsifiability. If no workflow anywhere has a shape, a check written against
that shape passes no matter what the code does. That is how `MANUAL_TEST_PLAN` 4.14/4.15 came
to assert something unreachable.

### `required` vs `coveredBy`

- **`required: true`** — a shipped workflow must have this shape, because something reads an
  existing example rather than building its own: a manual walkthrough step that needs a
  workflow to open, or an automated check that loads from the collection.
- **`coveredBy`** — names a check that *constructs* the shape itself. Such a check is already
  falsifiable, so the shape needs no shipped example and is reported as covered, not as a gap.

The distinction matters in both directions. A report that calls a covered shape a "gap"
invites busywork building fixtures nothing needs — and a linter that overstates gaps gets
ignored, which is how a real one slips through.

### Shape coverage needs `--db`

Three shapes (`error-policy-fallback`, `inline-child-graph`, `source-api`) exist **only** in
the seeded demos, which live in the database rather than on disk. Judged against templates
alone the report would name three gaps that are not real, so gap accounting requires `--db`;
without it the counts print as informational. In CI, `--strict` therefore gates on document
validity alone.

## Adding or changing a shape

Two failure modes are symmetric, and both are silent:

- A shape with **no example** makes any check against it unfalsifiable — it hides a gap.
- A **wrong predicate** reports a gap that does not exist — it fabricates one. This has
  already happened once: `inline-child-graph` tested `workflowRef.inline` when the real field
  is `workflowRef.type === "inline"`, and reported a missing shape the collection had.

So verify a new predicate before trusting a zero:

1. Check the field path against [`packages/graph-workflow/src/types.ts`](../../packages/graph-workflow/src/types.ts).
   That alone would have caught the bug above.
2. For complementary pairs (declared/undeclared, by-edge/by-setting), the two counts **must**
   sum to the number of workflows that have the underlying construct at all. If they do not,
   one of the pair is broken. This turns "we found no example" into a positive result rather
   than an assumption.

When a check needs a shape nobody has, add a workflow — or a test that builds it and a
`coveredBy` entry saying so. Do not weaken the check.

### Known constraint: the undeclared loop item

No shipped workflow can have a map whose `itemCtxKey` is absent from `config.ctx`: any
expression referencing the item (`ctx.currentDoc`) fails validation unless the key is
declared, so every real map declares it. The picker's "Loop variables" group is therefore
reachable only when a loop item is consumed by an *input binding* and never by a condition.
That is a real constraint of the model, not an oversight in the demos.

## Related

- [MANUAL_TEST_PLAN.md](MANUAL_TEST_PLAN.md) — the manual checks whose falsifiability this guards
- [ADDING_GRAPH_NODES_AND_ACTIVITIES.md](ADDING_GRAPH_NODES_AND_ACTIVITIES.md) — catalog changes; run the linter after one
- [FEATURE_DEMO_SEEDER.md](FEATURE_DEMO_SEEDER.md) — where the seeded demos come from
- [KIND_TAXONOMY_REFINEMENT_DESIGN.md](KIND_TAXONOMY_REFINEMENT_DESIGN.md) — the wave that motivated question 1
