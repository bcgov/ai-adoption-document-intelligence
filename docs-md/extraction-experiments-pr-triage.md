# Extraction-experiments PR chain — pre-merge triage

**Merge strategy (decided):** a **single merge of the cumulative PR [#221](https://github.com/bcgov/ai-adoption-document-intelligence/pull/221)** (`experiments/release-up-to-08-part-2` → `develop`) which contains all commits from the chain. The individual PRs **#155–#165 and #220 will be closed, not merged.** So the only thing that matters is the **final state of #221's head** — verified below.

Consequences of this strategy:
- **Backfilling fixes to #155/#156 is unnecessary** — those PRs are being closed.
- **Human review comments on the closed PRs do not gate the merge.** Reply/close them for courtesy and traceability, but nothing there blocks #221.
- **CodeQL alerts still matter** — they attach to code that lands in develop via #221, and they may be part of what is blocking the branch (see below).

**#221 status:** `MERGEABLE` (no conflict) but **`BLOCKED`** — a branch-protection gate is unsatisfied (required checks/reviews and/or the open CodeQL alerts). Clearing section A below + obtaining the required approval should unblock it.

> **Alert state caveat:** the org's `code-scanning/alerts` API is not readable with the current token, so I could not confirm which alerts are still *open* vs *dismissed* in the Security tab. Classification below is from the code. **Confirm open/closed state in the GitHub Security tab.**

---

## A. Gates on the #221 merge

| # | Item | Verdict on #221 head | Action |
|---|------|----------------------|--------|
| A1 | **`manifestPath` bug** (kmandryk, #155) — full blob key instead of cache-relative path breaks `loadDatasetManifest`. | **FIXED** — `seed.ts:1848` `versionManifestPath = "dataset-manifest.json"`; `local-dataset-sync.service.ts:274` = `"dataset-manifest.json"`. | None. Optionally reply on #155 pointing at the fix commit when closing it. |
| A2 | **`experiment-0X` tests failed type-check** (kmandryk, #156/#158/#159/#160) — `graph` not in `GraphWorkflowInput`, `.ctx` not on result. | **VERIFIED GREEN on #221 head (2026-07-10).** `apps/temporal` `npm run type-check` → exit 0 (both `tsc --noEmit` and `type-check:scripts`). `experiment-01..05` tests → **120 passed / 120 total**, exit 0, running real workflows against the dev-stack Temporal with paid APIs mocked (`useMock:true`). | **None — resolved.** Reply on #156/#158/#159/#160 that type-check + tests pass on #221, then close. |
| A3 | **CodeQL alerts blocking the branch** | See section B — all are by-design or dev-tooling / lint. | **Dismiss the by-design + tooling alerts in the Security tab** (B1/B3/B4/B5, optionally C1). Some (B3) may have auto-closed when scripts moved out of `src/`. |

Everything in A is either already fixed on #221 or a Security-tab / verification action — **no source changes appear required** beyond confirming A2's type-check.

---

## B. CodeQL alerts — none require code changes (dismiss with rationale)

| # | Alerts | Location | Why it can be dismissed |
|---|--------|----------|-------------------------|
| B1 | **File data in outbound network request** — #162, #209 (+ script variants #161/#163/#171) | `ocr-providers/mistral-azure/mistral-azure-ocr-process.ts`, `activities/mistral-ocr-process.ts:496` | **By design.** The OCR provider's job is to send document bytes to the OCR API. Destination URL is a **fixed trusted endpoint** — `process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT` or the hard-coded public Mistral endpoint (`buildAzureOcrUrl`), **not derived from file data**. No SSRF surface. |
| B2 | **Network data written to file** — #164–#170, #172 | `apps/temporal/scripts/iterate-*`, `poll-experiment-run.ts`, `test-mistral-foundry-single.ts` | **Dev/experiment tooling, not shipped runtime.** Persists our own experiment API responses to local result files. Moved out of `src/` on #221 (0 files remain in `src/scripts`), addressing dbarkowsky's "not source code" point. |
| B3 | **Incomplete string escaping** — #173, #176 | `dump-errors-for-gt-cleanup.ts`, `dump-all-mismatches-cross-experiment.ts` | Report-string concat in dev scripts over our own data. No untrusted input. |
| B4 | **Python lint** — #201/#202 (unused import), #203 (var defined twice), #204–#207 (unused local var), #208 (identical comparison) | `scripts/benchmark analysis/*.py`, `experiments/results/**/*.py` | **Code-quality only, zero security.** Analysis scripts. Dismiss, or fix trivially for a clean Security tab. |

---

## C. Human comments on the to-be-closed PRs — not blockers (reply when closing)

| # | Item | Source | Verdict |
|---|------|--------|---------|
| C1 | **TOCTOU fs-race** — CodeQL #159/#160 (`backend-services/src/seed/local-datasets.ts`), #174 (`scripts/promote-gt-format-variants.ts`) | CodeQL | Real pattern, **negligible risk**: single-process seed/dev-time file writes, no concurrent untrusted access. Dismiss with rationale, or optionally harden (temp-write + rename). |
| C2 | **"`FORCE_RESYNC_LOCAL_DATASETS` is unused, remove?"** | kmandryk, #155 | **Incorrect — it IS consumed:** `local-dataset-sync.service.ts:103`. Reply with the reference. |
| C3 | **Design-spec `.env` reference** — lists `apps/backend-services/.env.sample` + `apps/temporal/.env.sample`; "no backend `.env` anymore." | dbarkowsky, #155 | **DONE (2026-07-10):** spec section 4 (+ checklist item 7) updated to reference the root `.env.sample` with a note that per-app env files were consolidated into a single root `.env`. |
| C4 | **"Are these briefs meant as instructions for an AI agent?"** | dbarkowsky, #155 | **DONE (2026-07-10):** renamed `experiments/briefs/` → `experiments/integration-checklists/` and swept all path references. Content = per-engine integration checklists; results live in `experiments/results/*/SUMMARY.md`. |

---

## Path to merge #221
1. ~~**Run `npm run type-check` + `experiment-0X` tests** against #221's head~~ — **DONE 2026-07-10: type-check exit 0, experiment tests 120/120 pass (A2).**
2. **In the Security tab, dismiss** the by-design / tooling / lint alerts (B1–B4, C1) as "won't fix (by design)" / "used in tests". Confirm whether relocation already auto-closed B2/B3.
3. **Get the required approval** on #221 to clear the `BLOCKED` state.
4. **Close #155–#165, #220** with a short pointer to #221; where useful, drop the reply text for C2/C3/C4 (and A1) so reviewers see the resolution.
