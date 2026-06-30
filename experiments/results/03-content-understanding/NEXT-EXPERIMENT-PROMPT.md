# E04 startup prompt

Paste this into a fresh Claude Code session to begin E04. The prompt is
self-contained — it tells the agent what to read, in what order, where
to branch from, and which lessons from E03 to apply pre-emptively.

---

```
Implement experiment E04 from experiments/briefs/04-vlm-direct.md.

**SCOPE REDUCTION (user request, overrides the brief):** the brief
defines a 3-variant × 2-model matrix (single-pass, chain-of-thought,
self-consistency × gpt-4o, gpt-5). The user has scoped this experiment
down to **ONE run only**: variant 1 (single-pass) on **gpt-5.4** only.
Skip variants 2 (chain-of-thought) and 3 (self-consistency); skip
gpt-4o, gpt-5, and gpt-5.5. Build the provider + workflow JSON + tests
for the single-pass variant, run the canonical 40-sample benchmark
once, write the SUMMARY, commit, stop. Do NOT create the cot/
self-consistency workflow JSON variants — they're explicitly out of
scope. The "3 workflow JSON variants" task in the brief is reduced to
"1 workflow JSON variant".

START BY READING (in this order):
  1. experiments/briefs/_shared-rules.md  (canonical patterns; iteration
     kit + sync-provider cache emission + Foundry quota retry sections
     are E02/E03-derived — follow them, they save days)
  2. experiments/briefs/04-vlm-direct.md  (3 variants: single-pass,
     chain-of-thought, self-consistency; 2 models: gpt-5 + gpt-4o;
     gpt-5.5 needs quota uplift before it can be added)
  3. experiments/results/03-content-understanding/SUMMARY.md  (the
     "Meta-process lessons" + "Implications for E04" subsections at the
     bottom enumerate the surprises and patterns we landed on E03 — read
     those before writing any code; they save 30-60 minutes of
     backtracking)
  4. apps/temporal/src/ocr-providers/azure-content-understanding/  (the
     closest pattern to fork — schema-aware engine, structured-output
     mode, idempotent deploy with status-poll, sync-shape activity that
     polls internally, ocrResponse port for cache emission)
  5. apps/temporal/src/scripts/iterate-cu-extraction.ts  (lift this for
     iterate-vlm-extraction.ts; same skeleton)
  6. apps/temporal/src/activities/enrichment-llm.ts  (existing
     callAzureOpenAI helper — use this, don't write a new one)
  7. experiments/results/03-content-understanding/iteration/  (copy as
     starter for E04's iteration kit; replace CU-specific bits with
     OpenAI-structured-output equivalents)
  8. apps/temporal/src/experiment-03-content-understanding.test.ts
     (test pattern: 16 static + 4 fixture-aware + 2 runtime, CI gate via
     process.env.CI)
  9. apps/temporal/src/scripts/{trigger-experiment-benchmark,poll-experiment-run,setup-cu-defaults}.ts
     (reusable scripts E03 left for the chained stack — trigger + poll
     accept any slug, no need to fork)
  10. CLAUDE.md

BRANCH: create experiment/04-vlm-direct FROM experiment/03-content-
understanding (chained stack — branch from the E03 tip e1d6f536, NOT
feature/extraction-experiments). The E03 fixes you inherit:
  - CU provider folder + analyzer-schema-builder + idempotent deploy
    activity (reference; don't modify)
  - trigger/poll TS scripts with runtimeSettingsOverride
  - iteration kit pattern with prompt.md + field-descriptions.json
  - SUMMARY.md template with retrospective + meta-process sections

PREREQUISITES (confirm at session start; do NOT proceed past iteration
without these):
  ✅ gpt-5 deployed at ai-jobstoreai2846ai731114335138 (westus,
     capacity 10)
  ✅ gpt-4o deployed at same resource (capacity 50)
  ✅ gpt-4o-mini deployed at same resource (capacity 100)
  ✅ gpt-5.2 deployed at strukalex-8338-resource (eastus2,
     capacity 100) — usable as a 4th variant if you want
  ⚠ **The brief mentions gpt-5.5; SUPERSEDED by gpt-5.4.** gpt-5.5 is
     the only gpt-5.x model in this subscription gated behind a quota
     uplift ticket (0K TPM in every region for both GlobalStandard and
     DataZoneStandard). Every other gpt-5.x sibling has 1M+ TPM
     available immediately. **Use gpt-5.4 instead of 5.5** — released
     2026-03-05, GA, no ticket required. The user may file a quota
     request for 5.5 to revisit later, but do NOT block on it.

     Deploy gpt-5.4 if not yet present (verify via
     `az cognitiveservices account deployment list ... | grep gpt-5.4`):
       az cognitiveservices account deployment create \
         --resource-group rg-strukalex-8338 --name strukalex-8338-resource \
         --deployment-name gpt-5.4 --model-name gpt-5.4 --model-version 2026-03-05 \
         --model-format OpenAI --sku-name GlobalStandard --sku-capacity 100
     Then PATCH the override env to add gpt-5.4 to AZURE_OPENAI_DEPLOYMENTS
     (the user will run the az command; just include it in your preflight
     check output if missing).
  ✅ Dataset registered: seed-local-samples-mix-public-v1 (40 samples)
  ✅ Backend + Temporal worker running (verify with `ps aux | grep -E
     "nest|ts-node-dev" | grep -v grep`)
  ✅ TEST_API_KEY available in apps/backend-services/.env (the trigger
     script loads it without leaking)
  ⚠ AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY for the westus account in
     your override file — these point at ai-jobstoreai2846, NOT the
     eastus2 strukalex-8338 resource. Verify both endpoint+key reach
     the right account before the first call.

PRE-EMPTIVE LESSONS FROM E03 (apply these from day 1):

  1. WRITE A PREFLIGHT SCRIPT FIRST. preflight-vlm.ts that checks: env
     vars set, deployments exist + are reachable, AZURE_OPENAI_API_VERSION
     is 2024-12-01-preview or newer (structured outputs need a recent
     API), capacity ≥ 50 on the deployment you're using, dataset version
     present in the DB. Run it before the first iteration call. E03
     hit four runtime-error retries because it didn't have one.

  2. CAPTURE A FIXTURE BEFORE WRITING THE MAPPER. Send one image + one
     test schema to the chosen deployment (gpt-5 or gpt-4o), receive
     the structured-output response, save it to apps/temporal/src/
     __fixtures__/experiment-04/vlm-response-1-81.json. Build the
     mapper against the captured shape. The brief says "VLMs don't
     produce per-word/per-line/per-bbox" — but verify; some Azure
     OpenAI models on certain API versions DO return citations. Don't
     trust the preamble.

  3. STRUCTURED OUTPUT FLAG. OpenAI's chat completions structured-
     output mode requires `response_format: { type: "json_schema",
     json_schema: { name, schema, strict: true } }`. Without
     `strict: true`, the model may return free-form JSON that doesn't
     match the schema. Verify on the first sample that the response
     parses cleanly against your schema; if it doesn't, the strict flag
     is missing. Same root cause as E02's Mistral strict-flag issue.

  4. RATE LIMIT TUNING. The deployment SKU on gpt-5 is GlobalStandard
     capacity 10 (= 10K TPM at the deployment level). Each VLM call
     with a 200-DPI form image uses ~10-15K input tokens (image + prompt
     + schema) — that's ~1 call per minute throttled. Either bump the
     capacity to 50-100 BEFORE the first benchmark, or apply the
     30-attempt × 15 s × 1.5x × 60 s cap retry policy. E03 spent 40
     minutes finding this out.

  5. WORKFLOW OUTPUT-PORT NAMING. The activity must return an
     OBJECT WHOSE KEYS MATCH the workflow's outputs[].port. Specifically
     `ocrResponse` (NOT `vlmResponse` or anything else) so persistOcrCache
     populates benchmark_ocr_cache. E03's silent empty-cache bug was a
     typo here. Add a unit test asserting the activity's return-type
     exposes both `ocrResult` and `ocrResponse`.

  6. PRODUCTION-GRADE PROMPTS ARE PART OF THE DELIVERABLE. Bare
     field_keys-only schemas underperform on every general-purpose
     model. Copy E03's iteration kit (`experiments/results/03-content-
     understanding/iteration/{prompt.md,field-descriptions.json}`) as
     E04's starter. The SDPR-form quirks (column conventions, blank-vs-
     zero, signature-vs-name) are engine-agnostic — only the schema
     wrapper changes (CU's analyzer schema → OpenAI's
     response_format.json_schema). Get to ≥ 95% on synth-full (1)
     before running the full benchmark.

  7. TEMPLATE ID DEFAULT in the workflow JSON must point at
     "seed-sdpr-monthly-report-template" (NOT a UUID). Inherit E03's
     workflow template structure verbatim aside from the activity
     types.

  8. COST AWARENESS. gpt-5 with vision input is ~$8/M input tokens
     and ~$25/M output tokens. A 17K-token call ≈ $0.14 input + $0.05
     output ≈ $0.20/sample. 40 samples × 3 variants × 2 models = 240
     calls = ~$50 per full benchmark sweep. Variant 3 (self-consistency)
     is 3× cost on top — flag this before triggering. E03 cost ~$3 for
     gpt-5.2 in the 3 runs combined.

  9. SUMMARY.md SKELETON ON DAY ONE. Provider doc + vocabulary mapping
     + retrospective + parent-shared infra fixes don't depend on
     metrics. Write them while iteration is running. Saves an hour at
     the end.

  10. BIOME LINT IS REPO-WIDE. The pre-commit hook will fix formatting
      across the whole repo, including unrelated files. Don't be
      surprised when biome reformats files outside your changeset on
      commit. Pure formatting fixes are fine to include.

SCOPE (the brief has 10 explicit tasks; per the SCOPE REDUCTION at the
top of this prompt, only the single-pass + gpt-5.4 path is in scope —
two non-obvious bits remain):

  - Task 1 (PDF→image rendering): **SKIP THE STANDALONE ACTIVITY.**
    All 40 samples in seed-local-samples-mix-public-v1 are JPEGs;
    nothing in this benchmark exercises a PDF render. Instead, add a
    runtime guard at the top of the VLM-direct activity:
        if (fileData.fileType === "pdf") {
          throw new Error("VLM-direct currently supports image inputs only;
            PDF rendering deferred to a follow-up experiment. See E04
            SUMMARY.md for context.");
        }
    Document the deferral explicitly in SUMMARY.md ("Gaps") so the
    contract stays honest. Production-PDF support gets added when there's
    an actual workload that needs it (or by E05's hybrid). Saves ~30-45
    minutes + a new dependency (pdf2pic / pdfjs-dist + sharp) that no
    sample triggers.

  - Task 2 (provider folder): prompt-builder + activity + mapper. The
    activity calls Azure OpenAI's chat completions. Keep the response_
    format strict + sourceQuote per field as a hallucination guard
    (the brief flags this).

  - Task 5 (workflow JSON): **SINGLE workflow JSON only**, not three.
    Auto-discovery picks it up — becomes its own BenchmarkDefinition.
    Tag the run as `experiment-04-vlm-direct-gpt-5.4`. The poll script
    saves the export to experiments/results/04-vlm-direct/
    benchmark-run.json.

DO NOT touch:
  - apps/temporal/src/ocr-providers/{mistral,mistral-azure,azure-content-
    understanding}/ — keep intact for cross-engine comparison
  - apps/temporal/src/activities/mistral-ocr-process.ts (public-API
    Mistral; leave intact)
  - apps/shared/prisma/schema.prisma (DB schema changes need user
    approval)
  - .env override files
  - CLAUDE.md, _shared-rules.md, other experiment briefs

TYPICAL FLOW (~1.5-2 hours wallclock, scoped-down version):
  1. preflight-vlm.ts (15 min) — confirm prereqs (incl. gpt-5.4 deployed)
  2. Capture a fixture from one real call to gpt-5.4 (10 min)
  3. Write provider files: prompt-builder, activity (with PDF guard),
     mapper (45 min)
  4. Register activity in 3 registries + activities.ts re-export
  5. Write iterate-vlm-extraction.ts (20 min, lifted from
     iterate-cu-extraction.ts)
  6. Iterate on synth-full (1) until ≥ 95% per-field accuracy (15 min)
  7. Build SINGLE workflow JSON (10 min)
  8. Embed iteration kit content into workflow JSON, npm run test:db:reset
  9. Trigger benchmark on gpt-5.4 (~5-10 min wallclock at capacity 100)
  10. Capture per-sample fixture from cache (2 min)
  11. Write tests (40 min) — same 3-layer pattern as E03 but smaller
      (no variant matrix to assert)
  12. Write SUMMARY.md (20 min on top of skeleton)
  13. Commit on experiment/04-vlm-direct
  14. STOP — E05 will branch from your tip in a separate session.

When done, verify:
  - All 12 EXTRACTION_EXPERIMENTS.md checklist items have ✅ or
    documented ⚠ for E04 (the "PDF support" row will be ⚠ — deferred)
  - benchmark-run.json saved
  - benchmark_ocr_cache populated (run the cache-row count assertion)
  - Tests pass: cd apps/temporal && CI=true npx jest src/experiment-04
    src/ocr-providers/vlm-direct/
  - Lint + tsc clean on commit (pre-commit hook will run them)
  - SUMMARY.md retrospective enumerates what surprised you, what you
    inherited from E03, and what should change in _shared-rules.md
    before E05.
```

