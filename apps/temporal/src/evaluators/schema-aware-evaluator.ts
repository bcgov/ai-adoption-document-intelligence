/**
 * Schema-Aware Evaluator
 *
 * Evaluates workflow outputs against structured ground truth using field-level comparison.
 * Computes precision, recall, and F1 metrics with configurable matching rules.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-015-schema-aware-evaluator.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 5.2
 */

import * as fs from "fs/promises";
import {
  BenchmarkEvaluator,
  EvaluationInput,
  EvaluationResult,
} from "../benchmark-types";
import {
  digitsOnly,
  isDateLikeFieldKey,
  isIdentifierLikeFieldKey,
  parseToCalendarParts,
  shouldCoerceDateFieldNoiseToEmpty,
} from "../form-field-normalization";

/**
 * Check if a value represents "no value" — null, undefined, empty string, or the string "null"
 * are all treated as semantically equivalent.
 */
export function isNullLike(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "null";
}

/**
 * Matching rule configuration for a field
 */
export interface FieldMatchingRule {
  /**
   * Matching rule type
   */
  rule: "exact" | "fuzzy" | "numeric" | "date" | "boolean";

  /**
   * Similarity threshold for fuzzy matching (0.0 to 1.0)
   */
  fuzzyThreshold?: number;

  /**
   * Absolute tolerance for numeric matching
   */
  numericAbsoluteTolerance?: number;

  /**
   * Relative tolerance for numeric matching (0.0 to 1.0)
   */
  numericRelativeTolerance?: number;

  /**
   * Accepted date formats for date matching
   */
  dateFormats?: string[];
}

/**
 * Schema-aware evaluator configuration
 */
export interface SchemaAwareConfig {
  /**
   * Field-specific matching rules
   * Key: field name, Value: matching rule
   */
  fieldRules?: Record<string, FieldMatchingRule>;

  /**
   * Default matching rule for fields not specified in fieldRules
   */
  defaultRule?: FieldMatchingRule;

  /**
   * F1 threshold for pass/fail determination
   */
  passThreshold?: number;
}

/**
 * Field comparison result
 */
interface FieldComparisonResult {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
  similarity?: number;
  absoluteError?: number;
  relativeError?: number;
}

/**
 * Schema-aware evaluator implementation
 */
export class SchemaAwareEvaluator implements BenchmarkEvaluator {
  public readonly type = "schema-aware";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    // Parse configuration
    const config = input.evaluatorConfig as SchemaAwareConfig;
    const passThreshold = config.passThreshold ?? 1.0;

    // Validate paths
    const predictionPath = input.predictionPaths?.[0];
    const groundTruthPath = input.groundTruthPaths?.[0];

    if (!predictionPath) {
      return {
        sampleId: input.sampleId,
        metrics: {},
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
        metrics: {},
        diagnostics: {
          error: "missing_ground_truth_path",
          message: "No ground truth file path provided",
        },
        pass: false,
      };
    }

    // Load prediction and ground truth
    const prediction = await this.loadJson(predictionPath);
    const groundTruth = await this.loadJson(groundTruthPath);

    // Compare all fields
    const comparisonResults: FieldComparisonResult[] = [];

    // Compare ground truth fields (for recall calculation)
    for (const field of Object.keys(groundTruth)) {
      const result = this.compareField(
        field,
        prediction[field],
        groundTruth[field],
        config,
      );
      comparisonResults.push(result);
    }

