/**
 * Field Accuracy Evaluator
 *
 * Stub implementation for field-level accuracy evaluation.
 * Full implementation pending US-XXX.
 */

import { Injectable } from "@nestjs/common";
import { BenchmarkEvaluator, EvaluationInput, EvaluationResult } from "../evaluator.interface";

@Injectable()
export class FieldAccuracyEvaluator implements BenchmarkEvaluator {
  readonly type = "field-accuracy";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    // Stub implementation - returns mock metrics
    return {
      sampleId: input.sampleId,
      metrics: {
        field_accuracy: 0.95,
        character_accuracy: 0.98,
        word_accuracy: 0.96,
      },
      diagnostics: {},
      pass: true,
    };
  }
}
