# Prompt for `improve/02-strict-eval-e03-e04-e05`

Copy this into a new chat to re-run E03/E04/E05 against the cleaned dataset
+ strict evaluator. Measurement-only — no prompt iteration. All three
experiments go on one branch (`improve/02-...`).

---

Start a new improvement-iteration branch off the current tip of
`improve/01-strict-eval-and-mistral-tune`. The cross-experiment
infrastructure landed on `improve/01` is complete: strict evaluator
(`apps/shared/prisma/seed.ts:2044-2062`), one-of GT array support
(`apps/temporal/src/evaluators/schema-aware-evaluator.ts`), dataset move
from `samples-mix/private` → `public`, GT format-variant promotions on
sin/date/phone, and helper scripts in `apps/temporal/scripts/`. E02
is at canonical pass_rate 0.925 / f1.median 0.972 / matchedFields.median
69 of 74 — strongest result on record for E02.

This phase re-runs E03, E04, and E05 against the same cleaned-GT +
strict-rule state so the cross-experiment table reflects strict
metrics for all five engines. Measurement-only — no prompt iteration.

BRANCH: create `improve/02-strict-eval-e03-e04-e05` from
`improve/01-strict-eval-and-mistral-tune` (NOT from main — we want
every E01-E05 provider + the improve/01 evaluator + dataset changes).
Naming continues the `improve/<NN>-<short-desc>` convention so future
improve branches stack.

START BY READING (in this order):

1. `experiments/results/02-mistral-doc-ai-azure/SUMMARY.md` — the
   "## Strict-equality re-evaluation + improvement loop (improve/01)"
   section establishes the methodology and the canonical pre/post
   comparison table.
2. `experiments/POST_BENCHMARK_FOLLOWUPS.md` item 1 — the cross-
   experiment rollout plan; this branch handles E03/E04/E05.
3. `experiments/results/05-vlm-ocr-hybrid/SUMMARY.md` cross-experiment
   table — the source of truth for cross-engine numbers. You'll update
   E03/E04/E05 rows here at the end.
4. `experiments/results/02-mistral-doc-ai-azure/iteration/CHANGELOG.md`
   round-3 and round-5 entries — engine-ceiling diagnosis pattern. E03
   also uses a Foundry deployment (Azure Content Understanding, not
   Mistral Document AI) — keep an eye on whether CU's annotation pass
   has the same OCR-markdown-only limitation that the Mistral SKU has.
5. `apps/temporal/scripts/` — note the helper scripts available:
   - `trigger-experiment-benchmark.ts <slug>` — POSTs the run, returns
     the run id. Loads `TEST_API_KEY` from env without leaking it.
   - `poll-experiment-run.ts <runId> <slug>` — polls until terminal and
     writes `experiments/results/<slug>/benchmark-run.json`.
   - `dump-errors-for-gt-cleanup.ts <slug>` — generates the per-sample
     mismatch table at `experiments/results/<slug>/iteration/errors-for-gt-cleanup.md`.
     Supports `--known-hard "id1,id2"` (defaults to `"81 blank,81 coffee"`).
   - `promote-gt-format-variants.ts <slug> [--write]` — auto-promotes
     sin/date/phone GT scalars to one-of arrays where the engine reads
     form-as-written. Dry-run by default.
   - `setup-cu-defaults.ts` — one-time CU defaults patch (E03 only).
   - `preflight-vlm.ts <deployment>` — checks env + 1×1 PNG strict-mode
     round-trip (E04).
   - `preflight-hybrid.ts <deployment>` — same plus Azure DI probe (E05).
6. `apps/temporal/src/evaluators/schema-aware-evaluator.ts` — note the
   evaluator now accepts arrays as GT values (any-match across one-of
   alternates). All five matching rules support it.
7. `data/datasets/samples-mix/public/` — the cleaned dataset.
   `sin` / `spouse_sin` / `date` / `spouse_date` / `phone` /
   `spouse_phone` GTs for 23 samples are already one-of arrays
   accepting Mistral's form-as-written variants. E03/E04/E05 may
   produce DIFFERENT format variants (CU and gpt-5.4 may normalise
   differently than Mistral); `promote-gt-format-variants.ts` is the
   tool to absorb those too if they show up.

