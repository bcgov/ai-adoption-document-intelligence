/**
 * OCR Correction Evaluator
 *
 * Evaluates workflow outputs with OCR-specific metrics: character-level accuracy,
 * word-level accuracy, and field-level accuracy. Designed for measuring the
 * effectiveness of OCR correction tools.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-04-benchmark-integration-workflow-comparison.md
 */

import * as fs from "node:fs/promises";
import type {
  BenchmarkEvaluator,
  EvaluationInput,
  EvaluationResult,
} from "../benchmark-types";
import { levenshteinDistance } from "./levenshtein";

export interface OcrCorrectionConfig {
  /** Fields to evaluate. Empty/undefined means all fields. */
  fieldScope?: string[];
  /** Character accuracy threshold for pass/fail. Default: 0.95 */
  charAccuracyThreshold?: number;
  /** Field accuracy threshold for pass/fail. Default: 0.9 */
  fieldAccuracyThreshold?: number;
}

interface FieldComparisonResult {
  field: string;
  predicted: string;
  expected: string;
  charAccuracy: number;
  wordAccuracy: number;
  exactMatch: boolean;
}

function computeCharAccuracy(predicted: string, expected: string): number {
  if (expected.length === 0 && predicted.length === 0) return 1.0;
  if (expected.length === 0) return 0.0;

  const distance = levenshteinDistance(predicted, expected);
  return Math.max(
    0,
    1.0 - distance / Math.max(predicted.length, expected.length),
  );
}

function computeWordAccuracy(predicted: string, expected: string): number {
  const predWords = predicted.trim().split(/\s+/).filter(Boolean);
  const expWords = expected.trim().split(/\s+/).filter(Boolean);

  if (expWords.length === 0 && predWords.length === 0) return 1.0;
  if (expWords.length === 0) return 0.0;

  let matches = 0;
  const predSet = new Set(predWords);
  for (const word of expWords) {
    if (predSet.has(word)) matches++;
  }

  return matches / Math.max(predWords.length, expWords.length);
}

export class OcrCorrectionEvaluator implements BenchmarkEvaluator {
  public readonly type = "ocr-correction";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const config = input.evaluatorConfig as OcrCorrectionConfig;
    const charThreshold = config.charAccuracyThreshold ?? 0.95;
    const fieldThreshold = config.fieldAccuracyThreshold ?? 0.9;

    const predictionPath = input.predictionPaths?.[0];
    const groundTruthPath = input.groundTruthPaths?.[0];

    if (!predictionPath || !groundTruthPath) {
      return {
        sampleId: input.sampleId,
        metrics: {},
        diagnostics: {
          error: "missing_paths",
          message: "Prediction or ground truth path missing",
        },
        pass: false,
      };
    }

    const prediction = await this.loadJson(predictionPath);
    const groundTruth = await this.loadJson(groundTruthPath);

    const results: FieldComparisonResult[] = [];

    const fieldsToEvaluate =
      config.fieldScope && config.fieldScope.length > 0
        ? config.fieldScope.filter((f) => f in groundTruth)
        : Object.keys(groundTruth);

    for (const field of fieldsToEvaluate) {
      const predValue = String(prediction[field] ?? "");
      const expValue = String(groundTruth[field] ?? "");

      results.push({
        field,
        predicted: predValue,
        expected: expValue,
        charAccuracy: computeCharAccuracy(predValue, expValue),
        wordAccuracy: computeWordAccuracy(predValue, expValue),
        exactMatch: predValue === expValue,
      });
    }

    const totalFields = results.length;
    const exactMatches = results.filter((r) => r.exactMatch).length;
    const avgCharAccuracy =
      totalFields > 0
        ? results.reduce((sum, r) => sum + r.charAccuracy, 0) / totalFields
        : 0;
    const avgWordAccuracy =
      totalFields > 0
        ? results.reduce((sum, r) => sum + r.wordAccuracy, 0) / totalFields
        : 0;
    const fieldAccuracy = totalFields > 0 ? exactMatches / totalFields : 0;

    const pass =
      avgCharAccuracy >= charThreshold && fieldAccuracy >= fieldThreshold;

    const mismatches = results
      .filter((r) => !r.exactMatch)
      .map((r) => ({
        field: r.field,
        predicted: r.predicted,
        expected: r.expected,
        charAccuracy: Math.round(r.charAccuracy * 10000) / 10000,
      }));

    return {
      sampleId: input.sampleId,
      metrics: {
        charAccuracy: avgCharAccuracy,
        wordAccuracy: avgWordAccuracy,
        fieldAccuracy,
        exactMatches,
        totalFields,
      },
      diagnostics: {
        fieldResults: results,
        mismatches,
      },
      pass,
      groundTruth,
      prediction,
      evaluationDetails: results,
    };
  }

  private async loadJson(path: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path, "utf-8");
    return JSON.parse(content);
  }
}
