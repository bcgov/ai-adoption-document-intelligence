/**
 * Schema-Aware Evaluator
 *
 * Stub implementation for schema-aware evaluation.
 * Full implementation pending US-XXX.
 */

import { Injectable } from "@nestjs/common";
import { BenchmarkEvaluator, EvaluationInput, EvaluationResult } from "../evaluator.interface";

@Injectable()
export class SchemaAwareEvaluator implements BenchmarkEvaluator {
  readonly type = "schema-aware";

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    // Stub implementation - returns mock metrics
    return {
      sampleId: input.sampleId,
      metrics: {
        field_accuracy: 0.93,
        schema_coverage: 0.97,
      },
      diagnostics: {},
      pass: true,
    };
  }
}
