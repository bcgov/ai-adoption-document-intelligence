/**
 * Evaluator Registry
 *
 * Maintains a registry of evaluator implementations and provides lookup by type.
 * Mirrors the backend EvaluatorRegistryService pattern but as a pure function registry.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 13.2
 */

import { BenchmarkEvaluator } from "./benchmark-types";
import { BlackBoxEvaluator } from "./evaluators/black-box-evaluator";
import { OcrCorrectionEvaluator } from "./evaluators/ocr-correction-evaluator";
import { SchemaAwareEvaluator } from "./evaluators/schema-aware-evaluator";

/**
 * Evaluator registry map
 */
const EVALUATOR_REGISTRY_MAP = new Map<string, BenchmarkEvaluator>();

/**
 * Register an evaluator by type
 */
function registerEvaluator(evaluator: BenchmarkEvaluator): void {
  if (!evaluator.type) {
    throw new Error("Evaluator must have a type string");
  }

  EVALUATOR_REGISTRY_MAP.set(evaluator.type, evaluator);
}

/**
 * Get an evaluator by type
 */
export function getEvaluator(type: string): BenchmarkEvaluator {
  const evaluator = EVALUATOR_REGISTRY_MAP.get(type);

  if (!evaluator) {
    const availableTypes = Array.from(EVALUATOR_REGISTRY_MAP.keys()).sort();
    throw new Error(
      `Evaluator type "${type}" is not registered. Available types: ${availableTypes.join(", ")}`,
    );
  }

  return evaluator;
}

/**
 * Get all available evaluator types
 */
export function getAvailableEvaluatorTypes(): string[] {
  return Array.from(EVALUATOR_REGISTRY_MAP.keys()).sort();
}

/**
 * Check if an evaluator type is registered
 */
export function hasEvaluator(type: string): boolean {
  return EVALUATOR_REGISTRY_MAP.has(type);
}

/**
 * Get the count of registered evaluators
 */
export function getEvaluatorCount(): number {
  return EVALUATOR_REGISTRY_MAP.size;
}

// Register built-in evaluators
registerEvaluator(new SchemaAwareEvaluator());
registerEvaluator(new BlackBoxEvaluator());
registerEvaluator(new OcrCorrectionEvaluator());