---

## What's pre-flighted at handoff (so the next agent doesn't waste time)

- ✅ Branch tip: `e1d6f536` on `experiment/03-content-understanding`
- ✅ gpt-5 (vanilla, 2025-08-07) deployed at `ai-jobstoreai2846ai731114335138` — westus, capacity 10
- ✅ gpt-4o deployed at same resource — capacity 50
- ✅ gpt-4o-mini deployed at same resource — capacity 100
- ✅ gpt-5.2 deployed at `strukalex-8338-resource` — eastus2, capacity 100 (usable as a 4th model variant)
- ⚠ gpt-5.5 unavailable — `OpenAI.GlobalStandard.gpt-5.5` quota is 0K TPM (the *only* gpt-5.x model gated this way; siblings like gpt-5.4 have 1M TPM available). User has decided to use **gpt-5.4** instead and may file a 5.5 quota request to revisit later.
- ✅ Dataset `seed-local-samples-mix-public-v1` (40 samples) registered
- ✅ Backend + Temporal worker running
- ✅ `TEST_API_KEY` in `apps/backend-services/.env`
- ⚠ Verify `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` in your override file point at `ai-jobstoreai2846` (westus), NOT `strukalex-8338-resource` (eastus2). The two accounts have different endpoints + keys.

## Pre-work (user-driven; do this BEFORE starting E04 if you don't already have gpt-5.4 deployed)

