/**
 * Activity Parameter Schema Registry
 *
 * Provides per-activity parameter validation schemas for execution-time
 * validation. Each registered schema describes the required and optional
 * parameters for a user-authored activity node.
 *
 * See docs-md/workflows/DAG_WORKFLOW_ENGINE.md
 */
import type { GraphValidationError } from "@ai-di/graph-workflow";

const VALID_TRANSFORM_FORMATS = new Set(["json", "xml", "csv"]);

type ParameterValidator = (
  activityType: string,
  nodeId: string,
  parameters: Record<string, unknown> | undefined,
  errors: GraphValidationError[],
) => void;

const PARAMETER_SCHEMA_REGISTRY = new Map<string, ParameterValidator>();

function registerParameterSchema(
  activityType: string,
  validator: ParameterValidator,
): void {
  PARAMETER_SCHEMA_REGISTRY.set(activityType, validator);
}

// ---------------------------------------------------------------------------
// data.transform schema
// ---------------------------------------------------------------------------

registerParameterSchema(
  "data.transform",
  (_activityType, nodeId, parameters, errors) => {
    const params = parameters ?? {};

    const inputFormat = params.inputFormat;
    if (!inputFormat || !VALID_TRANSFORM_FORMATS.has(inputFormat as string)) {
      errors.push({
        path: `nodes.${nodeId}.parameters.inputFormat`,
        message: `Activity "${nodeId}" (data.transform): inputFormat must be one of: json, xml, csv`,
        severity: "error",
      });
    }

    const outputFormat = params.outputFormat;
    if (!outputFormat || !VALID_TRANSFORM_FORMATS.has(outputFormat as string)) {
      errors.push({
        path: `nodes.${nodeId}.parameters.outputFormat`,
        message: `Activity "${nodeId}" (data.transform): outputFormat must be one of: json, xml, csv`,
        severity: "error",
      });
    }

    const fieldMapping = params.fieldMapping;
    if (typeof fieldMapping !== "string" || !fieldMapping.trim()) {
      errors.push({
        path: `nodes.${nodeId}.parameters.fieldMapping`,
        message: `Activity "${nodeId}" (data.transform): fieldMapping is required and must be a non-empty string`,
        severity: "error",
      });
    } else {
      try {
        JSON.parse(fieldMapping);
      } catch {
        errors.push({
          path: `nodes.${nodeId}.parameters.fieldMapping`,
          message: `Activity "${nodeId}" (data.transform): fieldMapping must be valid JSON`,
          severity: "error",
        });
      }
    }

    const xmlEnvelope = params.xmlEnvelope;
    if (xmlEnvelope !== undefined) {
      if (typeof xmlEnvelope !== "string") {
        errors.push({
          path: `nodes.${nodeId}.parameters.xmlEnvelope`,
          message: `Activity "${nodeId}" (data.transform): xmlEnvelope must be a string`,
          severity: "error",
        });
      } else if (outputFormat === "xml") {
        const matches = (xmlEnvelope.match(/\{\{payload\}\}/g) ?? []).length;
        if (matches !== 1) {
          errors.push({
            path: `nodes.${nodeId}.parameters.xmlEnvelope`,
            message: `Activity "${nodeId}" (data.transform): xmlEnvelope must contain exactly one {{payload}} placeholder`,
            severity: "error",
          });
        }
      }
    }
  },
);

// ---------------------------------------------------------------------------
// hitl.applyReviewCriteria schema
// ---------------------------------------------------------------------------

const VALID_REVIEW_CRITERIA_ACTIONS = new Set(["review", "skip"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

registerParameterSchema(
  "hitl.applyReviewCriteria",
  (_activityType, nodeId, parameters, errors) => {
    const params = parameters ?? {};
    const rules = params.rules;

    if (!Array.isArray(rules) || rules.length === 0) {
      errors.push({
        path: `nodes.${nodeId}.parameters.rules`,
        message: `Activity "${nodeId}" (hitl.applyReviewCriteria): rules is required and must be a non-empty array`,
        severity: "error",
      });
      return;
    }

    rules.forEach((rule: unknown, index: number) => {
      const rulePath = `nodes.${nodeId}.parameters.rules[${index}]`;
      if (!isPlainObject(rule)) {
        errors.push({
          path: rulePath,
          message: `Activity "${nodeId}" (hitl.applyReviewCriteria): each rule must be an object`,
          severity: "error",
        });
        return;
      }

      if (typeof rule.name !== "string" || !rule.name.trim()) {
        errors.push({
          path: `${rulePath}.name`,
          message: `Activity "${nodeId}" (hitl.applyReviewCriteria): rule name is required and must be a non-empty string`,
          severity: "error",
        });
      }

      if (!isPlainObject(rule.select)) {
        errors.push({
          path: `${rulePath}.select`,
          message: `Activity "${nodeId}" (hitl.applyReviewCriteria): rule select is required and must be an object`,
          severity: "error",
        });
      }

      if (
        typeof rule.action !== "string" ||
        !VALID_REVIEW_CRITERIA_ACTIONS.has(rule.action)
      ) {
        errors.push({
          path: `${rulePath}.action`,
          message: `Activity "${nodeId}" (hitl.applyReviewCriteria): rule action must be one of: review, skip`,
          severity: "error",
        });
      }

      if (typeof rule.reason !== "string" || !rule.reason.trim()) {
        errors.push({
          path: `${rulePath}.reason`,
          message: `Activity "${nodeId}" (hitl.applyReviewCriteria): rule reason is required and must be a non-empty string`,
          severity: "error",
        });
      }
    });

    const defaultAction = params.defaultAction;
    if (
      defaultAction !== undefined &&
      (typeof defaultAction !== "string" ||
        !VALID_REVIEW_CRITERIA_ACTIONS.has(defaultAction))
    ) {
      errors.push({
        path: `nodes.${nodeId}.parameters.defaultAction`,
        message: `Activity "${nodeId}" (hitl.applyReviewCriteria): defaultAction must be one of: review, skip`,
        severity: "error",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate parameters for an activity node against its registered schema.
 * If no schema is registered for the activity type, no validation is performed.
 *
 * @param activityType - The activity type string (e.g. "data.transform")
 * @param nodeId - The graph node ID for error path construction
 * @param parameters - The node's parameters map (may be undefined)
 * @param errors - Array to push validation errors into
 */
export function validateActivityParameters(
  activityType: string,
  nodeId: string,
  parameters: Record<string, unknown> | undefined,
  errors: GraphValidationError[],
): void {
  const validator = PARAMETER_SCHEMA_REGISTRY.get(activityType);
  if (validator) {
    validator(activityType, nodeId, parameters, errors);
  }
}
