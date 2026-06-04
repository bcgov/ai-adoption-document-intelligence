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

const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafePathSegments(parts: string[]): void {
  for (const part of parts) {
    if (UNSAFE_PATH_SEGMENTS.has(part)) {
      throw new Error(`Unsafe override path segment: ${part}`);
    }
  }
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  assertSafePathSegments(parts);

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = Object.prototype.hasOwnProperty.call(current, part)
      ? current[part]
      : undefined;
    if (
      existing === undefined ||
      existing === null ||
      typeof existing !== "object"
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  current[leaf] = value;
}
