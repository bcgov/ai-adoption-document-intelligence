/**
 * Evaluator Registry Service
 *
 * Maintains a registry of evaluator implementations and provides lookup by type.
 * Mirrors the Activity Registry pattern from apps/temporal/src/activity-registry.ts.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 13.2
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { BenchmarkEvaluator } from "./evaluator.interface";

@Injectable()
export class EvaluatorRegistryService {
  private readonly logger = new Logger(EvaluatorRegistryService.name);
  private readonly evaluators = new Map<string, BenchmarkEvaluator>();

  /**
   * Register an evaluator by type
   */
  register(evaluator: BenchmarkEvaluator): void {
    if (!evaluator.type) {
      throw new Error("Evaluator must have a type string");
    }

    if (this.evaluators.has(evaluator.type)) {
      this.logger.warn(
        `Evaluator type "${evaluator.type}" is already registered. Overwriting.`,
      );
    }

    this.evaluators.set(evaluator.type, evaluator);
    this.logger.debug(`Registered evaluator: ${evaluator.type}`);
  }

  /**
   * Get an evaluator by type
   */
  getEvaluator(type: string): BenchmarkEvaluator {
    const evaluator = this.evaluators.get(type);

    if (!evaluator) {
      throw new NotFoundException(
        `Evaluator type "${type}" is not registered. Available types: ${this.getAvailableTypes().join(", ")}`,
      );
    }

    return evaluator;
  }

  /**
   * Get all available evaluator types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.evaluators.keys()).sort();
  }

  /**
   * Check if an evaluator type is registered
   */
  hasEvaluator(type: string): boolean {
    return this.evaluators.has(type);
  }

  /**
   * Get the count of registered evaluators
   */
  getCount(): number {
    return this.evaluators.size;
  }
}