PREREQUISITES (confirm at session start):

- Backend running with the cleaned dataset uploaded to blob storage.
  If the backend has been restarted since `improve/01` landed but
  WITHOUT `FORCE_RESYNC_LOCAL_DATASETS=true`, the
  `samples-mix-public` prefix may not be on blob storage yet — the
  first benchmark trigger will fail at materialization. Recovery:
  restart backend once with `FORCE_RESYNC_LOCAL_DATASETS=true` on
  the env, drop the env var on the next boot.
- Azure deployments still live from previous work:
  - `gpt-5.2` capacity 100 (E03)
  - `gpt-5.4` capacity 100 (E04 + E05)
  - `text-embedding-3-large` (E03)
  - Azure DI resource (E05)
  - CU defaults patched (E03 — run `setup-cu-defaults.ts` if you've
    rotated the resource)
- TEST_API_KEY auto-loaded by trigger script from
  `apps/backend-services/.env` (or the override file). Don't read
  the value yourself; the script handles it.

KNOWN-HARD SAMPLES (treat as floor, not signal):
- `"81 blank"` and `"81 coffee"` are low-resolution / obscured forms.
  Every engine in the stack scores poorly on them. Mistakes are
  EXPECTED. The `dump-errors-for-gt-cleanup.ts` script tags them
  ⚠️ KNOWN-HARD by default. Document any movement on these samples
  but don't iterate against them.

PER-EXPERIMENT FLOW (run independently; each is ~5-30 min wallclock):

### E03 — Azure Content Understanding + gpt-5.2

```bash
# Optional pre-flight (only needed if CU resource was rotated since
# the fuzzy-era canonical run); script is idempotent:
cd apps/temporal
npx tsx -r tsconfig-paths/register scripts/setup-cu-defaults.ts

# Trigger:
npx tsx -r tsconfig-paths/register \
  scripts/trigger-experiment-benchmark.ts 03
# → captures run id

# Poll (~15-30 min wallclock; gpt-5.2 generative is the bottleneck):
npx tsx -r tsconfig-paths/register \
  scripts/poll-experiment-run.ts <runId> 03-content-understanding
# → writes experiments/results/03-content-understanding/benchmark-run.json

# Errors file for GT cleanup review:
npx tsx -r tsconfig-paths/register \
  scripts/dump-errors-for-gt-cleanup.ts 03-content-understanding
```

If the errors file lists ≥ 10 sin/date/phone format-variant mismatches,
run `promote-gt-format-variants.ts 03-content-understanding` (dry-run
first). If the proposals look right, apply with `--write` and re-run
the benchmark — that's one extra paid run but locks in the format
recovery. Promotions are idempotent + deduped against E02's existing
one-of arrays.

### E04 — gpt-5.4 VLM-direct

```bash
# Pre-flight:
cd apps/temporal
npx tsx -r tsconfig-paths/register \
  scripts/preflight-vlm.ts gpt-5.4

# Trigger + poll (~6-10 min wallclock):
npx tsx -r tsconfig-paths/register \
  scripts/trigger-experiment-benchmark.ts 04
npx tsx -r tsconfig-paths/register \
  scripts/poll-experiment-run.ts <runId> 04-vlm-direct

# Errors:
npx tsx -r tsconfig-paths/register \
  scripts/dump-errors-for-gt-cleanup.ts 04-vlm-direct
```

Same conditional promote-GT step as E03.

### E05 — gpt-5.4 VLM + OCR hybrid

```bash
# Pre-flight:
cd apps/temporal
npx tsx -r tsconfig-paths/register \
  scripts/preflight-hybrid.ts gpt-5.4

# Trigger + poll (~5-10 min wallclock; 4:33 was the fuzzy-era run):
npx tsx -r tsconfig-paths/register \
  scripts/trigger-experiment-benchmark.ts 05
npx tsx -r tsconfig-paths/register \
  scripts/poll-experiment-run.ts <runId> 05-vlm-ocr-hybrid

# Errors:
npx tsx -r tsconfig-paths/register \
  scripts/dump-errors-for-gt-cleanup.ts 05-vlm-ocr-hybrid
```

