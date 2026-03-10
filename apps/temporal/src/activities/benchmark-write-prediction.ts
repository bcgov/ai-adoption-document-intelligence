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

import * as fs from "fs/promises";
import * as path from "path";

export interface BenchmarkWritePredictionInput {
  /** Extracted prediction fields to write (flat key-value object) */
  predictionData: Record<string, unknown>;

  /** Directory to write the prediction file into */
  outputDir: string;

  /** Sample ID (used in filename) */
  sampleId: string;
}

export interface BenchmarkWritePredictionOutput {
  /** Absolute path to the written prediction JSON file */
  predictionPath: string;
}

/**
 * Write prediction data extracted from the workflow ctx to a JSON file.
 *
 * Activity type: benchmark.writePrediction
 */
export async function benchmarkWritePrediction(
  input: BenchmarkWritePredictionInput,
): Promise<BenchmarkWritePredictionOutput> {
  const { predictionData, outputDir, sampleId } = input;

  await fs.mkdir(outputDir, { recursive: true });

  const predictionPath = path.join(outputDir, `${sampleId}-prediction.json`);
  await fs.writeFile(predictionPath, JSON.stringify(predictionData, null, 2));

  return { predictionPath };
}
