/**
 * Benchmark Write Prediction Activity
 *
 * Writes the workflow result context (extracted fields) to a JSON file
 * so the evaluator can compare predictions against ground truth.
 *
 * In benchmark mode the graph workflow stores OCR/extraction results in its
 * in-memory ctx rather than writing files to disk. This activity bridges
 * the gap by serializing the prediction fields to a JSON file.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGroupBenchmarkCacheDir } from "../blob-storage/read-group-blob";

export interface BenchmarkWritePredictionInput {
  /** Extracted prediction fields to write (flat key-value object) */
  predictionData: Record<string, unknown>;

  /** Directory to write the prediction file into */
  outputDir: string;

  /** Sample ID (used in filename) */
  sampleId: string;

  /** Group of the benchmark run; the file is written only inside its benchmark cache */
  groupId?: string | null;
}

export interface BenchmarkWritePredictionOutput {
  /** Absolute path to the written prediction JSON file */
  predictionPath: string;
}

/**
 * Write prediction data extracted from the workflow ctx to a JSON file.
 * The folder and the file must both lie inside the run's group benchmark
 * cache, `{BENCHMARK_CACHE_DIR}/{groupId}`.
 *
 * Activity type: benchmark.writePrediction
 */
export async function benchmarkWritePrediction(
  input: BenchmarkWritePredictionInput,
): Promise<BenchmarkWritePredictionOutput> {
  const { predictionData, outputDir, sampleId, groupId } = input;
  if (!groupId) {
    throw new Error(
      `groupId is required to write the prediction for sample ${sampleId}`,
    );
  }

  const groupCacheDir = path.resolve(getGroupBenchmarkCacheDir(groupId));
  const resolvedOutputDir = path.resolve(outputDir);
  const predictionPath = path.join(
    resolvedOutputDir,
    `${sampleId}-prediction.json`,
  );
  for (const target of [resolvedOutputDir, predictionPath]) {
    if (!target.startsWith(groupCacheDir + path.sep)) {
      throw new Error(
        `Prediction output is outside the group's benchmark cache: "${target}"`,
      );
    }
  }

  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const fileHandle = await fs.open(predictionPath, "w", 0o600);
  try {
    await fileHandle.writeFile(JSON.stringify(predictionData, null, 2));
  } finally {
    await fileHandle.close();
  }

  return { predictionPath };
}
