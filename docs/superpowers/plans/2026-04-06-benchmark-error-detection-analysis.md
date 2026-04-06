# Benchmark Error Detection Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Error Detection Analysis section to the benchmark run detail page that lets users pick a per-field confidence threshold and see, in plain language, how many real errors that threshold would catch and how many correct fields it would unnecessarily flag for review.

**Architecture:** Per-field confidence scores from Azure Document Intelligence are currently dropped when predictions are flattened for the evaluator. We thread them through via a sidecar `*-prediction-confidence.json` file, attach them to each `FieldComparisonResult`, and expose them through the existing per-sample evaluation details. A new backend service computes a precomputed `(threshold → tp/fp/fn/tn)` curve per field per run (cached, lazy), and a new frontend component renders an inline-slider table over the curve.

**Tech Stack:** NestJS + Prisma + Vitest (backend), Temporal activities + workflow (worker), React + TypeScript + Vitest (frontend), Azure Document Intelligence (data source).

**Spec:** [docs/superpowers/specs/2026-04-06-benchmark-error-detection-analysis-design.md](../specs/2026-04-06-benchmark-error-detection-analysis-design.md)

---

## File Structure

**Worker (apps/temporal):**
- Modify: `src/azure-ocr-field-display-value.ts` — add `buildFlatConfidenceMapFromCtx`
- Modify: `src/azure-ocr-field-display-value.test.ts` — tests for new helper
- Modify: `src/activities/benchmark-write-prediction.ts` — accept optional `confidenceData`, write sidecar file
- Modify: `src/activities/benchmark-write-prediction.test.ts` — sidecar tests
- Modify: `src/activities/benchmark-evaluate.ts` — accept `predictionConfidencePaths`, pass to evaluator
- Modify: `src/evaluators/schema-aware-evaluator.ts` — load confidence sidecar, attach `confidence` to `FieldComparisonResult`
- Modify: `src/benchmark-types.ts` — extend `EvaluationInput` with `predictionConfidencePaths?: string[]`
- Modify: `src/benchmark-workflow.ts` — call new helper, pass sidecar path through

**Backend (apps/backend-services):**
- Create: `src/benchmark/benchmark-error-detection.service.ts` — curve computation + caching
- Create: `src/benchmark/benchmark-error-detection.service.spec.ts` — unit tests
- Create: `src/benchmark/dto/error-detection-analysis.dto.ts` — response DTO classes
- Modify: `src/benchmark/dto/index.ts` — export new DTOs
- Modify: `src/benchmark/benchmark.module.ts` — register new service
- Modify: `src/benchmark/benchmark-run.controller.ts` — add `GET .../runs/:runId/error-detection-analysis`
- Modify: `src/benchmark/benchmark-run.controller.spec.ts` — endpoint test

**Frontend (apps/frontend):**
- Create: `src/features/benchmark/components/ErrorDetectionAnalysis.tsx` — main component
- Create: `src/features/benchmark/components/ErrorDetectionAnalysis.test.tsx` — component tests
- Create: `src/features/benchmark/api/errorDetectionAnalysis.ts` — typed API client + types
- Modify: `src/features/benchmark/pages/RunDetailPage.tsx` — render new section

**Docs:**
- Modify: existing benchmarking doc under `docs-md/` (whichever describes run analysis features) — add Error Detection Analysis section

---

## Phase 1 — Carry confidence through to evaluation

### Task 1: `buildFlatConfidenceMapFromCtx` helper

**Files:**
- Modify: `apps/temporal/src/azure-ocr-field-display-value.ts`
- Modify: `apps/temporal/src/azure-ocr-field-display-value.test.ts`

- [ ] **Step 1: Add failing test for custom-model confidence extraction**

In `apps/temporal/src/azure-ocr-field-display-value.test.ts`, add:

```ts
import {
  buildFlatPredictionMapFromCtx,
  buildFlatConfidenceMapFromCtx,
} from "./azure-ocr-field-display-value";

describe("buildFlatConfidenceMapFromCtx", () => {
  it("extracts confidence from custom-model documents[0].fields", () => {
    const conf = buildFlatConfidenceMapFromCtx({
      cleanedResult: {
        documents: [
          {
            fields: {
              invoiceNumber: { valueString: "INV-1", confidence: 0.92 },
              total: { valueNumber: 100, confidence: 0.41 },
              notes: { valueString: "n/a" },
            },
          },
        ],
      },
    });
    expect(conf).toEqual({
      invoiceNumber: 0.92,
      total: 0.41,
      notes: null,
    });
  });

  it("extracts confidence from prebuilt-model keyValuePairs", () => {
    const conf = buildFlatConfidenceMapFromCtx({
      ocrResult: {
        keyValuePairs: [
          { key: { content: "Name" }, value: { content: "Acme" }, confidence: 0.88 },
          { key: { content: "Date" }, value: { content: "2024-01-01" } },
        ],
      },
    });
    expect(conf).toEqual({ Name: 0.88, Date: null });
  });

  it("returns empty object when no ocr result present", () => {
    expect(buildFlatConfidenceMapFromCtx({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/temporal/src/azure-ocr-field-display-value.test.ts`
Expected: FAIL — `buildFlatConfidenceMapFromCtx is not exported`.

- [ ] **Step 3: Implement the helper**

In `apps/temporal/src/azure-ocr-field-display-value.ts`, append:

```ts
/**
 * Flatten `cleanedResult` / `ocrResult` to a per-field confidence map.
 * Returns `null` for fields where Azure DI did not provide a confidence score.
 * Mirrors the field traversal of `buildFlatPredictionMapFromCtx`.
 */
export function buildFlatConfidenceMapFromCtx(
  ctx: Record<string, unknown>,
): Record<string, number | null> {
  const ocrResult = (ctx.cleanedResult || ctx.ocrResult) as
    | {
        documents?: Array<{
          fields?: Record<string, Record<string, unknown>>;
        }>;
        keyValuePairs?: Array<{
          key?: { content?: string };
          value?: { content?: string };
          confidence?: number;
        }>;
      }
    | undefined;

  if (!ocrResult) return {};

  const out: Record<string, number | null> = {};

  if (
    ocrResult.documents &&
    ocrResult.documents.length > 0 &&
    ocrResult.documents[0].fields
  ) {
    for (const [key, value] of Object.entries(ocrResult.documents[0].fields)) {
      const c =
        value && typeof value === "object" && typeof value.confidence === "number"
          ? value.confidence
          : null;
      out[key] = c;
    }
    return out;
  }

  if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
    for (const pair of ocrResult.keyValuePairs) {
      const key = pair.key?.content || "unknown";
      out[key] = typeof pair.confidence === "number" ? pair.confidence : null;
    }
    return out;
  }

  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/temporal/src/azure-ocr-field-display-value.test.ts`