    // Identify extra fields in prediction (for precision calculation)
    // Null-like prediction values are not meaningful extra fields
    const extraFields = Object.keys(prediction).filter(
      (field) => !(field in groundTruth) && !isNullLike(prediction[field]),
    );
    for (const field of extraFields) {
      comparisonResults.push({
        field,
        matched: false,
        predicted: prediction[field],
        expected: undefined,
      });
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(comparisonResults, groundTruth);

    // Build diagnostics
    const missingFields = comparisonResults
      .filter((r) => !isNullLike(r.expected) && isNullLike(r.predicted))
      .map((r) => r.field);

    const mismatchedFields = comparisonResults
      .filter(
        (r) =>
          !r.matched && !isNullLike(r.expected) && !isNullLike(r.predicted),
      )
      .map((r) => ({
        field: r.field,
        expected: r.expected,
        predicted: r.predicted,
        similarity: r.similarity,
        absoluteError: r.absoluteError,
        relativeError: r.relativeError,
      }));

    const diagnostics = {
      totalFields: Object.keys(groundTruth).length,
      matchedFields: comparisonResults.filter((r) => r.matched).length,
      missingFields,
      extraFields,
      mismatchedFields,
      comparisonResults,
    };

    return {
      sampleId: input.sampleId,
      metrics,
      diagnostics,
      pass: metrics.f1 >= passThreshold,
      groundTruth,
      prediction,
      evaluationDetails: comparisonResults,
    };
  }

  /**
   * Load JSON file
   */
  private async loadJson(path: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Compare a single field
   */
  private compareField(
    field: string,
    predicted: unknown,
    expected: unknown,
    config: SchemaAwareConfig,
  ): FieldComparisonResult {
    // Get matching rule for this field
    const rule = config.fieldRules?.[field] ||
      config.defaultRule || {
        rule: "exact" as const,
      };

    if (isNullLike(predicted) && isNullLike(expected)) {
      return {
        field,
        matched: true,
        predicted,
        expected,
      };
    }

    // Handle missing prediction (only predicted is null-like, expected has a real value)
    if (isNullLike(predicted)) {
      return {
        field,
        matched: false,
        predicted: undefined,
        expected,
      };
    }

    // Apply matching rule
    switch (rule.rule) {
      case "exact":
        return this.exactMatch(field, predicted, expected);
      case "fuzzy":
        return this.fuzzyMatch(
          field,
          predicted,
          expected,
          rule.fuzzyThreshold ?? 0.8,
        );
      case "numeric":
        return this.numericMatch(
          field,
          predicted,
          expected,
          rule.numericAbsoluteTolerance,
          rule.numericRelativeTolerance,
        );
      case "date":
        return this.dateMatch(field, predicted, expected, rule.dateFormats);
      case "boolean":
        return this.booleanMatch(field, predicted, expected);
      default:
        return this.exactMatch(field, predicted, expected);
    }
  }

  /**
   * Exact match comparison
   */
  private exactMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
  ): FieldComparisonResult {
    const predictedStr = String(predicted);
    const expectedStr = String(expected);

    if (predictedStr === expectedStr) {
      return { field, matched: true, predicted, expected };
    }

    if (expectedStr === "" && predictedStr.trim() === "") {
      return { field, matched: true, predicted, expected };
    }

    if (
      isDateLikeFieldKey(field) &&
      expectedStr === "" &&
      shouldCoerceDateFieldNoiseToEmpty(predictedStr)
    ) {
      return { field, matched: true, predicted, expected };
    }

    if (isIdentifierLikeFieldKey(field)) {
      const pd = digitsOnly(predictedStr);
      const ed = digitsOnly(expectedStr);
      if (pd.length > 0 && pd === ed) {
        return { field, matched: true, predicted, expected };
      }
    }

    if (isDateLikeFieldKey(field)) {
      const pCal = parseToCalendarParts(predictedStr);
      const eCal = parseToCalendarParts(expectedStr);
      if (
        pCal !== null &&
        eCal !== null &&
        pCal.y === eCal.y &&
        pCal.m === eCal.m &&
        pCal.day === eCal.day
      ) {
        return { field, matched: true, predicted, expected };
      }
    }

    const predictedNum = this.parseNumeric(predictedStr);
    const expectedNum = this.parseNumeric(expectedStr);
    if (
      predictedNum !== null &&
      expectedNum !== null &&
      predictedNum === expectedNum
    ) {
      return { field, matched: true, predicted, expected };
    }

    return {
      field,
      matched: false,
      predicted,
      expected,
    };
  }

