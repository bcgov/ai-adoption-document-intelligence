/**
 * Schema-Aware Evaluator
 *
 * Evaluates workflow outputs against structured ground truth using field-level comparison.
 * Computes precision, recall, and F1 metrics with configurable matching rules.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-015-schema-aware-evaluator.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 5.2
 */

import * as fs from "node:fs/promises";
import {
  BenchmarkEvaluator,
  EvaluationInput,
  EvaluationResult,
} from "../benchmark-types";
import { canonicalize } from "../field-format-engine";
import { parseToCalendarParts } from "../form-field-normalization";
import { levenshteinDistance } from "./levenshtein";

/**
 * Check if a scalar value represents "no value" — null, undefined, empty string,
 * or the string "null" are all treated as semantically equivalent.
 */
function isNullLikeScalar(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "null";
}

/**
 * GT sentinel values that act as wildcards — the field is treated as unscored.
 * Labellers use `:garbled:` when the form value is unreadable; counting that
 * cell against an engine that did or didn't transcribe it isn't meaningful.
 * Any prediction (null or otherwise) matches when an expected alternate is in
 * this set.
 */
const WILDCARD_SENTINELS = new Set<string>([":garbled:"]);

function isWildcardExpected(expected: unknown): boolean {
  for (const a of Array.isArray(expected) ? expected : [expected]) {
    if (typeof a === "string" && WILDCARD_SENTINELS.has(a)) return true;
  }
  return false;
}

/**
 * Check if a value represents "no value". For arrays (one-of GT alternates),
 * returns true only when every alternate is itself null-like (or the array is
 * empty), so `["", null]` is treated as "blank is acceptable" but
 * `["", "real_value"]` is treated as a real expected value.
 */
export function isNullLike(v: unknown): boolean {
  if (Array.isArray(v)) {
    return v.length === 0 || v.every((item) => isNullLikeScalar(item));
  }
  return isNullLikeScalar(v);
}

/**
 * Return the list of acceptable expected values. If `expected` is a plain
 * scalar, returns a one-element array; if `expected` is an array (one-of
 * alternates), returns it unchanged. Lets every matcher treat single-value
 * and multi-value GT uniformly.
 */
function alternativesOf(expected: unknown): unknown[] {
  return Array.isArray(expected) ? expected : [expected];
}

/** A non-null, non-array object — i.e. a nested record of sub-fields. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * An array whose every element is a plain object — i.e. a table / list of
 * rows (`[{...}, {...}]`). This is distinct from a scalar one-of-alternates
 * array (`["", "0"]`), which `alternativesOf` handles.
 */
function isArrayOfRows(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}

/**
 * "Structured" ground truth that must be compared field-by-field / row-by-row
 * rather than via the scalar matchers (which stringify and would collapse
 * every object to `"[object Object]"`). A nested object or a non-empty array
 * of objects. Empty arrays and scalar arrays are NOT structured — they remain
 * one-of alternates.
 */
function isStructuredExpected(v: unknown): boolean {
  return isPlainObject(v) || isArrayOfRows(v);
}

/**
 * Matching rule configuration for a field
 */
export interface FieldMatchingRule {
  /**
   * Matching rule type.
   *
   * `presence` scores a field on presence rather than character equality —
   * i.e. did the engine produce a value where one was expected, and stay blank
   * where the form was blank. Use it for fields whose ground truth cannot be
   * reliably character-transcribed (e.g. handwritten signatures). The set of
   * such fields is document-specific and is supplied via `fieldRules` in the
   * benchmark's evaluatorConfig, never hardcoded in the evaluator.
   */
  rule: "exact" | "fuzzy" | "numeric" | "date" | "boolean" | "presence";

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
  confidence?: number | null;
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