Expected: PASS, all three new tests + existing tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/azure-ocr-field-display-value.ts apps/temporal/src/azure-ocr-field-display-value.test.ts
git commit -m "feat(benchmark): extract per-field confidence from Azure DI ctx"
```

---

### Task 2: `benchmark.writePrediction` writes confidence sidecar

**Files:**
- Modify: `apps/temporal/src/activities/benchmark-write-prediction.ts`
- Modify: `apps/temporal/src/activities/benchmark-write-prediction.test.ts`

- [ ] **Step 1: Add failing test for sidecar file**

Add to `apps/temporal/src/activities/benchmark-write-prediction.test.ts`:

```ts
it("writes a confidence sidecar file when confidenceData is provided", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bench-pred-"));
  const result = await benchmarkWritePrediction({
    predictionData: { invoiceNumber: "INV-1", total: 100 },
    confidenceData: { invoiceNumber: 0.92, total: null },
    outputDir: tmp,
    sampleId: "s1",
  });

  expect(result.predictionPath).toBe(path.join(tmp, "s1-prediction.json"));
  expect(result.predictionConfidencePath).toBe(
    path.join(tmp, "s1-prediction-confidence.json"),
  );
  const confJson = JSON.parse(
    await fs.readFile(result.predictionConfidencePath!, "utf-8"),
  );
  expect(confJson).toEqual({ invoiceNumber: 0.92, total: null });
});

it("does not write a sidecar when confidenceData is omitted", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bench-pred-"));
  const result = await benchmarkWritePrediction({
    predictionData: { foo: "bar" },
    outputDir: tmp,
    sampleId: "s2",
  });
  expect(result.predictionConfidencePath).toBeUndefined();
  await expect(
    fs.access(path.join(tmp, "s2-prediction-confidence.json")),
  ).rejects.toThrow();
});
```

(Add `import * as os from "os"` and ensure `fs`, `path` imports are present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/temporal/src/activities/benchmark-write-prediction.test.ts`
Expected: FAIL — `confidenceData` not in input type / sidecar not written.

- [ ] **Step 3: Update activity to write sidecar**

Replace contents of `apps/temporal/src/activities/benchmark-write-prediction.ts` with:

```ts
/**
 * Benchmark Write Prediction Activity
 *
 * Writes the workflow result context (extracted fields) to a JSON file
 * so the evaluator can compare predictions against ground truth.
 *
 * Optionally writes a sibling confidence sidecar file mapping each field
 * to its Azure DI confidence score (or null when none was reported).
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface BenchmarkWritePredictionInput {
  /** Extracted prediction fields to write (flat key-value object) */
  predictionData: Record<string, unknown>;

  /** Optional per-field confidence map. When provided, written as a sidecar JSON file. */
  confidenceData?: Record<string, number | null>;

  /** Directory to write the prediction file into */
  outputDir: string;

  /** Sample ID (used in filename) */
  sampleId: string;
}

export interface BenchmarkWritePredictionOutput {
  /** Absolute path to the written prediction JSON file */
  predictionPath: string;
  /** Absolute path to the confidence sidecar JSON file, if written */
  predictionConfidencePath?: string;
}

/**
 * Write prediction data extracted from the workflow ctx to a JSON file,
 * plus an optional per-field confidence sidecar file.
 *
 * Activity type: benchmark.writePrediction
 */
export async function benchmarkWritePrediction(
  input: BenchmarkWritePredictionInput,
): Promise<BenchmarkWritePredictionOutput> {
  const { predictionData, confidenceData, outputDir, sampleId } = input;

  await fs.mkdir(outputDir, { recursive: true });

  const predictionPath = path.join(outputDir, `${sampleId}-prediction.json`);
  await fs.writeFile(predictionPath, JSON.stringify(predictionData, null, 2));

  let predictionConfidencePath: string | undefined;
  if (confidenceData) {
    predictionConfidencePath = path.join(
      outputDir,
      `${sampleId}-prediction-confidence.json`,
    );
    await fs.writeFile(
      predictionConfidencePath,
      JSON.stringify(confidenceData, null, 2),
    );
  }

  return { predictionPath, predictionConfidencePath };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/temporal/src/activities/benchmark-write-prediction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/activities/benchmark-write-prediction.ts apps/temporal/src/activities/benchmark-write-prediction.test.ts
git commit -m "feat(benchmark): write per-field confidence sidecar from writePrediction"
```

---

### Task 3: Thread `predictionConfidencePaths` into `EvaluationInput`

**Files:**
- Modify: `apps/temporal/src/benchmark-types.ts`
- Modify: `apps/temporal/src/activities/benchmark-evaluate.ts`

- [ ] **Step 1: Add field to EvaluationInput**

In `apps/temporal/src/benchmark-types.ts`, find the `EvaluationInput` interface (around line ~80–110) and add:

```ts
  /**
   * Optional sibling confidence sidecar files (one per prediction file),
   * each containing { [fieldName]: number | null }.
   */
  predictionConfidencePaths?: string[];
```

- [ ] **Step 2: Forward through benchmarkEvaluate activity**

In `apps/temporal/src/activities/benchmark-evaluate.ts`, locate where the activity passes the input to the evaluator and ensure `predictionConfidencePaths` is forwarded unchanged. If the activity already spreads the input (`evaluator.evaluate(input)`), no change is needed; otherwise add:

```ts
predictionConfidencePaths: input.predictionConfidencePaths,
```

to the object passed to `evaluator.evaluate`.

- [ ] **Step 3: Type check**

Run: `cd apps/temporal && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/temporal/src/benchmark-types.ts apps/temporal/src/activities/benchmark-evaluate.ts
git commit -m "feat(benchmark): plumb predictionConfidencePaths through evaluation input"
```

---

### Task 4: `SchemaAwareEvaluator` reads sidecar and attaches confidence

**Files:**
- Modify: `apps/temporal/src/evaluators/schema-aware-evaluator.ts`
- Create or modify: `apps/temporal/src/evaluators/schema-aware-evaluator.test.ts`

- [ ] **Step 1: Add failing test**

In `apps/temporal/src/evaluators/schema-aware-evaluator.test.ts` (create if missing — copy import patterns from sibling evaluator tests if so), add:

