/**
 * Evaluator Registry Service
 *
 * Maintains a registry of known evaluator types for validation purposes.
 * Actual evaluator implementations live in apps/temporal/src/evaluators/.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 13.2
 */

import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class EvaluatorRegistryService {
  private readonly logger = new Logger(EvaluatorRegistryService.name);
  private readonly evaluatorTypes = new Set<string>();

  /**
   * Register a known evaluator type
   */
  registerType(type: string): void {
    if (!type) {
      throw new Error("Evaluator type must be a non-empty string");
    }

    if (this.evaluatorTypes.has(type)) {
      this.logger.warn(
        `Evaluator type "${type}" is already registered. Skipping.`,
      );
      return;
    }

    this.evaluatorTypes.add(type);
    this.logger.debug(`Registered evaluator type: ${type}`);
  }

  /**
   * Get all available evaluator types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.evaluatorTypes).sort();
  }

  /**
   * Check if an evaluator type is registered
   */
  hasEvaluator(type: string): boolean {
    return this.evaluatorTypes.has(type);
  }

  /**
   * Get the count of registered evaluator types
   */
  getCount(): number {
    return this.evaluatorTypes.size;
  }
}
