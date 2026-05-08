# Shared rules for all experiment branches

These rules apply to every experiment branch (`experiment/01-...` through `experiment/05-...`) stacked on `feature/extraction-experiments`. Each per-experiment brief references this file.

## Branch boundaries

You are on `experiment/<slug>`, stacked on `feature/extraction-experiments`. **Stay in your engine's lane:**

### Files you MAY edit
- `apps/temporal/src/ocr-providers/<engine>/**` — new provider folder for your engine
- `apps/temporal/src/activity-registry.ts` — add your engine's activity types
- `apps/temporal/src/activities/<engine>-*.ts` — new activities specific to your engine, if any
- Workflow graph JSON for your engine, in seed or via the workflow CRUD API
- Tests under your provider folder
- `experiments/results/<slug>/SUMMARY.md` — your results write-up
- `docs-md/EXTRACTION_EXPERIMENTS.md` — fill in your experiment's row in the status table and the engine-integration checklist

### Files you MUST NOT edit without explicit approval
- Other engines' provider folders (`ocr-providers/<other-engine>/`)
- The shared `OCRResult` type — extend in your mapper, don't widen the canonical type
- `apps/shared/prisma/schema.prisma` — schema changes happen on the parent or are user-approved
- `_shared-rules.md` (this file), other experiment briefs, parent-branch architecture docs
- `.env.sample` files — request additions on the parent if you need new vars
- `CLAUDE.md`

If you find a gap that requires editing shared files, **stop and raise it back**. Don't silently widen scope.

## Engine-integration checklist (codebase-derived)

Confirm and document these 12 items as you implement. Fill in the checklist row for your experiment in `docs-md/EXTRACTION_EXPERIMENTS.md`.

1. **Map engine output to canonical `OCRResult`** — mapper at `apps/temporal/src/ocr-providers/<engine>/<engine>-to-ocr-result.ts`. Pages with words/lines/KVPs at the granularity downstream activities consume. Reference: `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`.
2. **Activity-type registration in `apps/temporal/src/activity-registry.ts`** — single sync activity (Mistral pattern, `mistralOcr.process`) or multi-step `submit`/`poll`/`extract` (Azure DI pattern). Set timeout + retry policy that matches engine's SLA.
3. **Field schema → engine format converter** — if engine takes a schema (Mistral, CU), file at `apps/temporal/src/ocr-providers/<engine>/field-definitions-to-<engine>.ts`. Convert `FieldDefinition[]` (with `field_type`, `field_format`) to engine format. Reference: `apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`.
4. **Confidence values 0–1** — `OCRResult` confidences must be 0–1 to interop with `apps/temporal/src/activities/check-ocr-confidence.ts` (default threshold 0.95).
5. **Bounding-box coordinate convention** — Azure DI returns inches from top-left at API `2024-11-30`. If your engine returns pixels or page-relative coordinates, convert in the mapper.
6. **Page indexing** — match the convention used in `OCRResult` and downstream activities. Document 0- or 1-indexed in your `SUMMARY.md`.
7. **Auth & endpoint via env vars** — declared in `apps/{backend-services,temporal}/.env.sample` already (parent-branch deliverable). Document whether engine routes through APIM or direct in `SUMMARY.md`.
8. **Workflow graph definition** — JSON wiring engine + applicable post-processing nodes (`ocr.cleanup`, `ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`, `ocr.enrich`, `ocr.checkConfidence`, `ocr.storeResults`). Persist via the dataset seed extension or workflow CRUD API.
9. **Engine-internal preprocessing** — does the engine deskew/rotate/denoise internally? Document so we don't double-process. Upstream is `apps/backend-services/src/document/pdf-normalization.service.ts`.
10. **Test coverage** — see dev loop below.
11. **Benchmark integration** — extend `apps/shared/prisma/seed.ts` so the experiment is **runnable from the API without manual setup** after `npm run test:db:reset`. Specifically, seed:
    - A `WorkflowLineage` + `WorkflowVersion` for your experiment's graph.
    - A `BenchmarkDefinition` with id `seed-experiment-{slug}-definition` in the parent-seeded `BenchmarkProject` `seed-experiments-project` (project + a `Split` per local dataset are already seeded on the parent).
    - The definition references your seeded workflow version + `seed-local-{folder}-{visibility}-split` + `seed-local-{folder}-{visibility}-v1` dataset version.

    Then run the benchmark via the existing API:
    ```
    POST /api/benchmark/projects/seed-experiments-project/definitions/seed-experiment-{slug}-definition/runs
    ```
    Tag the run with `experiment-{slug}`. The user provides the API key for programmatic runs (`x-api-key: $TEST_API_KEY`). After your branch lands, `scripts/run-experiment-benchmarks.sh` will be able to trigger your experiment alongside the others.
12. **Cost/usage telemetry** — record per-call usage on the run's `metrics` JSON. DI per page, Mistral per page/char, Azure OpenAI per token, CU has both content-extraction and generative-model components.

## Dev loop

Not an accuracy-iterate-until-pass loop. Discipline:

1. **Implement** the engine integration (provider folder + mapper + activity registration + workflow graph + any new env vars approved on the parent).
2. **Run the workflow on one real document** end-to-end against the real engine API. Confirm `OCRResult` produced, no errors.
3. **Run a benchmark programmatically** via the backend benchmark API against the seeded dataset. Confirm results land in `BenchmarkRun` with metrics filled in.
4. **Stable** when steps 2 and 3 succeed without manual intervention.
5. **Write Jest tests with mocked engine responses** — record actual responses once during step 2, then replay in tests under `apps/temporal/src/ocr-providers/<engine>/__tests__/` (or alongside files). Verify the workflow runs correctly against the mocks.

Cross-engine accuracy comparison happens **after** all experiments land, by reading their `BenchmarkRun` records side-by-side. No threshold gates "done."

## Done criteria

- All 12 checklist items answered in `docs-md/EXTRACTION_EXPERIMENTS.md` for your experiment.
- One real-API workflow run succeeded.
- One programmatic benchmark run succeeded; `BenchmarkRun` record tagged `experiment-XX`.
- Mock-based tests pass (`npm test` for the relevant package).
- Code committed to your branch.
- `experiments/results/<slug>/SUMMARY.md` written with: which post-processors are wired, observations from the real-API run, benchmark run ID(s), any gaps found in existing providers during audit.

## What to do if something blocks

If your engine doesn't fit the pattern (e.g., requires a new global env var, or surfaces a gap in the canonical `OCRResult` type, or requires a schema migration), **stop and raise it back** rather than silently editing shared files. The parent branch's purpose is to absorb shared changes; the experiment branches stay narrow.
