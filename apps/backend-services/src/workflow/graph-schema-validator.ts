/**
 * Backend Graph Schema Validator
 *
 * Thin wrapper around the shared @ai-di/graph-workflow validateGraphConfig,
 * supplying the backend's own activity registry plus the shared catalog
 * adapter for per-activity parameter validation.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 9.2
 */

import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import {
  createCatalogParameterValidator,
  validateGraphConfig as validateGraphCfg,
} from "@ai-di/graph-workflow";
import { isRegisteredActivityType } from "./activity-registry";

const validateActivityParameters = createCatalogParameterValidator();

/**
 * Validate a graph workflow config at save time.
 * Uses the backend activity registry for activity-type registration checks
 * and the @ai-di/graph-workflow catalog for per-activity parameter
 * validation.
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
