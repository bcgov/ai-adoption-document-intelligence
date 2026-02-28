/**
 * Black-Box Evaluator
 *
 * Evaluates workflow outputs using opaque comparison (JSON deep-equal with diff).
 * Treats outputs as opaque -- no schema knowledge required.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-016-black-box-evaluator.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 5.3
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  BenchmarkEvaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationArtifact,
} from "../benchmark-types";

/**
 * Diff entry representing a difference between prediction and ground truth
 */
interface DiffEntry {
  path: string;
  type: "added" | "deleted" | "changed";
  expected?: unknown;
  actual?: unknown;
}

/**
 * Black-box evaluator implementation
 */
export class BlackBoxEvaluator implements BenchmarkEvaluator {
  public readonly type = "black-box";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    // Validate paths
    const predictionPath = input.predictionPaths?.[0];
    const groundTruthPath = input.groundTruthPaths?.[0];

    if (!predictionPath) {
      return {
        sampleId: input.sampleId,
        metrics: { exact_match: 0, field_overlap: 0 },
        diagnostics: {
          error: "missing_prediction_path",
          message: "No prediction file path provided",
        },
        pass: false,
      };
    }

    if (!groundTruthPath) {
      return {
        sampleId: input.sampleId,
        metrics: { exact_match: 0, field_overlap: 0 },
        diagnostics: {
          error: "missing_ground_truth_path",
          message: "No ground truth file path provided",
        },
        pass: false,
      };
    }

