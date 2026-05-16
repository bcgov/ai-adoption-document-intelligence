# Cross-experiment metric comparison — before vs after the GT-cleanup session

Current tree: working tree at commit `33f26740` (cross-experiment promotion + reeval).
Per-experiment "before" baselines: the last commit that touched each experiment's `benchmark-run.json` before this session — see per-experiment section.

## What happened in this session

1. **E01 was re-run end-to-end** against the production-trained neural model `sdpr-monthly-prod-neural-v2` — totally different benchmark export from the original `bc9961f6` archived one (which used `sdpr_synth_test` on a 33-sample dataset). E01's "before → after" therefore reflects a different model + larger dataset + re-eval, not just GT cleanup.
2. **The stored E01 export was re-evaluated locally** against the current GT + canonical strict evaluator (the worker was running an older evaluator). Same pattern was already applied to E00 in `76971469`.
3. **`promote-gt-format-variants.ts` was extended** with currency-prefix, numeric-equality, and text-equivalence (whitespace/case/punctuation) rules; then run + applied across all 9 experiments.
4. **All 9 experiments were re-evaluated** against the updated GT.

Steps 2–4 are the apples-to-apples evaluator/GT change. Step 1 is an E01-only model upgrade.

## Side-by-side aggregate

| Experiment | pass_rate (before → after) | f1.mean | f1.median | precision | recall | matched.median | FP.mean |
|---|---|---|---|---|---|---|---|
| 00-doc-intelligence-template | 0.850 → **0.875** (+0.025) | 0.903 → **0.916** (+0.013) | 0.939 → **0.952** (+0.014) | 0.917 → **0.930** (+0.013) | 0.899 → **0.912** (+0.013) | 66.0 → **68.0** | 5.60 → **4.72** (-0.875) |
| 01-neural-doc-intelligence | 0.515 → **0.950** (+0.435) | 0.683 → **0.946** (+0.263) | 0.806 → **0.980** (+0.173) | 0.899 → **0.966** (+0.067) | 0.587 → **0.931** (+0.344) | 50.0 → **70.0** | 2.33 → **2.25** (-0.083) |
| 02-mistral-doc-ai-azure | 0.875 → **0.900** (+0.025) | 0.918 → **0.927** (+0.009) | 0.959 → **0.966** (+0.007) | 0.941 → **0.950** (+0.009) | 0.902 → **0.910** (+0.008) | 69.0 → **70.0** | 4.05 → **3.45** (-0.600) |
| 03-content-understanding | 0.950 → **0.950** (0.000) | 0.938 → **0.953** (+0.015) | 0.969 → **0.981** (+0.011) | 0.957 → **0.972** (+0.015) | 0.923 → **0.937** (+0.015) | 70.0 → **71.0** | 2.88 → **1.85** (-1.025) |
| 04-vlm-direct | 0.800 → **0.800** (0.000) | 0.870 → **0.887** (+0.016) | 0.903 → **0.918** (+0.015) | 0.876 → **0.892** (+0.016) | 0.866 → **0.882** (+0.016) | 66.0 → **67.0** | 8.47 → **7.30** (-1.175) |
| 05-vlm-ocr-hybrid | 0.975 → **0.975** (0.000) | 0.942 → **0.957** (+0.015) | 0.960 → **0.980** (+0.019) | 0.951 → **0.965** (+0.015) | 0.935 → **0.950** (+0.015) | 71.0 → **72.0** | 3.38 → **2.33** (-1.050) |
| 06-engine-ensemble | 1.000 → **1.000** (0.000) | 0.962 → **0.976** (+0.014) | 0.973 → **0.986** (+0.014) | 0.973 → **0.986** (+0.014) | 0.953 → **0.967** (+0.014) | 71.0 → **72.0** | 1.93 → **0.97** (-0.950) |
| 07-vlm-ocr-hybrid-gpt-4o | 0.900 → **0.950** (+0.050) | 0.923 → **0.936** (+0.013) | 0.952 → **0.973** (+0.020) | 0.942 → **0.955** (+0.013) | 0.908 → **0.921** (+0.013) | 68.0 → **69.0** | 4.00 → **3.10** (-0.900) |
| 08-vlm-ocr-hybrid-gpt-5.2 | 0.975 → **0.975** (0.000) | 0.959 → **0.973** (+0.013) | 0.973 → **0.984** (+0.011) | 0.965 → **0.978** (+0.013) | 0.955 → **0.968** (+0.013) | 71.0 → **72.0** | 2.50 → **1.57** (-0.925) |

