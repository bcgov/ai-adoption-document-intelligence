import type { GraphNode } from "../types";

/**
 * Reads `metadata.lockedInputPorts` off a graph node as a typed `string[]`.
 * Returns `[]` when the field is missing or not an array.
 *
 * The `lockedInputPorts` / `lockedOutputPorts` metadata fields are the
 * auto-wire resolver's explicit lock signal (see AUTO_WIRE_DESIGN.md §2.3).
 * `GraphNode.metadata` is a free-form `Record<string, unknown>` bag, so the
 * resolver narrows the shape here in one place rather than re-casting at
 * every consumer.
 */
export function getLockedInputPorts(node: GraphNode): string[] {
  return readStringArrayField(node.metadata, "lockedInputPorts");
}

/** Sibling of {@link getLockedInputPorts} for output bindings. */
export function getLockedOutputPorts(node: GraphNode): string[] {
  return readStringArrayField(node.metadata, "lockedOutputPorts");
}

function readStringArrayField(
  metadata: Record<string, unknown> | undefined,
  field: string,
): string[] {
  if (!metadata) return [];
  const value = metadata[field];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
