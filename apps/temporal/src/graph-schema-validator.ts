/**
 * Temporal Worker Graph Schema Validator
 *
 * Thin wrapper around the shared @ai-di/graph-workflow validateGraphConfig,
 * supplying the temporal worker's own activity registry plus the shared
 * catalog adapter for per-activity parameter validation.
 *
 * Must be deterministic: no I/O, no Date.now(). The catalog adapter uses
 * Zod's pure `safeParse`, so this property is preserved.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.2 step 1
 */

import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import {
  createCatalogParameterValidator,
  validateGraphConfig,
} from "@ai-di/graph-workflow";
import { isRegisteredActivityType } from "./activity-types";

const validateActivityParameters = createCatalogParameterValidator();

/**
 * Validate a graph config for execution in the Temporal worker.
 * Uses the runtime activity registry for stronger registration checks
 * and the shared catalog for parameter validation.
 *
 * @param config - The graph workflow configuration to validate.
 * @returns Validation result with errors.
 */
export function validateGraphConfigForExecution(config: GraphWorkflowConfig): {
  valid: boolean;
  errors: GraphValidationError[];
} {
  return validateGraphConfig(config, {
    isRegisteredActivityType,
    validateActivityParameters,
  });
}
