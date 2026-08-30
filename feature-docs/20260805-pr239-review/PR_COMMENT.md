**Proposal: close this as superseded by #242.**

The path fix landed on `develop` yesterday via #242 (`edea8aa8`), independently of this. Same change to the same five files, plus `apps/temporal/scripts/promote-gt-format-variants.ts`, which had the same stale path. Temporal QA is green on `develop` now — so that half of this PR is already in.

That leaves three changes unique to this PR, and I don't think we want any of them:

**1. Excluding the experiment tests from `npm test`.**
The infra-dependent half of each file is already gated:

```ts
const describeRuntime = process.env.CI ? describe.skip : describe;
```

(experiment-01 line 398, same line in the other four). Actions always sets `CI=true`, so the tests needing a DB and minio were never running on the runners. What *was* running is the static layer — 109 assertions on the template JSON: metadata, node wiring, `validateGraphConfigForExecution`, fixture checks. No infra, ~4 seconds. I confirmed with `CI=true npx jest experiment-`: 5 suites pass, 109 passed / 11 skipped.

Since `test:integration` isn't invoked by any workflow, excluding these means they run nowhere — someone could rename a node in a template and CI would stay green.

**2. `@ai-di/billing` in `apps/temporal/package.json`.**
I think this came across from AI-1580 / #219 — `packages/billing` exists on that branch and nowhere else, and nothing here imports it. npm doesn't fail (it just leaves a dangling symlink), but if this merged first, `develop` would reference a package it doesn't have.

**3. The SDPR seeding in `integration-harness.ts`.**
The underlying problem is real — `loadSeededFieldDefs` reads the template from the DB, so it fails on a machine where the seed was never run, which is probably what you were hitting. But that test reads from the DB specifically to get the *real* field types instead of guessing them from key names (there's a comment about a number field being silently typed as a string and losing its `valueNumber`). A hardcoded array is a second-hand copy of those types: when `seed.ts` changes, the harness keeps supplying the old ones and the test passes while the mapper is wrong — the exact bug it exists to catch. For the local case, `npm run db:seed` covers it.

On the `test:integration` idea itself — there's an existing ticket for it, AI-1641 ("Generalize workflow integration test suite beyond experiments and run it in CI"). It covers the same split you were reaching for: fast static assertions separated from the real-cluster E2E layer, behind a single jest project rather than per-file `describe.skip`, plus standing up Temporal/Postgres/blob storage in CI so the heavy layer can actually run somewhere. Worth picking up there instead — one thing to keep in mind is that its acceptance criteria have the static layers still running in the normal unit run, so they keep gating merges.
