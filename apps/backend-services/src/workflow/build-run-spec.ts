import type { Request } from "express";
import {
  deriveInputSchema,
  type InputJsonSchema,
  type InputJsonSchemaProperty,
} from "./derive-input-schema";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

export interface RunSpec {
  triggerUrl: string;
  inputSchema: InputJsonSchema;
  authNotes: string;
  sampleCurl: string;
}

const DEFAULT_LOCAL_BASE = "http://localhost:3002";

const AUTH_NOTES =
  "Include your API key in the `x-api-key` request header. " +
  "Each key is scoped to a single group; only keys belonging to this " +
  "workflow's group may trigger runs.";

/**
 * Resolve the absolute base URL the request was made on. Derived from
 * the request's `X-Forwarded-Proto` + `Host` headers (set by every
 * reverse proxy we run behind) with a local-dev fallback. The endpoint
 * uses this to emit a copyable absolute trigger URL.
 */
export function buildTriggerUrl(req: Request, workflowId: string): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const proto = protoHeader ?? req.protocol;
  const host = req.headers.host;
  const base = host ? `${proto}://${host}` : DEFAULT_LOCAL_BASE;
  return `${base}/api/workflows/${workflowId}/runs`;
}

/**
 * Pure helper: pack a `GraphWorkflowConfig` + trigger URL into a
 * complete `RunSpec`. Extracted so the controller method stays a thin
 * adapter and the assembly logic is unit-testable in isolation.
 */
export function buildRunSpec(
  config: GraphWorkflowConfig,
  triggerUrl: string,
): RunSpec {
  const inputSchema = deriveInputSchema(config);
  const sampleCurl = buildSampleCurl(triggerUrl, inputSchema);
  return {
    triggerUrl,
    inputSchema,
    authNotes: AUTH_NOTES,
    sampleCurl,
  };
}

function buildSampleCurl(triggerUrl: string, schema: InputJsonSchema): string {
  const stubBody = buildStubBody(schema);
  const bodyJson = JSON.stringify(stubBody);
  return (
    `curl -X POST ${triggerUrl} \\\n` +
    `  -H 'x-api-key: YOUR_API_KEY' \\\n` +
    `  -H 'content-type: application/json' \\\n` +
    `  -d '${bodyJson}'`
  );
}

/**
 * Build a stub request body that satisfies the schema's `required`
 * fields. Used both by the sample curl and (in US-072) by the
 * frontend's "paste-and-run" prefill — but the frontend builds its own
 * stub from the returned schema to avoid round-tripping a string.
 */
function buildStubBody(schema: InputJsonSchema): Record<string, unknown> {
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

function stubForType(property: InputJsonSchemaProperty): unknown {
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
