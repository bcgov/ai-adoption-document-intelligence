/**
 * Temporal Worker Graph Schema Validator
 *
 * Thin wrapper around the shared @ai-di/graph-workflow validateGraphConfig,
 * supplying the temporal worker's own activity registry.
 *
 * Must be deterministic: no I/O, no Date.now().
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.2 step 1
 */

import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import { validateGraphConfig } from "@ai-di/graph-workflow";
import { validateActivityParameters } from "./activity-parameter-schema-registry";
import { isRegisteredActivityType } from "./activity-types";

/**
 * Validate a graph config for execution in the Temporal worker.
 * Uses the runtime activity registry for stronger validation.
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
