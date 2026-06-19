import { applyWorkflowConfigOverrides } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";

export { applyWorkflowConfigOverrides };

/**
 * Extract a map of { path: currentValue } for all exposed params
 * by resolving each param's path against the actual config.
 * This ensures the defaults shown to users match the real runtime values,
 * rather than relying on a potentially-stale `default` field.
 */
export function extractExposedParamDefaults(
  config: GraphWorkflowConfig,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (!config.nodeGroups) return defaults;
  for (const group of Object.values(config.nodeGroups)) {
    if (!group.exposedParams) continue;
    for (const param of group.exposedParams) {
      defaults[param.path] = getNestedValue(
        config as unknown as Record<string, unknown>,
        param.path,
      );
    }
  }
  return defaults;
}

export function validateWorkflowConfigOverrides(
  config: GraphWorkflowConfig,
  overrides: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const exposedByPath = new Map<string, { type: string; options?: string[] }>();
  if (config.nodeGroups) {
    for (const group of Object.values(config.nodeGroups)) {
      if (!group.exposedParams) continue;
      for (const param of group.exposedParams) {
        exposedByPath.set(param.path, {
          type: param.type,
          options: param.options,
        });
      }
    }
  }
  for (const [path, value] of Object.entries(overrides)) {
    const param = exposedByPath.get(path);
    if (!param) {
      errors.push(
        `Override path "${path}" is not an exposed configurable parameter`,
      );
      continue;
    }
    if (param.type === "select" && param.options) {
      if (!param.options.includes(String(value))) {
        errors.push(
          `Value "${value}" for "${path}" is not in allowed options: ${param.options.join(", ")}`,
        );
      }
    }
  }
  return errors;
}

/**
 * Get a value at a dot-separated path in an object.
 * Returns undefined if any segment along the path is missing.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
