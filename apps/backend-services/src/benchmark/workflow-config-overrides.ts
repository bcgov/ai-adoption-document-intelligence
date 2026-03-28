import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";

export function extractExposedParamDefaults(
  config: GraphWorkflowConfig,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (!config.nodeGroups) return defaults;
  for (const group of Object.values(config.nodeGroups)) {
    if (!group.exposedParams) continue;
    for (const param of group.exposedParams) {
      defaults[param.path] = param.default;
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
        exposedByPath.set(param.path, { type: param.type, options: param.options });
      }
    }
  }
  for (const [path, value] of Object.entries(overrides)) {
    const param = exposedByPath.get(path);
    if (!param) {
      errors.push(`Override path "${path}" is not an exposed configurable parameter`);
      continue;
    }
    if (param.type === "select" && param.options) {
      if (!param.options.includes(String(value))) {
        errors.push(`Value "${value}" for "${path}" is not in allowed options: ${param.options.join(", ")}`);
      }
    }
  }
  return errors;
}

export function applyWorkflowConfigOverrides(
  config: GraphWorkflowConfig,
  overrides: Record<string, unknown>,
): GraphWorkflowConfig {
  const result = JSON.parse(JSON.stringify(config)) as GraphWorkflowConfig;
  for (const [path, value] of Object.entries(overrides)) {
    setNestedValue(result as unknown as Record<string, unknown>, path, value);
  }
  return result;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