## Per-experiment metrics (detailed)

### 00-doc-intelligence-template

Baseline commit: `d77b6097`
Run id: `b432a65a-a52f-4ac7-85ed-4b46df05ba6a` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.850 | 0.875 | +0.025 |
| passing / total | 34/40 | 35/40 | — |
| `f1.mean` | 0.903 | 0.916 | +0.013 |
| `f1.median` | 0.939 | 0.952 | +0.014 |
| `f1.min` | 0.561 | 0.561 | 0.000 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.917 | 0.930 | +0.013 |
| `recall.mean` | 0.899 | 0.912 | +0.013 |
| `matchedFields.median` | 66.0 | 68.0 | +2.000 |
| `falsePositives.mean` | 5.60 | 4.72 | -0.875 |
| `falseNegatives.mean` | 7.28 | 6.38 | -0.900 |

### 01-neural-doc-intelligence

Baseline commit: `bc9961f6`
Run id changed: `2295feed-1c99-493e-ae20-546499b5d685` → `b715b129-678a-4728-aaf9-0a834d604cc8`

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.515 | 0.950 | +0.435 |
| passing / total | 17/33 | 38/40 | — |
| `f1.mean` | 0.683 | 0.946 | +0.263 |
| `f1.median` | 0.806 | 0.980 | +0.173 |
| `f1.min` | 0.143 | 0.656 | +0.513 |
| `f1.max` | 0.986 | 1.000 | +0.014 |
| `precision.mean` | 0.899 | 0.966 | +0.067 |
| `recall.mean` | 0.587 | 0.931 | +0.344 |
| `matchedFields.median` | 50.0 | 70.0 | +20.000 |
| `falsePositives.mean` | 2.33 | 2.25 | -0.083 |
| `falseNegatives.mean` | 25.91 | 4.97 | -20.934 |

### 02-mistral-doc-ai-azure

Baseline commit: `d77b6097`
Run id: `372fdc8d-9601-4a70-835f-98f710f0e458` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.875 | 0.900 | +0.025 |
| passing / total | 35/40 | 36/40 | — |
| `f1.mean` | 0.918 | 0.927 | +0.009 |
| `f1.median` | 0.959 | 0.966 | +0.007 |
| `f1.min` | 0.626 | 0.626 | 0.000 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.941 | 0.950 | +0.009 |
| `recall.mean` | 0.902 | 0.910 | +0.008 |
| `matchedFields.median` | 69.0 | 70.0 | +1.000 |
| `falsePositives.mean` | 4.05 | 3.45 | -0.600 |
| `falseNegatives.mean` | 7.20 | 6.58 | -0.625 |

### 03-content-understanding

Baseline commit: `1efbbe93`
Run id: `80553759-5326-4e8a-b7f5-ac827839e09d` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.950 | 0.950 | 0.000 |
| passing / total | 38/40 | 38/40 | — |
| `f1.mean` | 0.938 | 0.953 | +0.015 |
| `f1.median` | 0.969 | 0.981 | +0.011 |
| `f1.min` | 0.672 | 0.688 | +0.016 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.957 | 0.972 | +0.015 |
| `recall.mean` | 0.923 | 0.937 | +0.015 |
| `matchedFields.median` | 70.0 | 71.0 | +1.000 |
| `falsePositives.mean` | 2.88 | 1.85 | -1.025 |
| `falseNegatives.mean` | 5.47 | 4.45 | -1.025 |

### 04-vlm-direct

Baseline commit: `d77b6097`
Run id: `f71d0efb-eb1e-4171-a7e1-9e194e6572b4` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.800 | 0.800 | 0.000 |
| passing / total | 32/40 | 32/40 | — |
| `f1.mean` | 0.870 | 0.887 | +0.016 |
| `f1.median` | 0.903 | 0.918 | +0.015 |
| `f1.min` | 0.692 | 0.692 | 0.000 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.876 | 0.892 | +0.016 |
| `recall.mean` | 0.866 | 0.882 | +0.016 |
| `matchedFields.median` | 66.0 | 67.0 | +1.000 |
| `falsePositives.mean` | 8.47 | 7.30 | -1.175 |
| `falseNegatives.mean` | 9.25 | 8.07 | -1.175 |

### 05-vlm-ocr-hybrid

