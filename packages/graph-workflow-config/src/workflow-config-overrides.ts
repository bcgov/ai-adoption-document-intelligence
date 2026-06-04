import type { GraphWorkflowConfig } from "./types";

export function applyWorkflowConfigOverrides(
  config: GraphWorkflowConfig,
  overrides: Record<string, unknown>,
): GraphWorkflowConfig {
  const result = deepCloneToNullPrototype(
    config,
  ) as GraphWorkflowConfig;
  for (const [path, value] of Object.entries(overrides)) {
    setNestedValue(result as unknown as Record<string, unknown>, path, value);
  }
  return result;
}

const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Dot-path segments must be plain identifiers (no prototype keys). */
const SAFE_PATH_SEGMENT = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isSafeOverridePathSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    !UNSAFE_PATH_SEGMENTS.has(segment) &&
    SAFE_PATH_SEGMENT.test(segment)
  );
}

function assertSafePathSegments(parts: string[]): void {
  for (const part of parts) {
    if (!isSafeOverridePathSegment(part)) {
      throw new Error(`Unsafe override path segment: ${part}`);
    }
  }
}

function deepCloneToNullPrototype(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepCloneToNullPrototype);
  }
  const clone = Object.create(null) as Record<string, unknown>;
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  )) {
    clone[key] = deepCloneToNullPrototype(child);
  }
  return clone;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  assertSafePathSegments(parts);

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = current[part];
    if (
      existing === undefined ||
      existing === null ||
      typeof existing !== "object"
    ) {
      current[part] = Object.create(null);
    }
    current = current[part] as Record<string, unknown>;
  }

  const leaf = parts[parts.length - 1];
  current[leaf] = value;
}