The current plan is gpt-5.4 + gpt-4o + gpt-5 as the variant matrix.
gpt-5.4 is the closest model to gpt-5.5 (the latest as of May 2026)
that doesn't require a quota uplift. Released 2026-03-05, GA, 1M TPM
available immediately.

```bash
az cognitiveservices account deployment create \
  --resource-group rg-strukalex-8338 --name strukalex-8338-resource \
  --deployment-name gpt-5.4 --model-name gpt-5.4 --model-version 2026-03-05 \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 100
```

Then add `gpt-5.4` to `AZURE_OPENAI_DEPLOYMENTS` in the override env file.

## Optional follow-up: gpt-5.5 access

**The standard quota uplift form at `https://aka.ms/oai/quotaincrease`
does NOT list gpt-5.5** as of the time of writing — its dropdowns for
"Azure OpenAI > Model Deployment (PTU/RPM/TPM) > Global Standard >
Global Standard Model" only go up to gpt-5.4. This suggests gpt-5.5
access is gated through a different path than the standard quota
uplift, possibly:

- A Microsoft preview / early-access registration program for gpt-5.5
  specifically (not the generic OpenAI quota form)
- Microsoft Foundry's "Models sold directly by Azure" allowlist (some
  newer models route through there before hitting the standard quota
  catalog)
- Direct outreach to a Microsoft Azure account manager

Until that path is identified, **gpt-5.4 is the most capable model
deployable in this subscription without any approvals**. gpt-5.5 is
deferred to a future experiment / cross-engine comparison.
