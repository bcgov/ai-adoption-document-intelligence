import {
  getSourceCatalogEntry as defaultGetSourceCatalogEntry,
  type SourceCatalogEntry,
} from "@ai-di/graph-workflow";
import type { Request } from "express";
import {
  deriveInputSchema,
  type InputJsonSchema,
  type InputJsonSchemaProperty,
} from "./derive-input-schema";
import type { GraphWorkflowConfig, SourceNode } from "./graph-workflow-types";

export interface RunSpec {
  triggerUrl: string;
  inputSchema: InputJsonSchema;
  authNotes: string;
  sampleCurl: string;
}

/**
 * Phase 8 — upload-source metadata surfaced by `/run-spec` when a
 * `source.upload` node exists in the workflow. Matches
 * DOCUMENT_SOURCES_DESIGN.md §4.3.
 */
export interface UploadSpec {
  sourceNodeId: string;
  uploadUrl: string;
  allowedMimeTypes: string[];
  maxFileSizeMB: number;
  ctxKey: string;
}

/**
 * Optional injection seam used by tests until US-116 lands the real
 * `source.upload` catalog entry. Mirrors the same pattern used by
 * `DeriveInputSchemaOptions.getSourceCatalogEntry` (US-111) and
 * `ValidateGraphConfigOptions.getSourceCatalogEntry` (validator).
 */
export interface BuildUploadSpecOptions {
  getSourceCatalogEntry?: (
    sourceType: string,
  ) => SourceCatalogEntry | undefined;
}

const DEFAULT_LOCAL_BASE = "http://localhost:3002";

const AUTH_NOTES =
  "Include your API key in the `x-api-key` request header. " +
  "Each key is scoped to a single group; only keys belonging to this " +
  "workflow's group may trigger runs.";

/**
 * Resolve the absolute base URL the request was made on. Derived from
 * the request's `X-Forwarded-Proto` + `Host` headers (set by every
 * reverse proxy we run behind) with a local-dev fallback.
 *
 * Shared by `buildTriggerUrl` and the controller's `buildUploadSpec`
 * wiring so per-resource paths can be appended without duplicating the
 * proxy-header logic.
 */
export function buildBaseUrl(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const proto = protoHeader ?? req.protocol;
  const host = req.headers.host;
  return host ? `${proto}://${host}` : DEFAULT_LOCAL_BASE;
}

/**
 * Resolve the absolute trigger URL the request was made on. The
 * endpoint uses this to emit a copyable absolute URL.
 */
export function buildTriggerUrl(req: Request, workflowId: string): string {
  return `${buildBaseUrl(req)}/api/workflows/${workflowId}/runs`;
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

/**
 * Shape of the parsed `source.upload` parameters after the catalog
 * entry's `parametersSchema.parse(...)` fills in defaults. Mirrors the
 * fields documented in DOCUMENT_SOURCES_DESIGN.md §3.2.
 */
interface SourceUploadParameters {
  allowedMimeTypes?: string[];
  maxFileSizeMB?: number;
  ctxKey?: string;
}

const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/*",
];
const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_CTX_KEY = "documentUrl";

/**
 * Locate the single `source.upload` node in the config. Mirrors
 * `derive-input-schema.ts`'s inline `findSourceApiNode` pattern; kept
 * tiny and inlined into a single call site below.
 */
function findSourceUploadNode(
  config: GraphWorkflowConfig,
): SourceNode | undefined {
  for (const node of Object.values(config.nodes)) {
    if (node.type === "source" && node.sourceType === "source.upload") {
      return node;
    }
  }
  return undefined;
}

/**
 * Build the optional `uploadSpec` portion of `GET /run-spec` when a
 * `source.upload` node exists in the config. Returns `undefined` when
 * the workflow has no source.upload — the controller then omits the
 * field from the response (Scenario 2).
 *
 * Defaults documented in DOCUMENT_SOURCES_DESIGN.md §3.2 are sourced
 * from the catalog entry's `parametersSchema` (US-116). The `??`
 * fallbacks are belt-and-braces in case the schema's defaults are
 * tweaked in future revisions.
 */
export function buildUploadSpec(
  config: GraphWorkflowConfig,
  workflowId: string,
  baseUrl: string,
  options: BuildUploadSpecOptions = {},
): UploadSpec | undefined {
  const sourceNode = findSourceUploadNode(config);
  if (!sourceNode) return undefined;

  const lookup = options.getSourceCatalogEntry ?? defaultGetSourceCatalogEntry;
  const entry = lookup(sourceNode.sourceType);
  if (!entry) return undefined; // upstream validator (US-109) catches this

  const resolvedParams = entry.parametersSchema.parse(
    sourceNode.parameters ?? {},
  ) as SourceUploadParameters;

  return {
    sourceNodeId: sourceNode.id,
    uploadUrl: `${baseUrl}/api/workflows/${workflowId}/sources/${sourceNode.id}/upload`,
    allowedMimeTypes: resolvedParams.allowedMimeTypes ?? [
      ...DEFAULT_ALLOWED_MIME_TYPES,
    ],
    maxFileSizeMB: resolvedParams.maxFileSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB,
    ctxKey: resolvedParams.ctxKey ?? DEFAULT_CTX_KEY,
  };
}
