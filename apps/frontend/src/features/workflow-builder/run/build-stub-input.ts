import type {
  RunSpecInputSchema,
  RunSpecInputSchemaProperty,
} from "../../../data/hooks/useWorkflows";

/**
 * Build a stub JSON body that satisfies the workflow's input schema.
 * Used to prefill the "paste JSON and run" textarea in
 * `RunWorkflowDrawer`. Uses `default` when present, otherwise a
 * type-appropriate empty stub (`""` for string, `0` for number, etc.).
 */
export function buildStubInput(
  schema: RunSpecInputSchema,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    if (property.default !== undefined) {
      body[key] = property.default;
    } else {
      body[key] = stubForType(property);
    }
  }
  return body;
}

function stubForType(property: RunSpecInputSchemaProperty): unknown {
  switch (property.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
  }
}