    try {
      // Load prediction and ground truth
      const predictionContent = await fs.readFile(
        predictionPath,
        "utf-8",
      );
      const groundTruthContent = await fs.readFile(
        groundTruthPath,
        "utf-8",
      );

      // Try to parse as JSON
      let prediction: unknown;
      let groundTruth: unknown;
      let isJson = true;

      try {
        prediction = JSON.parse(predictionContent);
        groundTruth = JSON.parse(groundTruthContent);
      } catch {
        // Not JSON, fall back to byte-level comparison
        isJson = false;
        prediction = predictionContent;
        groundTruth = groundTruthContent;
      }

      if (isJson && typeof prediction === "object" && typeof groundTruth === "object") {
        return this.evaluateJson(input, prediction, groundTruth);
      } else {
        return this.evaluateRaw(
          input,
          predictionContent,
          groundTruthContent,
        );
      }
    } catch (error) {
      // Handle file read errors
      return {
        sampleId: input.sampleId,
        metrics: {
          exact_match: 0,
          field_overlap: 0,
        },
        diagnostics: {
          error: error instanceof Error ? error.message : String(error),
        },
        pass: false,
      };
    }
  }

  /**
   * Evaluate JSON objects
   */
  private async evaluateJson(
    input: EvaluationInput,
    prediction: unknown,
    groundTruth: unknown,
  ): Promise<EvaluationResult> {
    // Perform deep equality check
    const exactMatch = this.deepEqual(prediction, groundTruth);

    // Generate diff if not equal
    const diff: DiffEntry[] = [];
    if (!exactMatch) {
      this.generateDiff(prediction, groundTruth, "", diff);
    }

    // Calculate field overlap (for objects)
    const fieldOverlap = this.calculateFieldOverlap(prediction, groundTruth);

    // Create diff artifact if there are differences
    const artifacts: EvaluationArtifact[] = [];
    if (diff.length > 0) {
      const artifact = await this.createDiffArtifact(input.sampleId, diff);
      artifacts.push(artifact);
    }

    return {
      sampleId: input.sampleId,
      metrics: {
        exact_match: exactMatch ? 1.0 : 0.0,
        field_overlap: fieldOverlap,
        diff_count: diff.length,
      },
      diagnostics: {
        exactMatch,
        diff,
        diffCount: diff.length,
      },
      artifacts,
      pass: exactMatch,
    };
  }

  /**
   * Evaluate raw (non-JSON) content
   */
  private evaluateRaw(
    input: EvaluationInput,
    prediction: string,
    groundTruth: string,
  ): EvaluationResult {
    const exactMatch = prediction === groundTruth;

    return {
      sampleId: input.sampleId,
      metrics: {
        exact_match: exactMatch ? 1.0 : 0.0,
        byte_length_prediction: prediction.length,
        byte_length_groundtruth: groundTruth.length,
      },
      diagnostics: {
        exactMatch,
        format: "raw",
        lengthDifference: prediction.length - groundTruth.length,
      },
      pass: exactMatch,
    };
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a === null || b === null) return a === b;
    if (a === undefined || b === undefined) return a === b;

    if (typeof a !== typeof b) return false;

    if (typeof a !== "object") return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (Array.isArray(a) || Array.isArray(b)) return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();

    if (aKeys.length !== bKeys.length) return false;
    if (!aKeys.every((key, index) => key === bKeys[index])) return false;

    return aKeys.every((key) => this.deepEqual(aObj[key], bObj[key]));
  }

  /**
   * Generate diff between prediction and ground truth
   */
  private generateDiff(
    actual: unknown,
    expected: unknown,
    currentPath: string,
    diff: DiffEntry[],
  ): void {
    if (this.deepEqual(actual, expected)) return;

    // Handle null/undefined
    if (actual === null || actual === undefined) {
      if (expected !== null && expected !== undefined) {
        diff.push({
          path: currentPath || "(root)",
          type: "deleted",
          expected,
        });
      }
      return;
    }

    if (expected === null || expected === undefined) {
      diff.push({
        path: currentPath || "(root)",
        type: "added",
        actual,
      });
      return;
    }

    // Handle type mismatch
    if (typeof actual !== typeof expected) {
      diff.push({
        path: currentPath || "(root)",
        type: "changed",
        expected,
        actual,
      });
      return;
    }

    // Handle primitives
    if (typeof actual !== "object") {
      if (actual !== expected) {
        diff.push({
          path: currentPath || "(root)",
          type: "changed",
          expected,
          actual,
        });
      }
      return;
    }

    // Handle arrays
    if (Array.isArray(actual) && Array.isArray(expected)) {
      const maxLength = Math.max(actual.length, expected.length);
      for (let i = 0; i < maxLength; i++) {
        const itemPath = `${currentPath}[${i}]`;
        if (i >= actual.length) {
          diff.push({
            path: itemPath,
            type: "deleted",
            expected: expected[i],
          });
        } else if (i >= expected.length) {
          diff.push({
            path: itemPath,
            type: "added",
            actual: actual[i],
          });
        } else {
          this.generateDiff(actual[i], expected[i], itemPath, diff);
        }
      }
      return;
    }

    // Handle objects
    const actualObj = actual as Record<string, unknown>;
    const expectedObj = expected as Record<string, unknown>;

    const allKeys = new Set([
      ...Object.keys(actualObj),
      ...Object.keys(expectedObj),
    ]);

    for (const key of allKeys) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;

      if (!(key in actualObj)) {
        diff.push({
          path: fieldPath,
          type: "deleted",
          expected: expectedObj[key],
        });
      } else if (!(key in expectedObj)) {
        diff.push({
          path: fieldPath,
          type: "added",
          actual: actualObj[key],
        });
      } else {
        this.generateDiff(actualObj[key], expectedObj[key], fieldPath, diff);
      }
    }
  }

  /**
   * Calculate field overlap (fraction of matching fields)
   */
  private calculateFieldOverlap(actual: unknown, expected: unknown): number {
    if (typeof actual !== "object" || typeof expected !== "object") {
      return actual === expected ? 1.0 : 0.0;
    }

    if (actual === null || expected === null) {
      return actual === expected ? 1.0 : 0.0;
    }

    if (Array.isArray(actual) && Array.isArray(expected)) {
      if (actual.length === 0 && expected.length === 0) return 1.0;
      const maxLength = Math.max(actual.length, expected.length);
      if (maxLength === 0) return 1.0;

      let matchCount = 0;
      const minLength = Math.min(actual.length, expected.length);
      for (let i = 0; i < minLength; i++) {
        if (this.deepEqual(actual[i], expected[i])) {
          matchCount++;
        }
      }
      return matchCount / maxLength;
    }

    const actualObj = actual as Record<string, unknown>;
    const expectedObj = expected as Record<string, unknown>;

    const allKeys = new Set([
      ...Object.keys(actualObj),
      ...Object.keys(expectedObj),
    ]);

    if (allKeys.size === 0) return 1.0;

    let matchCount = 0;
    for (const key of allKeys) {
      if (key in actualObj && key in expectedObj) {
        if (this.deepEqual(actualObj[key], expectedObj[key])) {
          matchCount++;
        }
      }
    }

    return matchCount / allKeys.size;
  }

  /**
   * Create diff artifact file
   */
  private async createDiffArtifact(
    sampleId: string,
    diff: DiffEntry[],
  ): Promise<EvaluationArtifact> {
    // Create temp file for diff
    const tempDir = os.tmpdir();
    const diffPath = path.join(tempDir, `diff-${sampleId}-${Date.now()}.json`);

    const diffReport = {
      sampleId,
      timestamp: new Date().toISOString(),
      differences: diff,
    };

    await fs.writeFile(diffPath, JSON.stringify(diffReport, null, 2));

    return {
      type: "diff",
      path: diffPath,
      mimeType: "application/json",
    };
  }
}
