import type { GraphWorkflowConfig } from "./types";

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

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== "object"
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