Same conditional promote-GT step.

WHAT TO UPDATE per experiment:

1. **`experiments/results/<slug>/benchmark-run.json`** — overwritten by
   the poll script.
2. **`experiments/results/<slug>/iteration/errors-for-gt-cleanup.md`** —
   generated by `dump-errors-for-gt-cleanup.ts`.
3. **`experiments/results/<slug>/SUMMARY.md`** — add a section
   `## Strict-equality re-evaluation (improve/02)` near the top
   (mirror E02 SUMMARY's structure). Include:
   - Run id of the canonical strict run.
   - The 3-column comparison table:
     `| | Fuzzy@0.85 (historical) | Strict (no GT cleanup) | Strict + GT cleanup (canonical) |`
     ... pass_rate, f1.median, f1.mean, precision.mean, recall.mean,
     matchedFields.median, falsePositives.mean.
   - One-paragraph retrospective: which samples regressed under strict,
     whether GT cleanup absorbed format variants (and how many), any
     engine-specific quirks surfaced.
   - If GT cleanup happened, list the format-variant categories absorbed
     (e.g. "CU normalises SINs with hyphens — 12 sin/spouse_sin
     promotions added").
4. **Cross-experiment table in `experiments/results/05-vlm-ocr-hybrid/SUMMARY.md`**
   — once all three are done, replace E03/E04/E05 column metrics with
   the new strict numbers. Drop the per-row `(fuzzy)` tag. Update the
   footnote to reflect that all 5 engines are now strict-evaluated.
   Note which engine benefited most from GT cleanup if there's a
   clear winner.

WHAT NOT TO DO:

- Don't change `apps/shared/prisma/seed.ts` evaluator config (already
  `exact` on improve/01).
- Don't change the workflow JSONs except for the `targetLocalDataset`
  if it doesn't already point at `samples-mix-public` (it should — the
  `improve/01` rename touched all 5).
- Don't change the workflow JSONs' `parameters.documentAnnotationPrompt`
  / `parameters.fieldDescriptions` / equivalent CU analyzer config.
  This branch is measurement-only — no prompt iteration.
- Don't run paid benchmarks on E01 or E02 (out of scope here).
- Don't run paid benchmarks per format-variant change — measure once,
  promote GT if obvious, re-measure once. Cost-discipline.

COST EXPECTATION:

- E03 (gpt-5.2 generative on 40 samples): ~$3-5 per run
- E04 (gpt-5.4 vision on 40): ~$1-2 per run
- E05 (gpt-5.4 vision + DI on 40): ~$1-2 per run
- Worst case (each engine needs a second post-promotion run): $10-18
  total. Plan accordingly.

CONVERGENCE (done when):

- `benchmark-run.json` from this branch exists for E03, E04, E05.
- Each has a "Strict-equality re-evaluation (improve/02)" section in
  its SUMMARY.md with the comparison table + retrospective.
- Each has `iteration/errors-for-gt-cleanup.md` generated.
- E05 cross-experiment table is updated for all 5 engines strict.
- Tests pass (CI=true): `cd apps/temporal && npx jest src/experiment-03 src/experiment-04 src/experiment-05 src/ocr-providers/azure-content-understanding src/ocr-providers/vlm-direct src/ocr-providers/vlm-ocr-hybrid`.
- Lint + tsc clean (pre-commit hooks gate this).
- Commits on `improve/02-strict-eval-e03-e04-e05`. One commit per
  experiment is fine, OR a single bundled commit per the
  "all-on-one-branch" framing. Final cross-experiment-table commit
  at the end.

REPORT BACK AT END:

- Per-experiment delta vs fuzzy-era (one line each).
- Updated cross-experiment table (paste it).
- Total cost spent (rough).
- Any engine that hit a similar Foundry-style ceiling to Mistral
  (E03 in particular — CU's annotation pass on Foundry could have
  the same OCR-markdown-only limitation).
- Whether any of E03/E04/E05 now beat E02 on the cleaned-GT
  strict numbers.
