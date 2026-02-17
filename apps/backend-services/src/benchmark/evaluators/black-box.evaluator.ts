/**
 * Black-Box Evaluator
 *
 * Stub implementation for black-box evaluation.
 * Full implementation pending US-XXX.
 */

import { Injectable } from "@nestjs/common";
import { BenchmarkEvaluator, EvaluationInput, EvaluationResult } from "../evaluator.interface";

@Injectable()
export class BlackBoxEvaluator implements BenchmarkEvaluator {
  readonly type = "black-box";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    // Stub implementation - returns mock metrics
    return {
      sampleId: input.sampleId,
      metrics: {
        overall_accuracy: 0.91,
      },
      diagnostics: {},
      pass: true,
    };
  }
}