```ts
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { SchemaAwareEvaluator } from "./schema-aware-evaluator";

describe("SchemaAwareEvaluator confidence threading", () => {
  it("attaches per-field confidence from sidecar to evaluationDetails", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "schema-eval-"));
    const predPath = path.join(tmp, "p.json");
    const confPath = path.join(tmp, "p-conf.json");
    const gtPath = path.join(tmp, "gt.json");
    await fs.writeFile(
      predPath,
      JSON.stringify({ name: "Acme", total: 100 }),
    );
    await fs.writeFile(confPath, JSON.stringify({ name: 0.91, total: 0.42 }));
    await fs.writeFile(gtPath, JSON.stringify({ name: "Acme", total: 99 }));

    const evaluator = new SchemaAwareEvaluator();
    const result = await evaluator.evaluate({
      sampleId: "s1",
      predictionPaths: [predPath],
      predictionConfidencePaths: [confPath],
      groundTruthPaths: [gtPath],
      evaluatorConfig: {},
    });

    const details = result.evaluationDetails as Array<{
      field: string;
      matched: boolean;
      confidence: number | null;
    }>;
    const byField = Object.fromEntries(details.map((d) => [d.field, d]));
    expect(byField.name.confidence).toBe(0.91);
    expect(byField.name.matched).toBe(true);
    expect(byField.total.confidence).toBe(0.42);
    expect(byField.total.matched).toBe(false);
  });

  it("sets confidence to null when no sidecar is provided", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "schema-eval-"));
    const predPath = path.join(tmp, "p.json");
    const gtPath = path.join(tmp, "gt.json");
    await fs.writeFile(predPath, JSON.stringify({ name: "Acme" }));
    await fs.writeFile(gtPath, JSON.stringify({ name: "Acme" }));

    const evaluator = new SchemaAwareEvaluator();
    const result = await evaluator.evaluate({
      sampleId: "s2",
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      evaluatorConfig: {},
    });

    const details = result.evaluationDetails as Array<{
      field: string;
      confidence: number | null;
    }>;
    expect(details[0].confidence).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/temporal/src/evaluators/schema-aware-evaluator.test.ts`
Expected: FAIL — `confidence` is undefined on details.

- [ ] **Step 3: Update FieldComparisonResult and compareField**

In `apps/temporal/src/evaluators/schema-aware-evaluator.ts`:

3a. Extend the interface (around line 81):

```ts
interface FieldComparisonResult {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
  similarity?: number;
  absoluteError?: number;
  relativeError?: number;
  confidence?: number | null;
}
```

3b. In `evaluate(...)`, after loading `prediction` and `groundTruth`, also load the optional confidence map. Insert immediately after the `groundTruth = await this.loadJson(groundTruthPath);` line:

```ts
let confidenceMap: Record<string, number | null> = {};
const confPath = input.predictionConfidencePaths?.[0];
if (confPath) {
  try {
    confidenceMap = (await this.loadJson(confPath)) as Record<
      string,
      number | null
    >;
  } catch {
    confidenceMap = {};
  }
}
```

3c. Pass `confidenceMap` into the per-field comparison loop. Change:

```ts
const result = this.compareField(
  field,
  prediction[field],
  groundTruth[field],
  config,
);
```

to:

```ts
const result = this.compareField(
  field,
  prediction[field],
  groundTruth[field],
  config,
);
result.confidence = field in confidenceMap ? confidenceMap[field] : null;
```

