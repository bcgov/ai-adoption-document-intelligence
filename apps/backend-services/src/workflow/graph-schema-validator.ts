/**
 * Backend Graph Schema Validator
 *
 * Thin wrapper around the shared @ai-di/graph-workflow validateGraphConfig,
 * supplying the backend's own activity registry.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 9.2
 */

import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import { validateGraphConfig as validateGraphCfg } from "@ai-di/graph-workflow";
import { validateActivityParameters } from "./activity-parameter-schema-registry";
import { isRegisteredActivityType } from "./activity-registry";

/**
 * Validate a graph workflow config at save time.
 * Uses the backend activity registry for validation.
 *
 * @param config - The graph workflow configuration to validate.
 * @returns Validation result with errors.
 */
export function validateGraphConfig(config: GraphWorkflowConfig): {
  valid: boolean;
  errors: GraphValidationError[];
} {
  return validateGraphCfg(config, {
    isRegisteredActivityType,
    validateActivityParameters,
  });
}
