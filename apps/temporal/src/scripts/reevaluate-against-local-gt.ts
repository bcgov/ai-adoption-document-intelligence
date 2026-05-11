/**
 * Re-evaluate the per-sample predictions stored in
 * `experiments/results/<slug>/benchmark-run.json` against the CURRENT local
 * ground truth in `data/datasets/samples-mix/public/`, using the canonical
 * schema-aware evaluator with `defaultRule: { rule: "exact" }` and one-of-array
 * GT support.
 *
 * Use this when:
 *  - The GT has been promoted (new one-of array alternates added) AFTER the
 *    benchmark ran, and you want the canonical numbers to reflect the
 *    updated GT without re-running the paid benchmark.
 *  - The benchmark file came from an external deployment whose evaluator
 *    code was out of date (e.g. E00 produced by an older template-model
 *    deployment that didn't honour one-of arrays).
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register \
 *     src/scripts/reevaluate-against-local-gt.ts <slug>
 *
 * The script is destructive: overwrites the input benchmark-run.json with
 * the corrected one. Git history retains the prior numbers.
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { aggregateResults } from "../benchmark-aggregation";
import type { EvaluationResult } from "../benchmark-types";
import { SchemaAwareEvaluator } from "../evaluators/schema-aware-evaluator";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const GT_DIR = path.join(
  REPO_ROOT,
  "data",
  "datasets",
  "samples-mix",
  "public",
);

interface ExportRoot {
  exportedAt: string;
  exportFormatVersion: number;
  run: ExportRun;
  metrics?: Record<string, number>;
  perFieldResults?: PerFieldResult[];
  perSampleResults: PerSampleResult[];
  errorDetectionAnalysis?: unknown;
}

interface ExportRun {
  id: string;
  status: string;
  metrics?: Record<string, number>;
  [k: string]: unknown;
}

interface PerSampleResult {
  sampleId: string;
  metadata?: Record<string, unknown>;
  metrics?: Record<string, number>;
  pass?: boolean;
  diagnostics?: Record<string, unknown>;
  groundTruth?: Record<string, unknown>;
  prediction?: Record<string, unknown>;
  evaluationDetails?: Array<{
    field: string;
    matched: boolean;
    predicted?: unknown;
    expected?: unknown;
    similarity?: number;
    confidence?: number | null;
  }>;
  evaluationBlobPath?: string;
}

interface PerFieldResult {
  field: string;
  fieldType?: string;
  totalCount: number;
  correctCount: number;
  errorCount: number;
  accuracy: number;
  errorRate: number;
  errors?: Array<{
    sampleId: string;
    predicted?: unknown;
    expected?: unknown;
  }>;
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    throw new Error("Usage: reevaluate-against-local-gt.ts <slug>");
  }
  const exportPath = path.join(
    REPO_ROOT,
    "experiments",
    "results",
    slug,
    "benchmark-run.json",
  );
  const raw = await fsp.readFile(exportPath, "utf-8");
  const root = JSON.parse(raw) as ExportRoot;
  const samples = root.perSampleResults.filter(
    (s) => s.sampleId !== "manifest" && s.prediction,
  );
  console.log(
    `Loaded ${root.perSampleResults.length} entries from ${slug}; ${samples.length} have predictions.`,
  );

  const evaluator = new SchemaAwareEvaluator();
  const tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), `reeval-${slug}-`));

  const results: EvaluationResult[] = [];
  const updatedSamples: PerSampleResult[] = [];

  for (const s of samples) {
    const sampleId = s.sampleId;
    const gtPath = path.join(GT_DIR, `${sampleId}.json`);
    if (!fs.existsSync(gtPath)) {
      console.warn(`  ! ${sampleId}: no local GT at ${gtPath}; skipping`);
      continue;
    }
    const predPath = path.join(
      tmpdir,
      `pred-${encodeURIComponent(sampleId)}.json`,
    );
    await fsp.writeFile(predPath, JSON.stringify(s.prediction ?? {}));

    const evalResult = await evaluator.evaluate({
      sampleId,
      inputPaths: [],
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      metadata: {},
      evaluatorConfig: { defaultRule: { rule: "exact" }, passThreshold: 0.8 },
    });
    results.push(evalResult);

    const gtObj = JSON.parse(await fsp.readFile(gtPath, "utf-8")) as Record<
      string,
      unknown
    >;
    updatedSamples.push({
      sampleId,
      metadata: s.metadata ?? {},
      metrics: evalResult.metrics,
      pass: evalResult.pass,
      diagnostics: evalResult.diagnostics,
      groundTruth: gtObj,
      prediction: s.prediction,
      evaluationDetails:
        evalResult.evaluationDetails as PerSampleResult["evaluationDetails"],
      evaluationBlobPath: s.evaluationBlobPath,
    });
  }

  // Carry over original samples that had no prediction (e.g. workflow failures).
  // Those keep their existing diagnostics so the comparison report can flag them.
  const skipped = root.perSampleResults.filter(
    (s) => s.sampleId !== "manifest" && !s.prediction,
  );
  for (const s of skipped) {
    updatedSamples.push(s);
  }

  // Aggregate. Failed samples (no prediction, no metrics) get folded into
  // totals so pass_rate reflects the full 40-sample dataset, not just the
  // surviving subset.
  const aggregated = aggregateResults([
    ...results,
    ...(skipped.map((s) => ({
      sampleId: s.sampleId,
      metrics: {},
      diagnostics: s.diagnostics,
      pass: false,
    })) as EvaluationResult[]),
  ]);
  const overall = aggregated.overall;
  const flat: Record<string, number> = {
    pass_rate: overall.passRate,
    total_samples: overall.totalSamples,
    passing_samples: overall.passingSamples,
    failing_samples: overall.failingSamples,
  };
  for (const [name, stats] of Object.entries(overall.metrics)) {
    flat[`${name}.mean`] = stats.mean;
    flat[`${name}.median`] = stats.median;
    flat[`${name}.stdDev`] = stats.stdDev;
    flat[`${name}.p5`] = stats.p5;
    flat[`${name}.p25`] = stats.p25;
    flat[`${name}.p75`] = stats.p75;
    flat[`${name}.p95`] = stats.p95;
    flat[`${name}.min`] = stats.min;
    flat[`${name}.max`] = stats.max;
  }

  // Per-field aggregation
  const fieldMap = new Map<
    string,
    {
      fieldType: string;
      totalCount: number;
      correctCount: number;
      errors: Array<{
        sampleId: string;
        predicted?: unknown;
        expected?: unknown;
      }>;
    }
  >();
  for (const s of updatedSamples) {
    for (const d of s.evaluationDetails ?? []) {
      const entry = fieldMap.get(d.field) ?? {
        fieldType: typeof d.expected === "number" ? "number" : "string",
        totalCount: 0,
        correctCount: 0,
        errors: [] as Array<{
          sampleId: string;
          predicted?: unknown;
          expected?: unknown;
        }>,
      };
      entry.totalCount += 1;
      if (d.matched) entry.correctCount += 1;
      else
        entry.errors.push({
          sampleId: s.sampleId,
          predicted: d.predicted,
          expected: d.expected,
        });
      fieldMap.set(d.field, entry);
    }
  }
  const perFieldResults: PerFieldResult[] = [];
  for (const [field, agg] of fieldMap.entries()) {
    const accuracy = agg.totalCount > 0 ? agg.correctCount / agg.totalCount : 0;
    perFieldResults.push({
      field,
      fieldType: agg.fieldType,
      totalCount: agg.totalCount,
      correctCount: agg.correctCount,
      errorCount: agg.totalCount - agg.correctCount,
      accuracy,
      errorRate: 1 - accuracy,
      errors: agg.errors,
    });
  }
  perFieldResults.sort((a, b) => b.errorRate - a.errorRate);

  const updatedRun: ExportRun = {
    ...root.run,
    status: root.run.status,
    metrics: flat,
  };
  const updatedRoot: ExportRoot = {
    exportedAt: new Date().toISOString(),
    exportFormatVersion: root.exportFormatVersion ?? 1,
    run: updatedRun,
    metrics: flat,
    perFieldResults,
    perSampleResults: updatedSamples,
  };

  await fsp.writeFile(exportPath, JSON.stringify(updatedRoot, null, 2));
  console.log(`✓ wrote ${exportPath}`);
  console.log(
    `  pass_rate ${flat.pass_rate.toFixed(3)} (${flat.passing_samples}/${flat.total_samples})`,
  );
  console.log(
    `  f1.median ${(flat["f1.median"] ?? 0).toFixed(3)}, f1.mean ${(flat["f1.mean"] ?? 0).toFixed(3)}, precision.mean ${(flat["precision.mean"] ?? 0).toFixed(3)}, recall.mean ${(flat["recall.mean"] ?? 0).toFixed(3)}`,
  );
  console.log(
    `  matchedFields.median ${flat["matchedFields.median"] ?? 0}, falsePositives.mean ${(flat["falsePositives.mean"] ?? 0).toFixed(3)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