Baseline commit: `d77b6097`
Run id: `f1b04a3f-179c-49e2-adfe-2b1099af5387` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.975 | 0.975 | 0.000 |
| passing / total | 39/40 | 39/40 | — |
| `f1.mean` | 0.942 | 0.957 | +0.015 |
| `f1.median` | 0.960 | 0.980 | +0.019 |
| `f1.min` | 0.784 | 0.797 | +0.014 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.951 | 0.965 | +0.015 |
| `recall.mean` | 0.935 | 0.950 | +0.015 |
| `matchedFields.median` | 71.0 | 72.0 | +1.000 |
| `falsePositives.mean` | 3.38 | 2.33 | -1.050 |
| `falseNegatives.mean` | 4.55 | 3.48 | -1.075 |

### 06-engine-ensemble

Baseline commit: `d77b6097`
Run id: `ensemble-S6_per_field_weighted_majority` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 1.000 | 1.000 | 0.000 |
| passing / total | 40/40 | 40/40 | — |
| `f1.mean` | 0.962 | 0.976 | +0.014 |
| `f1.median` | 0.973 | 0.986 | +0.014 |
| `f1.min` | 0.831 | 0.846 | +0.015 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.973 | 0.986 | +0.014 |
| `recall.mean` | 0.953 | 0.967 | +0.014 |
| `matchedFields.median` | 71.0 | 72.0 | +1.000 |
| `falsePositives.mean` | 1.93 | 0.97 | -0.950 |
| `falseNegatives.mean` | — | 2.42 | — |

### 07-vlm-ocr-hybrid-gpt-4o

Baseline commit: `916ad7aa`
Run id: `010a3fa1-4a3f-48be-a58f-ba7ff8c18ed5` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.900 | 0.950 | +0.050 |
| passing / total | 36/40 | 38/40 | — |
| `f1.mean` | 0.923 | 0.936 | +0.013 |
| `f1.median` | 0.952 | 0.973 | +0.020 |
| `f1.min` | 0.692 | 0.708 | +0.015 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.942 | 0.955 | +0.013 |
| `recall.mean` | 0.908 | 0.921 | +0.013 |
| `matchedFields.median` | 68.0 | 69.0 | +1.000 |
| `falsePositives.mean` | 4.00 | 3.10 | -0.900 |
| `falseNegatives.mean` | 6.58 | 5.67 | -0.900 |

### 08-vlm-ocr-hybrid-gpt-5.2

Baseline commit: `a5ba1849`
Run id: `1b16e3d4-5b50-4b77-bb13-6d617b424dbb` (unchanged — numbers shifted from re-eval / GT promotion)

| metric | before | after | Δ |
|---|---|---|---|
| `pass_rate` | 0.975 | 0.975 | 0.000 |
| passing / total | 39/40 | 39/40 | — |
| `f1.mean` | 0.959 | 0.973 | +0.013 |
| `f1.median` | 0.973 | 0.984 | +0.011 |
| `f1.min` | 0.784 | 0.797 | +0.014 |
| `f1.max` | 1.000 | 1.000 | 0.000 |
| `precision.mean` | 0.965 | 0.978 | +0.013 |
| `recall.mean` | 0.955 | 0.968 | +0.013 |
| `matchedFields.median` | 71.0 | 72.0 | +1.000 |
| `falsePositives.mean` | 2.50 | 1.57 | -0.925 |
| `falseNegatives.mean` | 3.27 | 2.33 | -0.950 |

## E01 detail — three-point trajectory

E01 went through three observable states in this session because the run came back from the worker carrying eval-version artifacts:

| | Original (`bc9961f6`, before session) | As-arrived (`8e2cce3f`, after re-run but pre-fix) | After re-eval + GT promotion (current) |
|---|---|---|---|
| run id | `2295feed-1c99-493e-ae20-546499b5d685` | `b715b129-678a-4728-aaf9-0a834d604cc8` | `b715b129-678a-4728-aaf9-0a834d604cc8` |
| dataset | 33 samples, sdpr_synth_test | 40 samples, sdpr-monthly-prod-neural-v2 | 40 samples, same |
| pass_rate | 0.515 | 0.024 | **0.950** |
| f1.mean | 0.683 | 0.907 | **0.946** |
| f1.median | 0.806 | 0.942 | **0.980** |
| precision.mean | 0.899 | 1.000 | **0.966** |
| recall.mean | 0.587 | 0.842 | **0.931** |
| matchedFields.median | 50.0 | 64.0 | **70.0** |
| falsePositives.mean | 2.33 | 0.00 | **2.25** |

The as-arrived numbers are eval-version artifacts (the worker did not have one-of-array support or the improve/03 FP/FN reformulation); the `bc9961f6` numbers used a different model on a smaller dataset; only the rightmost column is apples-to-apples with E02–E08.