    const confidenceMap: Record<string, number | null> =
      input.predictionConfidences ?? {};

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
      result.confidence = field in confidenceMap ? confidenceMap[field] : null;
      comparisonResults.push(result);
    }

    // Identify extra fields in prediction (for precision calculation)
    // Null-like prediction values are not meaningful extra fields
    const extraFields = Object.keys(prediction).filter(
      (field) => !(field in groundTruth) && !isNullLike(prediction[field]),
    );

    // Calculate metrics (extra fields count as false positives for precision)
    const metrics = this.calculateMetrics(
      comparisonResults,
      groundTruth,
      extraFields.length,
    );

    // Build diagnostics. A field is "missing" when the GT carries a real
    // (non-null-like) value and the prediction is null-like AND the match
    // failed — the `r.matched` guard handles one-of GT where an empty-string
    // alternate exists alongside a real value (predicted=null can match the
    // empty-string alternate, so it isn't missing).
    const missingFields = comparisonResults
      .filter(
        (r) => !r.matched && !isNullLike(r.expected) && isNullLike(r.predicted),
      )
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
    // Wildcard GT — any prediction matches when an alternate is `:garbled:`
    // (labellers' flag for "form value is unreadable, do not score").
    if (isWildcardExpected(expected)) {
      return { field, matched: true, predicted, expected };
    }

    // Get matching rule for this field
    const rule = config.fieldRules?.[field] ||
      config.defaultRule || {
        rule: "exact" as const,
      };

    // Handle null-like prediction. When `expected` is a one-of array, predicted
    // is considered matched if ANY alternate is itself null-like (e.g. GT is
    // `["", "value"]` and the engine returned null — the empty-string alternate
    // satisfies it). Otherwise the prediction is treated as missing.
    if (isNullLike(predicted)) {
      const anyExpectedNullLike =
        alternativesOf(expected).some(isNullLikeScalar);
      if (anyExpectedNullLike) {
        return { field, matched: true, predicted, expected };
      }
      return { field, matched: false, predicted: undefined, expected };
    }

    // Structured GT (nested object or array of rows): the scalar matchers
    // below stringify via String(), which collapses every object to
    // "[object Object]" (so any two objects falsely match) and can never
    // match a multi-row array. Compare structurally instead.
    if (isStructuredExpected(expected)) {
      const matched = this.structuralMatch(predicted, expected, config);
      return { field, matched, predicted, expected };
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
      case "presence":
        return this.presenceMatch(field, predicted, expected);
      default:
        return this.exactMatch(field, predicted, expected);
    }
  }

  /**
   * Presence-only comparison. Predicted is already known to be non-null-like
   * at this point (the null-like-prediction path returns earlier). Matched iff
   * at least one expected alternate is also non-null-like — i.e. a value was
   * expected. This avoids penalising the engine for imperfect transcription of
   * un-transcribable content (e.g. handwritten signatures) while still catching
   * a hallucinated value where the form was blank. Which fields use this rule
   * is document-specific and supplied via `fieldRules`, not hardcoded here.
   */
  private presenceMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
  ): FieldComparisonResult {
    const anyExpectedNonNullLike = alternativesOf(expected).some(
      (a) => !isNullLikeScalar(a),
    );
    return { field, matched: anyExpectedNonNullLike, predicted, expected };
  }

  /**
   * Compare structured GT (nested object or array of rows). Returns a single
   * matched boolean for the parent field.
   *
   *  - Nested object: every key in `expected` must match the corresponding
   *    key in `predicted` (extra predicted keys are ignored for this field).
   *  - Array of rows: matched only when lengths are equal AND every row
   *    matches positionally (row i of predicted vs row i of expected).
   *
   * Leaves recurse back through `deepFieldMatch`, so the per-field matching
   * rules (exact/fuzzy/numeric/date/boolean, null-like, wildcard) still apply.
   */
  private structuralMatch(
    predicted: unknown,
    expected: unknown,
    config: SchemaAwareConfig,
  ): boolean {
    if (isPlainObject(expected)) {
      if (!isPlainObject(predicted)) return false;
      return Object.keys(expected).every((key) =>
        this.deepFieldMatch(key, predicted[key], expected[key], config),
      );
    }
    if (isArrayOfRows(expected)) {
      if (!Array.isArray(predicted) || predicted.length !== expected.length) {
        return false;
      }
      return expected.every((row, i) =>
        this.deepFieldMatch(`row${i}`, predicted[i], row, config),
      );
    }
    return false;
  }

  /**
   * Match a single value that may itself be structured (recurse) or a scalar
   * (delegate to the rule-based `compareField`).
   */
  private deepFieldMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    config: SchemaAwareConfig,
  ): boolean {
    if (isStructuredExpected(expected)) {
      return this.structuralMatch(predicted, expected, config);
    }
    return this.compareField(field, predicted, expected, config).matched;
  }

  /**
   * Exact match comparison. When `expected` is an array of one-of alternates,
   * predicted matches if it stringifies to any alternate.
   */
  private exactMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
  ): FieldComparisonResult {
    const predictedStr = String(predicted);
    const matched = alternativesOf(expected).some(
      (alt) => String(alt) === predictedStr,
    );
    return { field, matched, predicted, expected };
  }

  /**
   * Fuzzy match comparison using Levenshtein similarity. When `expected` is
   * an array of one-of alternates, the result carries the BEST similarity
   * across the alternates and matches if any alternate clears the threshold.
   */
  private fuzzyMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    threshold: number,
  ): FieldComparisonResult {
    const predictedStr = String(predicted);
    let bestSimilarity = 0;
    for (const alt of alternativesOf(expected)) {
      const s = this.levenshteinSimilarity(predictedStr, String(alt));
      if (s > bestSimilarity) bestSimilarity = s;
    }
    return {
      field,
      matched: bestSimilarity >= threshold,
      predicted,
      expected,
      similarity: bestSimilarity,
    };
  }

  /**
   * Calculate Levenshtein similarity (0.0 to 1.0)
   */
  private levenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return 1.0 - distance / maxLength;
  }

  /**
   * Numeric match comparison. When `expected` is an array of one-of
   * alternates, the smallest absolute / relative error across the alternates
   * is kept, and `matched` is true if any alternate clears tolerances.
   */
  private numericMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    absoluteTolerance?: number,
    relativeTolerance?: number,
  ): FieldComparisonResult {
    const predictedNum = this.parseNumeric(String(predicted));

    let matched = false;
    let bestAbsError: number | undefined;
    let bestRelError: number | undefined;
    let allAltsNonNumeric = true;

    for (const alt of alternativesOf(expected)) {
      const expectedNum = this.parseNumeric(String(alt));
      if (
        predictedNum === null ||
        expectedNum === null ||
        Number.isNaN(predictedNum) ||
        Number.isNaN(expectedNum)
      ) {
        continue; // this alternate is non-numeric; defer to exact-match fallback
      }
      allAltsNonNumeric = false;
      const absErr = Math.abs(predictedNum - expectedNum);
      const relErr = expectedNum !== 0 ? absErr / Math.abs(expectedNum) : 0;
      let altMatched = predictedNum === expectedNum;
      if (absoluteTolerance !== undefined && absErr <= absoluteTolerance) {
        altMatched = true;
      }
      if (relativeTolerance !== undefined && relErr <= relativeTolerance) {
        altMatched = true;
      }
      if (altMatched) matched = true;
      if (bestAbsError === undefined || absErr < bestAbsError) {
        bestAbsError = absErr;
        bestRelError = relErr;
      }
    }

    if (allAltsNonNumeric) {
      // No alternate parsed as numeric — fall back to exact comparison so
      // mixed-type alternates (e.g. ["N/A", 100]) still work.
      return this.exactMatch(field, predicted, expected);
    }

    return {
      field,
      matched,
      predicted,
      expected,
      absoluteError: bestAbsError,
      relativeError: bestRelError,
    };
  }

  /**
   * Parse numeric value (handle commas and spaces so "6 191.12" and "6,191.12" parse)
   */
  private parseNumeric(value: string): number | null {
    // Reuse the shared "number" canonicalizer so currency symbols (£$€¥),
    // thousands separators, and whitespace are all stripped — a hand-rolled
    // comma/space strip missed currency, so "$6,191.12" failed to parse and
    // silently fell back to an exact-string mismatch.
    const cleaned = canonicalize(value, { canonicalize: "number" });
    if (cleaned === "") return null;
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Date match comparison. When `expected` is an array of one-of alternates,
   * predicted matches if any alternate parses to the same calendar date.
   */
  private dateMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
    _formats?: string[],
  ): FieldComparisonResult {
    const pCal = parseToCalendarParts(String(predicted));
    if (pCal === null) {
      // Predicted isn't parseable as a date — fall back to exact-string match
      // (which still honours one-of array semantics).
      return this.exactMatch(field, predicted, expected);
    }
    let matched = false;
    let anyAltParsed = false;
    for (const alt of alternativesOf(expected)) {
      const eCal = parseToCalendarParts(String(alt));
      if (eCal === null) continue;
      anyAltParsed = true;
      if (pCal.y === eCal.y && pCal.m === eCal.m && pCal.day === eCal.day) {
        matched = true;
        break;
      }
    }
    if (!anyAltParsed) {
      return this.exactMatch(field, predicted, expected);
    }
    return { field, matched, predicted, expected };
  }

  /**
   * Boolean match comparison. When `expected` is an array, predicted matches
   * if it equals any alternate after boolean coercion.
   */
  private booleanMatch(
    field: string,
    predicted: unknown,
    expected: unknown,
  ): FieldComparisonResult {
    const predictedBool = this.parseBoolean(predicted);
    const matched = alternativesOf(expected).some(
      (alt) => this.parseBoolean(alt) === predictedBool,
    );
    return { field, matched, predicted, expected };
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
   * Calculate precision, recall, and F1 metrics.
   *
   * Per the standard OCR / information-extraction definitions:
   *
   *   - TP: prediction matches GT (correct).
   *   - FN: the engine MISSED a GT value. This happens when (a) the engine
   *     returned null where GT had a real value (deletion), or (b) the
   *     engine returned a wrong non-null value where GT had a real value
   *     (substitution — the correct answer was missed). Per the literature
   *     ("characters that are in the GT but not present in OCR output"), a
   *     substitution counts toward FN because the correct value did not
   *     appear in the output.
   *   - FP: the engine PRODUCED a value that wasn't correct. This happens
   *     when (a) the engine emitted a non-null value where GT was null
   *     (insertion / hallucination), (b) the engine emitted a wrong
   *     non-null value where GT had a real value (substitution — wrong
   *     value produced), or (c) the engine emitted a field outside the GT
   *     schema with a non-null value (extra-key hallucination).
   *
   * So a substitution increments BOTH FP and FN (it's a precision miss AND
   * a recall miss). Pure deletions are FN-only; pure insertions are FP-only.
   * This is the formulation that lets F1 actually do its job: punish
   * lopsided performance. Under the prior implementation FP was nearly
   * always zero because substitutions weren't counted, which pinned
   * precision at ≈1.000 and made F1 a monotone function of recall.
   *
   * Note: `r.predicted` is set to `undefined` by `compareField` when the
   * raw prediction was null-like and the GT was a real value (the
   * deletion case). Using `isNullLike(r.predicted)` here therefore picks
   * up both real-null and undefined.
   */
  private calculateMetrics(
    results: FieldComparisonResult[],
    groundTruth: Record<string, unknown>,
    extraFieldCount: number,
  ): Record<string, number> {
    const groundTruthFields = Object.keys(groundTruth);
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const r of results) {
      if (r.matched) {
        truePositives++;
        continue;
      }
      const predictedIsNullLike = isNullLike(r.predicted);
      const expectedIsNullLike = isNullLike(r.expected);

      if (predictedIsNullLike) {
        // Deletion: GT had a real value, engine returned null. The correct
        // value did not appear in the output → FN only (precision is not
        // hit because the engine didn't produce a wrong answer; it didn't
        // produce an answer at all).
        falseNegatives++;
      } else if (expectedIsNullLike) {
        // Insertion: GT was null, engine produced something. The engine
        // hallucinated → FP only (recall is not hit because there was no
        // GT value to miss).
        falsePositives++;
      } else {
        // Substitution: both non-null, values differ. The correct value
        // didn't appear in the output (FN) AND the engine produced a wrong
        // value (FP). Both counted.
        falsePositives++;
        falseNegatives++;
      }
    }

    // Extra-key hallucinations: fields the engine emitted that aren't in
    // the GT schema at all (and are non-null). These are FP-only.
    falsePositives += extraFieldCount;

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