(Attaching after the call avoids touching every overload of `compareField`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/temporal/src/evaluators/schema-aware-evaluator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/evaluators/schema-aware-evaluator.ts apps/temporal/src/evaluators/schema-aware-evaluator.test.ts
git commit -m "feat(benchmark): attach per-field confidence to evaluationDetails"
```

---

### Task 5: Workflow builds and forwards confidence sidecar

**Files:**
- Modify: `apps/temporal/src/benchmark-workflow.ts`

- [ ] **Step 1: Update import**

In `apps/temporal/src/benchmark-workflow.ts` line 31, change:

```ts
import { buildFlatPredictionMapFromCtx } from "./azure-ocr-field-display-value";
```

to:

```ts
import {
  buildFlatPredictionMapFromCtx,
  buildFlatConfidenceMapFromCtx,
} from "./azure-ocr-field-display-value";
```

- [ ] **Step 2: Build confidence map and pass to writePrediction**

Around line 574–588 in `benchmark-workflow.ts`, change:

```ts
const predictionData = buildFlatPredictionMapFromCtx(
  executeOutput.workflowResult?.ctx ?? {},
);

const { predictionPath } = await customActivities[
  "benchmark.writePrediction"
]({
  predictionData,
  outputDir: joinPath(
    materializedPath!,
    ".benchmark-outputs",
    sample.id,
  ),
  sampleId: sample.id,
});
```

to:

```ts
const ctx = executeOutput.workflowResult?.ctx ?? {};
const predictionData = buildFlatPredictionMapFromCtx(ctx);
const confidenceData = buildFlatConfidenceMapFromCtx(ctx);

const { predictionPath, predictionConfidencePath } = await customActivities[
  "benchmark.writePrediction"
]({
  predictionData,
  confidenceData,
  outputDir: joinPath(
    materializedPath!,
    ".benchmark-outputs",
    sample.id,
  ),
  sampleId: sample.id,
});
```

- [ ] **Step 3: Forward confidence path to evaluate**

In the same block, find the `customActivities["benchmark.evaluate"]({...})` call and add `predictionConfidencePaths`:

```ts
const evaluationResult = await customActivities[
  "benchmark.evaluate"
]({
  sampleId: sample.id,
  inputPaths,
  predictionPaths: [predictionPath],
  predictionConfidencePaths: predictionConfidencePath
    ? [predictionConfidencePath]
    : undefined,
  groundTruthPaths,
  metadata: sample.metadata,
  evaluatorType,
  evaluatorConfig,
});
```

- [ ] **Step 4: Update workflow activity-proxy type**

Around line 112 of `benchmark-workflow.ts` where the local proxy types `"benchmark.writePrediction"`, update its input/output to include `confidenceData?: Record<string, number | null>` and `predictionConfidencePath?: string` matching the activity. If a separate `customActivities` type union exists, update there too.

- [ ] **Step 5: Type-check workflow**

Run: `cd apps/temporal && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Run all temporal tests**

Run: `cd apps/temporal && npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/temporal/src/benchmark-workflow.ts
git commit -m "feat(benchmark): forward per-field confidence through workflow to evaluator"
```

---

## Phase 2 — Backend: precompute curve and expose endpoint

### Task 6: Response DTOs

**Files:**
- Create: `apps/backend-services/src/benchmark/dto/error-detection-analysis.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/index.ts`

- [ ] **Step 1: Create DTO file**

Create `apps/backend-services/src/benchmark/dto/error-detection-analysis.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ErrorDetectionCurvePointDto {
  @ApiProperty({ description: "Threshold value (0.00–1.00, step 0.01)" })
  threshold: number;

  @ApiProperty({ description: "True positives: flagged AND incorrect (errors caught)" })
  tp: number;

  @ApiProperty({ description: "False positives: flagged AND correct (false alarms)" })
  fp: number;

  @ApiProperty({ description: "False negatives: not flagged AND incorrect (missed errors)" })
  fn: number;

  @ApiProperty({ description: "True negatives: not flagged AND correct" })
  tn: number;
}

export class ErrorDetectionFieldDto {
  @ApiProperty({ description: "Field name" })
  name: string;

  @ApiProperty({ description: "Number of evaluable instances (with confidence and ground truth)" })
  evaluatedCount: number;

  @ApiProperty({ description: "Number of incorrect instances among evaluated" })
  errorCount: number;

  @ApiProperty({ description: "Error rate: errorCount / evaluatedCount" })
  errorRate: number;

  @ApiProperty({
    description: "Precomputed curve, 101 points stepping 0.00 → 1.00 by 0.01",
    type: [ErrorDetectionCurvePointDto],
  })
  curve: ErrorDetectionCurvePointDto[];

  @ApiPropertyOptional({
    description: "Smallest threshold whose recall ≥ 0.90, or null if unattainable",
    nullable: true,
  })
  suggestedCatch90: number | null;

  @ApiProperty({ description: "Threshold maximizing F1 (ties broken by smaller threshold)" })
  suggestedBestBalance: number;

  @ApiPropertyOptional({
    description: "Largest threshold whose false-positive rate ≤ 0.10, or null if unattainable",
    nullable: true,
  })
  suggestedMinimizeReview: number | null;
}

export class ErrorDetectionAnalysisResponseDto {
  @ApiProperty({ description: "Benchmark run ID" })
  runId: string;

  @ApiProperty({ description: "True if the run has no evaluation results yet" })
  notReady: boolean;

  @ApiProperty({
    description: "Per-field analysis (excludes fields with zero evaluable instances)",
    type: [ErrorDetectionFieldDto],
  })
  fields: ErrorDetectionFieldDto[];

  @ApiProperty({
    description: "Names of fields excluded due to missing confidence or ground truth data",
    type: [String],
  })
  excludedFields: string[];
}
```

- [ ] **Step 2: Export from index**

In `apps/backend-services/src/benchmark/dto/index.ts`, add:

```ts
export * from "./error-detection-analysis.dto";
```

- [ ] **Step 3: Type check**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/error-detection-analysis.dto.ts apps/backend-services/src/benchmark/dto/index.ts
git commit -m "feat(benchmark): add error detection analysis DTOs"
```

---

### Task 7: `BenchmarkErrorDetectionService` — pure curve computation

**Files:**
- Create: `apps/backend-services/src/benchmark/benchmark-error-detection.service.ts`
- Create: `apps/backend-services/src/benchmark/benchmark-error-detection.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Create `apps/backend-services/src/benchmark/benchmark-error-detection.service.spec.ts`:

```ts
import { BenchmarkErrorDetectionService } from "./benchmark-error-detection.service";

describe("BenchmarkErrorDetectionService.computeFromInstances (pure)", () => {
  const service = new BenchmarkErrorDetectionService(
    // PrismaService is unused by the pure method; cast to any in tests.
    {} as never,
  );

  it("computes a curve with correct tp/fp/fn/tn at known thresholds", () => {
    // 4 instances: (conf, correct)
    // (0.10, false) — error, low conf
    // (0.40, false) — error, mid conf
    // (0.70, true)  — correct, high conf
    // (0.95, true)  — correct, very high conf
    const field = service.computeField("invoiceNumber", [
      { confidence: 0.1, correct: false },
      { confidence: 0.4, correct: false },
      { confidence: 0.7, correct: true },
      { confidence: 0.95, correct: true },
    ]);

    expect(field.evaluatedCount).toBe(4);
    expect(field.errorCount).toBe(2);
    expect(field.errorRate).toBeCloseTo(0.5);

    // At threshold 0.00: nothing flagged → tp=0, fp=0, fn=2, tn=2
    expect(field.curve[0]).toMatchObject({ threshold: 0.0, tp: 0, fp: 0, fn: 2, tn: 2 });

    // At threshold 0.50: flagged = (0.10, 0.40) → tp=2, fp=0, fn=0, tn=2
    const t50 = field.curve.find((p) => Math.abs(p.threshold - 0.5) < 1e-9)!;
    expect(t50).toMatchObject({ tp: 2, fp: 0, fn: 0, tn: 2 });

    // At threshold 1.00: everything flagged → tp=2, fp=2, fn=0, tn=0
    expect(field.curve[100]).toMatchObject({ threshold: 1.0, tp: 2, fp: 2, fn: 0, tn: 0 });

    expect(field.curve).toHaveLength(101);
  });

  it("computes suggested thresholds: best balance maximizes F1, ties to smaller", () => {
    const field = service.computeField("f", [
      { confidence: 0.1, correct: false },
      { confidence: 0.4, correct: false },
      { confidence: 0.7, correct: true },
      { confidence: 0.95, correct: true },
    ]);
    // F1 is max at threshold where all errors caught and no false alarms.
    expect(field.suggestedBestBalance).toBeCloseTo(0.5, 2);
    // Recall ≥ 0.9 needs both errors caught → threshold ≥ 0.41 → smallest is 0.41
    expect(field.suggestedCatch90).toBeCloseTo(0.41, 2);
    // FPR ≤ 0.10: with 2 correct, FPR=0 until threshold > 0.7, then 0.5 at >0.7 and 1.0 at >0.95
    // Largest threshold with FPR ≤ 0.10: just at/below 0.70 → 0.70
    expect(field.suggestedMinimizeReview).toBeCloseTo(0.7, 2);
  });

  it("returns null suggestions when targets are unattainable", () => {
    // Only correct instances → no errors → recall undefined; treat as null where unattainable
    const field = service.computeField("g", [
      { confidence: 0.5, correct: true },
      { confidence: 0.6, correct: true },
    ]);
    expect(field.errorCount).toBe(0);
    expect(field.suggestedCatch90).toBeNull();
    // suggestedMinimizeReview: largest t with FPR ≤ 0.10. With 2 correct, FPR is 0 at t≤0.5, 0.5 at t in (0.5, 0.6], 1.0 at t > 0.6. So largest acceptable t is 0.50.
    expect(field.suggestedMinimizeReview).toBeCloseTo(0.5, 2);
  });
});

describe("BenchmarkErrorDetectionService.partitionInstances", () => {
  const service = new BenchmarkErrorDetectionService({} as never);

  it("excludes instances missing confidence", () => {
    const { evaluable, excludedReason } = service.partitionInstances([
      { confidence: 0.5, correct: true },
      { confidence: null, correct: false },
      { confidence: undefined as unknown as number | null, correct: true },
    ]);
    expect(evaluable).toHaveLength(1);
    expect(excludedReason).toBe(false); // field still has ≥1 evaluable
  });

  it("marks field as excluded when zero evaluable instances", () => {
    const { evaluable, excludedReason } = service.partitionInstances([
      { confidence: null, correct: true },
    ]);
    expect(evaluable).toHaveLength(0);
    expect(excludedReason).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-error-detection.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service (pure parts)**

Create `apps/backend-services/src/benchmark/benchmark-error-detection.service.ts`:

```ts
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import {
  ErrorDetectionAnalysisResponseDto,
  ErrorDetectionCurvePointDto,
  ErrorDetectionFieldDto,
} from "./dto";

export interface FieldInstance {
  confidence: number | null;
  correct: boolean;
}

interface PartitionResult {
  evaluable: Array<{ confidence: number; correct: boolean }>;
  excludedReason: boolean; // true iff zero evaluable
}

@Injectable()
export class BenchmarkErrorDetectionService {
  private readonly logger = new Logger(BenchmarkErrorDetectionService.name);
  private readonly cache = new Map<string, ErrorDetectionAnalysisResponseDto>();

  constructor(private readonly prismaService: PrismaService) {}

  /** Drop instances missing confidence; report whether the field has zero evaluable. */
  partitionInstances(instances: FieldInstance[]): PartitionResult {
    const evaluable: Array<{ confidence: number; correct: boolean }> = [];
    for (const i of instances) {
      if (typeof i.confidence === "number" && !Number.isNaN(i.confidence)) {
        evaluable.push({ confidence: i.confidence, correct: i.correct });
      }
    }
    return { evaluable, excludedReason: evaluable.length === 0 };
  }

  /** Compute the curve and suggested thresholds for a single field. */
  computeField(
    name: string,
    instances: Array<{ confidence: number; correct: boolean }>,
  ): ErrorDetectionFieldDto {
    const evaluatedCount = instances.length;
    const errorCount = instances.filter((i) => !i.correct).length;
    const errorRate = evaluatedCount === 0 ? 0 : errorCount / evaluatedCount;

    const curve: ErrorDetectionCurvePointDto[] = [];
    for (let step = 0; step <= 100; step++) {
      const threshold = Math.round(step) / 100;
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (const inst of instances) {
        const flagged = inst.confidence < threshold;
        if (flagged && !inst.correct) tp++;
        else if (flagged && inst.correct) fp++;
        else if (!flagged && !inst.correct) fn++;
        else tn++;
      }
      curve.push({ threshold, tp, fp, fn, tn });
    }

    return {
      name,
      evaluatedCount,
      errorCount,
      errorRate,
      curve,
      suggestedCatch90: this.findSmallestThresholdForRecall(curve, 0.9),
      suggestedBestBalance: this.findBestF1Threshold(curve),
      suggestedMinimizeReview: this.findLargestThresholdForFprCap(curve, 0.1),
    };
  }

  private findSmallestThresholdForRecall(
    curve: ErrorDetectionCurvePointDto[],
    target: number,
  ): number | null {
    for (const p of curve) {
      const denom = p.tp + p.fn;
      if (denom === 0) continue;
      if (p.tp / denom >= target) return p.threshold;
    }
    return null;
  }

  private findBestF1Threshold(curve: ErrorDetectionCurvePointDto[]): number {
    let best = curve[0].threshold;
    let bestF1 = -1;
    for (const p of curve) {
      const precision = p.tp + p.fp === 0 ? 0 : p.tp / (p.tp + p.fp);
      const recall = p.tp + p.fn === 0 ? 0 : p.tp / (p.tp + p.fn);
      const f1 =
        precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
      if (f1 > bestF1) {
        bestF1 = f1;
        best = p.threshold;
      }
    }
    return best;
  }

  private findLargestThresholdForFprCap(
    curve: ErrorDetectionCurvePointDto[],
    cap: number,
  ): number | null {
    let best: number | null = null;
    for (const p of curve) {
      const denom = p.fp + p.tn;
      const fpr = denom === 0 ? 0 : p.fp / denom;
      if (fpr <= cap) best = p.threshold;
    }
    return best;
  }
}
```

- [ ] **Step 4: Run pure tests to verify pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-error-detection.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-error-detection.service.ts apps/backend-services/src/benchmark/benchmark-error-detection.service.spec.ts
git commit -m "feat(benchmark): pure curve and suggested-threshold computation"
```

---

### Task 8: `getAnalysis(runId)` — load run, group by field, cache result

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-error-detection.service.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-error-detection.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to `benchmark-error-detection.service.spec.ts`:

```ts
describe("BenchmarkErrorDetectionService.getAnalysis", () => {
  function makeService(run: unknown) {
    const prismaService = {
      prisma: {
        benchmarkRun: {
          findFirst: vi.fn().mockResolvedValue(run),
        },
      },
    };
    return new BenchmarkErrorDetectionService(prismaService as never);
  }

  it("returns notReady when run has no perSampleResults", async () => {
    const svc = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: {},
    });
    const out = await svc.getAnalysis("p1", "r1");
    expect(out.notReady).toBe(true);
    expect(out.fields).toEqual([]);
  });

  it("groups evaluationDetails by field and excludes fields with no confidence", async () => {
    const svc = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: {
        perSampleResults: [
          {
            sampleId: "s1",
            evaluationDetails: [
              { field: "name", matched: true, confidence: 0.9 },
              { field: "total", matched: false, confidence: 0.3 },
              { field: "notes", matched: true, confidence: null },
            ],
          },
          {
            sampleId: "s2",
            evaluationDetails: [
              { field: "name", matched: false, confidence: 0.4 },
              { field: "total", matched: true, confidence: 0.8 },
              { field: "notes", matched: false, confidence: null },
            ],
          },
        ],
      },
    });
    const out = await svc.getAnalysis("p1", "r1");
    expect(out.fields.map((f) => f.name).sort()).toEqual(["name", "total"]);
    expect(out.excludedFields).toContain("notes");
    const name = out.fields.find((f) => f.name === "name")!;
    expect(name.evaluatedCount).toBe(2);
    expect(name.errorCount).toBe(1);
  });

  it("throws NotFoundException when run does not exist", async () => {
    const svc = makeService(null);
    await expect(svc.getAnalysis("p1", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("caches results by runId across calls", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: { perSampleResults: [] },
    });
    const svc = new BenchmarkErrorDetectionService({
      prisma: { benchmarkRun: { findFirst } },
    } as never);
    await svc.getAnalysis("p1", "r1");
    await svc.getAnalysis("p1", "r1");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
```

(Add `import { NotFoundException } from "@nestjs/common"` and `import { vi } from "vitest"` at the top of the test file if not already present.)

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-error-detection.service.spec.ts`
Expected: FAIL — `getAnalysis` does not exist.

- [ ] **Step 3: Implement getAnalysis**

Append to `benchmark-error-detection.service.ts` (inside the class):

```ts
  /**
   * Build the error-detection analysis for a run. Cached by runId.
   */
  async getAnalysis(
    projectId: string,
    runId: string,
  ): Promise<ErrorDetectionAnalysisResponseDto> {
    const cached = this.cache.get(runId);
    if (cached) return cached;

    const run = await this.prismaService.prisma.benchmarkRun.findFirst({
      where: { id: runId, projectId },
    });
    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    const metrics = (run.metrics ?? {}) as Record<string, unknown>;
    const perSampleResults = (metrics.perSampleResults ?? []) as Array<{
      sampleId: string;
      evaluationDetails?: unknown;
    }>;

    if (!perSampleResults.length) {
      const empty: ErrorDetectionAnalysisResponseDto = {
        runId: run.id,
        notReady: true,
        fields: [],
        excludedFields: [],
      };
      this.cache.set(runId, empty);
      return empty;
    }

    // Group instances by field name.
    const byField = new Map<string, FieldInstance[]>();
    for (const sample of perSampleResults) {
      const details = Array.isArray(sample.evaluationDetails)
        ? (sample.evaluationDetails as Array<{
            field: string;
            matched: boolean;
            confidence?: number | null;
          }>)
        : [];
      for (const d of details) {
        if (!d || typeof d.field !== "string") continue;
        if (!byField.has(d.field)) byField.set(d.field, []);
        byField.get(d.field)!.push({
          confidence:
            typeof d.confidence === "number" ? d.confidence : null,
          correct: d.matched === true,
        });
      }
    }

    const fields: ErrorDetectionFieldDto[] = [];
    const excludedFields: string[] = [];
    for (const [name, instances] of byField.entries()) {
      const { evaluable, excludedReason } = this.partitionInstances(instances);
      if (excludedReason) {
        excludedFields.push(name);
        continue;
      }
      fields.push(this.computeField(name, evaluable));
    }

    fields.sort((a, b) => b.errorRate - a.errorRate);
    excludedFields.sort();

    const result: ErrorDetectionAnalysisResponseDto = {
      runId: run.id,
      notReady: false,
      fields,
      excludedFields,
    };
    this.cache.set(runId, result);
    return result;
  }

  /** Public for tests / future invalidation hook. */
  invalidate(runId: string): void {
    this.cache.delete(runId);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-error-detection.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-error-detection.service.ts apps/backend-services/src/benchmark/benchmark-error-detection.service.spec.ts
git commit -m "feat(benchmark): error-detection analysis service with caching"
```

---

### Task 9: Wire service into module and add controller endpoint

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark.module.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts`

- [ ] **Step 1: Register service in module**

Open `apps/backend-services/src/benchmark/benchmark.module.ts`. Add to imports:

```ts
import { BenchmarkErrorDetectionService } from "./benchmark-error-detection.service";
```

Add `BenchmarkErrorDetectionService` to the `providers` array (and `exports` if other modules need it — they don't for this feature).

- [ ] **Step 2: Add failing controller test**

In `apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts`, add a test that verifies the new endpoint delegates to the service. Inject a mock `BenchmarkErrorDetectionService` and assert:

```ts
it("GET runs/:runId/error-detection-analysis returns service result", async () => {
  const expected = {
    runId: "r1",
    notReady: false,
    fields: [],
    excludedFields: [],
  };
  errorDetectionService.getAnalysis = vi.fn().mockResolvedValue(expected);
  // assertProjectGroupAccess uses benchmarkProjectService.getProjectById
  benchmarkProjectService.getProjectById = vi
    .fn()
    .mockResolvedValue({ id: "p1", groupId: "g1" });

  const result = await controller.getErrorDetectionAnalysis(
    "p1",
    "r1",
    { resolvedIdentity: { groups: ["g1"] } } as never,
  );
  expect(result).toEqual(expected);
  expect(errorDetectionService.getAnalysis).toHaveBeenCalledWith("p1", "r1");
});
```

(Match the existing test file's setup for instantiating the controller and mocking dependencies — copy-paste from the nearest existing controller test in the same file. Add `BenchmarkErrorDetectionService` to the providers in the test module.)

- [ ] **Step 3: Run test to verify failure**

Run: `cd apps/backend-services && npx vitest run src/benchmark/benchmark-run.controller.spec.ts`
Expected: FAIL — `getErrorDetectionAnalysis` not defined.

- [ ] **Step 4: Add controller endpoint**

In `apps/backend-services/src/benchmark/benchmark-run.controller.ts`:

4a. Add to imports:

```ts
import { BenchmarkErrorDetectionService } from "./benchmark-error-detection.service";
import { ErrorDetectionAnalysisResponseDto } from "./dto";
```

4b. Inject in constructor:

```ts
constructor(
  private readonly benchmarkRunService: BenchmarkRunService,
  private readonly benchmarkProjectService: BenchmarkProjectService,
  private readonly benchmarkDefinitionService: BenchmarkDefinitionService,
  private readonly ocrImprovementPipeline: OcrImprovementPipelineService,
  private readonly workflowService: WorkflowService,
  private readonly errorDetectionService: BenchmarkErrorDetectionService,
) {}
```

4c. Add the endpoint method (place near `getDrillDown`):

```ts
@Get("runs/:runId/error-detection-analysis")
@Identity({ allowApiKey: true })
@ApiOperation({
  summary: "Get error detection analysis for a benchmark run",
  description:
    "Returns precomputed per-field threshold curves and suggested thresholds " +
    "for picking confidence cut-offs that flag low-confidence predictions for review.",
})
@ApiParam({ name: "projectId", description: "Benchmark project ID" })
@ApiParam({ name: "runId", description: "Benchmark run ID" })
@ApiOkResponse({
  description: "Per-field error detection analysis",
  type: ErrorDetectionAnalysisResponseDto,
})
@ApiNotFoundResponse({ description: "Run not found" })
@ApiForbiddenResponse({ description: "Access denied: not a group member" })
async getErrorDetectionAnalysis(
  @Param("projectId") projectId: string,
  @Param("runId") runId: string,
  @Req() req: Request,
): Promise<ErrorDetectionAnalysisResponseDto> {
  this.logger.log(
    `GET /api/benchmark/projects/${projectId}/runs/${runId}/error-detection-analysis`,
  );
  await this.assertProjectGroupAccess(projectId, req);
  return this.errorDetectionService.getAnalysis(projectId, runId);
}
```

- [ ] **Step 5: Run all backend benchmark tests**

Run: `cd apps/backend-services && npx vitest run src/benchmark`
Expected: all green.

- [ ] **Step 6: Type-check + lint**

Run: `cd apps/backend-services && npx tsc --noEmit && npx eslint src/benchmark`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark.module.ts apps/backend-services/src/benchmark/benchmark-run.controller.ts apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts
git commit -m "feat(benchmark): expose error detection analysis endpoint"
```

---

## Phase 3 — Frontend: render the analysis

### Task 10: Typed API client

**Files:**
- Create: `apps/frontend/src/features/benchmark/api/errorDetectionAnalysis.ts`

- [ ] **Step 1: Create the client**

```ts
// Mirror of backend ErrorDetectionAnalysisResponseDto
export interface ErrorDetectionCurvePoint {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface ErrorDetectionField {
  name: string;
  evaluatedCount: number;
  errorCount: number;
  errorRate: number;
  curve: ErrorDetectionCurvePoint[];
  suggestedCatch90: number | null;
  suggestedBestBalance: number;
  suggestedMinimizeReview: number | null;
}

export interface ErrorDetectionAnalysis {
  runId: string;
  notReady: boolean;
  fields: ErrorDetectionField[];
  excludedFields: string[];
}

export async function fetchErrorDetectionAnalysis(
  projectId: string,
  runId: string,
): Promise<ErrorDetectionAnalysis> {
  const res = await fetch(
    `/api/benchmark/projects/${projectId}/runs/${runId}/error-detection-analysis`,
    { credentials: "include" },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to load error detection analysis: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as ErrorDetectionAnalysis;
}
```

(If the project uses a different fetch wrapper — check `apps/frontend/src/shared` or sibling `api/` files in `features/benchmark` — use it instead of raw `fetch` to match conventions. Replace the body of `fetchErrorDetectionAnalysis` accordingly. Do not invent a new client.)

- [ ] **Step 2: Type check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/benchmark/api/errorDetectionAnalysis.ts
git commit -m "feat(benchmark): frontend api client for error detection analysis"
```

---

### Task 11: `ErrorDetectionAnalysis` component

**Files:**
- Create: `apps/frontend/src/features/benchmark/components/ErrorDetectionAnalysis.tsx`
- Create: `apps/frontend/src/features/benchmark/components/ErrorDetectionAnalysis.test.tsx`

- [ ] **Step 1: Add failing component test**

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorDetectionAnalysis } from "./ErrorDetectionAnalysis";
import * as api from "../api/errorDetectionAnalysis";

const sampleAnalysis: api.ErrorDetectionAnalysis = {
  runId: "r1",
  notReady: false,
  fields: [
    {
      name: "invoiceNumber",
      evaluatedCount: 4,
      errorCount: 2,
      errorRate: 0.5,
      curve: Array.from({ length: 101 }, (_, i) => ({
        threshold: i / 100,
        tp: i >= 50 ? 2 : 0,
        fp: i >= 96 ? 2 : 0,
        fn: i >= 50 ? 0 : 2,
        tn: i >= 96 ? 0 : 2,
      })),
      suggestedCatch90: 0.5,
      suggestedBestBalance: 0.5,
      suggestedMinimizeReview: 0.7,
    },
  ],
  excludedFields: ["notes"],
};

describe("ErrorDetectionAnalysis", () => {
  beforeEach(() => {
    vi.spyOn(api, "fetchErrorDetectionAnalysis").mockResolvedValue(
      sampleAnalysis,
    );
  });

  it("renders one row per evaluable field with field name and error rate", async () => {
    render(<ErrorDetectionAnalysis projectId="p1" runId="r1" />);
    expect(await screen.findByText("invoiceNumber")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("shows excluded fields footnote", async () => {
    render(<ErrorDetectionAnalysis projectId="p1" runId="r1" />);
    expect(
      await screen.findByText(/1 field excluded/i),
    ).toBeInTheDocument();
  });

  it("updates errors-caught when slider moves", async () => {
    render(<ErrorDetectionAnalysis projectId="p1" runId="r1" />);
    await screen.findByText("invoiceNumber");
    const slider = screen.getByLabelText(
      /threshold for invoiceNumber/i,
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0" } });
    await waitFor(() => {
      // At threshold 0, no errors caught (0 of 2)
      expect(screen.getByText(/0 of 2 real errors/i)).toBeInTheDocument();
    });
  });

  it("snaps slider when 'Catch 90%' chip clicked", async () => {
    render(<ErrorDetectionAnalysis projectId="p1" runId="r1" />);
    await screen.findByText("invoiceNumber");
    fireEvent.click(screen.getByRole("button", { name: /catch 90%/i }));
    const slider = screen.getByLabelText(
      /threshold for invoiceNumber/i,
    ) as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(0.5, 2);
  });

  it("renders empty state when notReady", async () => {
    vi.spyOn(api, "fetchErrorDetectionAnalysis").mockResolvedValue({
      runId: "r1",
      notReady: true,
      fields: [],
      excludedFields: [],
    });
    render(<ErrorDetectionAnalysis projectId="p1" runId="r1" />);
    expect(
      await screen.findByText(/analysis available once the run completes/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/benchmark/components/ErrorDetectionAnalysis.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/features/benchmark/components/ErrorDetectionAnalysis.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  fetchErrorDetectionAnalysis,
  type ErrorDetectionAnalysis as Analysis,
  type ErrorDetectionField,
} from "../api/errorDetectionAnalysis";

interface Props {
  projectId: string;
  runId: string;
}

function curvePointAt(field: ErrorDetectionField, threshold: number) {
  const idx = Math.max(0, Math.min(100, Math.round(threshold * 100)));
  return field.curve[idx];
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ErrorDetectionAnalysis({ projectId, runId }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchErrorDetectionAnalysis(projectId, runId)
      .then((a) => {
        if (cancelled) return;
        setAnalysis(a);
        const init: Record<string, number> = {};
        for (const f of a.fields) init[f.name] = f.suggestedBestBalance;
        setThresholds(init);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  const rollup = useMemo(() => {
    if (!analysis) return null;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const f of analysis.fields) {
      const t = thresholds[f.name] ?? f.suggestedBestBalance;
      const p = curvePointAt(f, t);
      tp += p.tp;
      fp += p.fp;
      fn += p.fn;
      tn += p.tn;
    }
    const totalErrors = tp + fn;
    const totalEvaluated = tp + fp + fn + tn;
    const totalReviewed = tp + fp;
    return {
      tp,
      fp,
      fn,
      totalErrors,
      totalEvaluated,
      totalReviewed,
      recall: totalErrors === 0 ? null : tp / totalErrors,
    };
  }, [analysis, thresholds]);

  if (error) return <div className="error">{error}</div>;
  if (!analysis) return <div>Loading error detection analysis…</div>;

  if (analysis.notReady) {
    return (
      <section>
        <h2>Error Detection Analysis</h2>
        <p>Analysis available once the run completes.</p>
      </section>
    );
  }

  if (analysis.fields.length === 0) {
    return (
      <section>
        <h2>Error Detection Analysis</h2>
        <p>
          No fields in this run have both confidence scores and ground truth,
          so error detection analysis is not available.
        </p>
        {analysis.excludedFields.length > 0 && (
          <p className="footnote">
            {analysis.excludedFields.length} field
            {analysis.excludedFields.length === 1 ? "" : "s"} excluded (no
            ground truth or confidence data).
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="error-detection-analysis">
      <h2>Error Detection Analysis</h2>
      {rollup && (
        <p className="rollup">
          With your current per-field thresholds, you'd catch{" "}
          <strong>
            {rollup.tp} of {rollup.totalErrors} real errors
            {rollup.recall !== null ? ` (${pct(rollup.recall)})` : ""}
          </strong>{" "}
          and review{" "}
          <strong>
            {rollup.totalReviewed} of {rollup.totalEvaluated} fields
          </strong>
          .
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Evaluated</th>
            <th>Error rate</th>
            <th>Threshold</th>
            <th>Suggested</th>
            <th title="Recall — fraction of real errors that would be flagged for review.">
              Errors caught
            </th>
            <th title="Correct fields that would be flagged for review.">
              False alarms
            </th>
            <th>Missed</th>
          </tr>
        </thead>
        <tbody>
          {analysis.fields.map((f) => {
            const t = thresholds[f.name] ?? f.suggestedBestBalance;
            const p = curvePointAt(f, t);
            const setT = (v: number) =>
              setThresholds((prev) => ({ ...prev, [f.name]: v }));
            return (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.evaluatedCount}</td>
                <td>{pct(f.errorRate)}</td>
                <td>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={t}
                    aria-label={`Threshold for ${f.name}`}
                    onChange={(e) => setT(Number(e.target.value))}
                  />
                  <span>{t.toFixed(2)}</span>
                </td>
                <td>
                  <button
                    type="button"
                    disabled={f.suggestedCatch90 === null}
                    title={
                      f.suggestedCatch90 === null
                        ? "Recall ≥ 90% is not attainable for this field"
                        : "Catch 90% of errors"
                    }
                    onClick={() =>
                      f.suggestedCatch90 !== null && setT(f.suggestedCatch90)
                    }
                  >
                    Catch 90%
                  </button>
                  <button
                    type="button"
                    title="Threshold maximizing F1"
                    onClick={() => setT(f.suggestedBestBalance)}
                  >
                    Best balance
                  </button>
                  <button
                    type="button"
                    disabled={f.suggestedMinimizeReview === null}
                    title={
                      f.suggestedMinimizeReview === null
                        ? "False-positive rate ≤ 10% is not attainable for this field"
                        : "Minimize review burden"
                    }
                    onClick={() =>
                      f.suggestedMinimizeReview !== null &&
                      setT(f.suggestedMinimizeReview)
                    }
                  >
                    Minimize review
                  </button>
                </td>
                <td>
                  {p.tp} of {f.errorCount} real errors
                </td>
                <td>{p.fp}</td>
                <td>{p.fn}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {analysis.excludedFields.length > 0 && (
        <p className="footnote">
          {analysis.excludedFields.length} field
          {analysis.excludedFields.length === 1 ? "" : "s"} excluded from
          analysis (no ground truth or confidence data available).
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/benchmark/components/ErrorDetectionAnalysis.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/benchmark/components/ErrorDetectionAnalysis.tsx apps/frontend/src/features/benchmark/components/ErrorDetectionAnalysis.test.tsx
git commit -m "feat(benchmark): frontend ErrorDetectionAnalysis component"
```

---

### Task 12: Render component on RunDetailPage

**Files:**
- Modify: `apps/frontend/src/features/benchmark/pages/RunDetailPage.tsx`

- [ ] **Step 1: Read the page to find a sensible insertion point**

Read `apps/frontend/src/features/benchmark/pages/RunDetailPage.tsx`. Identify where the existing summary / metrics sections are rendered. The new section should appear below the run summary and above (or below) the per-sample drill-down — wherever fits the existing layout.

- [ ] **Step 2: Add the import**

```tsx
import { ErrorDetectionAnalysis } from "../components/ErrorDetectionAnalysis";
```

- [ ] **Step 3: Render the component**

Inside the page render, where `projectId` and `runId` are available from the route params or state, add:

```tsx
<ErrorDetectionAnalysis projectId={projectId} runId={runId} />
```

(Match local variable names actually used in the page.)

- [ ] **Step 4: Type check and run frontend tests**

Run: `cd apps/frontend && npx tsc --noEmit && npx vitest run src/features/benchmark`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/benchmark/pages/RunDetailPage.tsx
git commit -m "feat(benchmark): show error detection analysis on run detail page"
```

---

## Phase 4 — Documentation

### Task 13: Update benchmarking docs

**Files:**
- Modify: a benchmarking-related file under `docs-md/` (e.g. `docs-md/benchmarking-guide.md` if present, or the closest existing file describing run analysis)

- [ ] **Step 1: Identify the file**

Run: `ls docs-md | grep -i bench`. Open the most appropriate file (or, if none exists, create `docs-md/benchmarking-error-detection-analysis.md`).

- [ ] **Step 2: Add a new section**

Add a section describing:

- **What it is:** an interactive per-field tool on the benchmark run detail page for choosing confidence thresholds that route low-confidence predictions to review.
- **What counts as evaluable:** a field instance is included only if it has both a confidence score (from Azure DI) and a ground-truth value.
- **The metrics, in plain language:**
  - *Errors caught (recall):* of the real errors in this field, how many your threshold would flag.
  - *False alarms:* correct predictions that would be flagged unnecessarily.
  - *Missed:* real errors that would slip past the threshold.
- **The three suggested thresholds:**
  - *Catch 90%:* smallest threshold whose recall ≥ 0.90 (disabled if unattainable).
  - *Best balance:* threshold that maximizes F1.
  - *Minimize review:* largest threshold whose false-positive rate ≤ 0.10 (disabled if unattainable).
- **Persistence:** thresholds are not saved across page loads — this is an exploration tool.
- **Data flow:** confidence scores originate from Azure Document Intelligence, are carried through the benchmark pipeline via a sidecar `*-prediction-confidence.json` file, attached per-field by `SchemaAwareEvaluator`, and surfaced via `GET /api/benchmark/projects/:projectId/runs/:runId/error-detection-analysis`.

- [ ] **Step 3: Commit**

```bash
git add docs-md/
git commit -m "docs(benchmark): document error detection analysis"
```

---

## Self-Review Notes

Spec requirements covered:

- Per-field table with sortable rows (default sort by error rate desc) — Task 8 sorts on the server, Task 11 renders.
- Inline slider 0–1 step 0.01 — Task 11.
- Three suggested-threshold chips per row, disabled when unattainable — Tasks 7 and 11.
- Plain-language metric labels with technical-term tooltips — Task 11 (`title=` attributes; component tests verify the user-facing copy).
- Roll-up summary derived from current slider state — Task 11.
- Excluded fields footnote — Task 11; data populated by Task 8.
- Lazy precomputation cached by run ID — Task 8.
- Endpoint returns 404 / `notReady` correctly — Task 8 tests + Task 9 endpoint behavior.
- Confidence sourced from Azure DI through new sidecar pipeline — Tasks 1–5.
- No `any` types, full Swagger DTOs with `@ApiProperty`, dedicated response decorators — Tasks 6 and 9.
- Backend tests created/updated for every new behavior — Tasks 1, 2, 4, 7, 8, 9.
- Per CLAUDE.md, after backend changes run the relevant test suites — included in steps.

Open items deferred (not in scope per spec):

- No persistence of chosen thresholds across page loads.
- No charts.
- No global threshold control.
- Cache invalidation on run mutation: a single `invalidate(runId)` hook is provided for future wiring; the spec accepts that the cache lives for the process lifetime since runs are immutable once completed.

If during Task 9 the existing controller test file uses a setup pattern that does not match the snippet shown, copy the existing test pattern from the closest sibling test in the same file rather than the snippet — the snippet is illustrative.