  /**
   * Fuzzy match comparison using Levenshtein similarity
   */
  private fuzzyMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    threshold: number,
  ): FieldComparisonResult {
    const predictedStr = String(predicted);
    const expectedStr = String(expected);

    const similarity = this.levenshteinSimilarity(predictedStr, expectedStr);
    const matched = similarity >= threshold;

    return {
      field,
      matched,
      predicted,
      expected,
      similarity,
    };
  }

  /**
   * Calculate Levenshtein similarity (0.0 to 1.0)
   */
  private levenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return 1.0 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Numeric match comparison
   */
  private numericMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    absoluteTolerance?: number,
    relativeTolerance?: number,
  ): FieldComparisonResult {
    // Parse numeric values (handle commas in numbers)
    const predictedNum = this.parseNumeric(String(predicted));
    const expectedNum = this.parseNumeric(String(expected));

    if (
      predictedNum === null ||
      expectedNum === null ||
      isNaN(predictedNum) ||
      isNaN(expectedNum)
    ) {
      // Fall back to exact match if not numeric
      return this.exactMatch(field, predicted, expected);
    }

    const absoluteError = Math.abs(predictedNum - expectedNum);
    const relativeError =
      expectedNum !== 0 ? absoluteError / Math.abs(expectedNum) : 0;

    let matched = predictedNum === expectedNum;

    // Check absolute tolerance
    if (absoluteTolerance !== undefined && absoluteError <= absoluteTolerance) {
      matched = true;
    }

    // Check relative tolerance
    if (relativeTolerance !== undefined && relativeError <= relativeTolerance) {
      matched = true;
    }

    return {
      field,
      matched,
      predicted,
      expected,
      absoluteError,
      relativeError,
    };
  }

  /**
   * Parse numeric value (handle commas and spaces so "6 191.12" and "6,191.12" parse)
   */
  private parseNumeric(value: string): number | null {
    const cleaned = value.replace(/,/g, "").replace(/\s/g, "");
    if (cleaned === "") return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Date match comparison
   */
  private dateMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    _formats?: string[],
  ): FieldComparisonResult {
    const pCal = parseToCalendarParts(String(predicted));
    const eCal = parseToCalendarParts(String(expected));

    if (pCal === null || eCal === null) {
      return this.exactMatch(field, predicted, expected);
    }

    const matched =
      pCal.y === eCal.y && pCal.m === eCal.m && pCal.day === eCal.day;

    return {
      field,
      matched,
      predicted,
      expected,
    };
  }

  /**
   * Boolean match comparison
   */
  private booleanMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
  ): FieldComparisonResult {
    const predictedBool = this.parseBoolean(predicted);
    const expectedBool = this.parseBoolean(expected);

    const matched = predictedBool === expectedBool;

    return {
      field,
      matched,
      predicted,
      expected,
    };
  }

  /**
   * Parse boolean value
   */
  private parseBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      return lower === "true" || lower === "yes" || lower === "1";
    }
    return Boolean(value);
  }

  /**
   * Calculate precision, recall, and F1 metrics
   */
  private calculateMetrics(
    results: FieldComparisonResult[],
    groundTruth: Record<string, unknown>,
  ): Record<string, number> {
    const groundTruthFields = Object.keys(groundTruth);
    const truePositives = results.filter(
      (r) => r.matched && r.expected !== undefined,
    ).length;
    const falsePositives = results.filter(
      (r) => !r.matched && r.expected === undefined,
    ).length;
    const falseNegatives = results.filter(
      (r) => !r.matched && r.expected !== undefined,
    ).length;

    const precision =
      truePositives + falsePositives > 0
        ? truePositives / (truePositives + falsePositives)
        : 0;

    const recall =
      truePositives + falseNegatives > 0
        ? truePositives / (truePositives + falseNegatives)
        : 0;

    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Calculate checkbox accuracy (boolean fields)
    const booleanFields = results.filter(
      (r) => typeof r.expected === "boolean",
    );
    const checkboxAccuracy =
      booleanFields.length > 0
        ? booleanFields.filter((r) => r.matched).length / booleanFields.length
        : 0;

    return {
      precision,
      recall,
      f1,
      truePositives,
      falsePositives,
      falseNegatives,
      totalGroundTruthFields: groundTruthFields.length,
      matchedFields: truePositives,
      checkboxAccuracy,
    };
  }
}
