import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";

/**
 * One property in the derived input JSON Schema. Mirrors the narrow
 * shape returned by `deriveInputSchema()` — string / number / boolean
 * / object / array with optional title / description / default.
 */
export class RunSpecInputSchemaPropertyDto {
  @ApiProperty({
    enum: ["string", "number", "boolean", "object", "array"],
    description: "JSON Schema primitive type for this input field.",
    example: "string",
  })
  type!: "string" | "number" | "boolean" | "object" | "array";

  @ApiProperty({
    required: false,
    description:
      "Human-readable title (label) for the input — sourced from " +
      "LibraryPortDescriptor.label for library workflows.",
    example: "Customer ID",
  })
  title?: string;

  @ApiProperty({
    required: false,
    description:
      "Free-text description of the input — sourced from " +
      "CtxDeclaration.description for regular workflows.",
    example: "Customer to process",
  })
  description?: string;

  @ApiProperty({
    required: false,
    description:
      "Default value applied when the caller omits this field — " +
      "sourced from CtxDeclaration.defaultValue. Inputs with a " +
      "default are optional; inputs without one are required.",
  })
  default?: unknown;
}

/**
 * Minimal JSON-Schema-shaped object describing the workflow's expected
 * input payload. Always `type: "object"` with a `properties` map.
 */
export class RunSpecInputSchemaDto {
  @ApiProperty({ enum: ["object"], example: "object" })
  type!: "object";

  @ApiProperty({
    type: "object",
    additionalProperties: { type: "object" },
    description:
      "Map of input field name to its JSON Schema property. Library " +
      "workflows are keyed by LibraryPortDescriptor.path; regular " +
      "workflows are keyed by the ctx declaration key.",
    example: { customerId: { type: "string", description: "Customer ID" } },
  })
  properties!: Record<string, RunSpecInputSchemaPropertyDto>;

  @ApiProperty({
    type: [String],
    description:
      "Names of properties that the caller MUST include. A property " +
      "is required iff it has no `default`.",
    example: ["customerId"],
  })
  required!: string[];
}

/**
 * Phase 8 — the workflow's upload step, surfaced by `/run-spec` when the
 * workflow contains a `source.upload` node. Drives the Run drawer's test
 * upload (MIME / size constraints). Absent from the response otherwise.
 * It carries no URL: the editor's upload endpoint starts a Try run, so it
 * is not a route for outside systems.
 *
 * See DOCUMENT_SOURCES_DESIGN.md §4.3.
 */
export class UploadSpecDto {
  @ApiProperty({
    description: "Id of the source.upload node within the workflow.",
    example: "src-upload-1",
  })
  sourceNodeId!: string;

  @ApiProperty({
    description:
      "Permitted MIME types for the upload. Defaults to " +
      '`["application/pdf", "image/*"]` when the source omits the field.',
    type: [String],
    example: ["application/pdf", "image/*"],
  })
  allowedMimeTypes!: string[];

  @ApiProperty({
    description:
      "Maximum file size in megabytes. Defaults to 50 when the source " +
      "omits the field.",
    example: 50,
  })
  maxFileSizeMB!: number;

  @ApiProperty({
    description:
      "Ctx key under which the resulting blob URL is placed in " +
      "`initialCtx`. Defaults to `documentUrl` when the source omits " +
      "the field.",
    example: "documentUrl",
  })
  ctxKey!: string;
}

/**
 * Response of `GET /api/workflows/:id/run-spec` — the run-time contract
 * for triggering a workflow.
 */
export class RunSpecResponseDto {
  @ApiProperty({
    description:
      "Absolute URL where callers POST a body of the shape described " +
      "by `inputSchema` to trigger a run. Computed server-side from " +
      "the request's Host / forwarded-proto.",
    example: "http://localhost:3002/api/workflows/abc-123/runs",
  })
  triggerUrl!: string;

  @ApiProperty({
    type: RunSpecInputSchemaDto,
    description: "JSON Schema describing the expected request body.",
  })
  inputSchema!: RunSpecInputSchemaDto;

  @ApiProperty({
    description:
      "Short prose explaining how to authenticate the request. " +
      "Today: API key in the `x-api-key` header.",
    example:
      "Include your API key in the `x-api-key` request header. Each key " +
      "is scoped to a single group.",
  })
  authNotes!: string;

  @ApiProperty({
    description:
      "Ready-to-run curl invocation including the trigger URL, the " +
      "`x-api-key` header placeholder, and a stub JSON body matching " +
      "`inputSchema`.",
    example:
      "curl -X POST http://localhost:3002/api/workflows/abc-123/runs \\\n" +
      "  -H 'x-api-key: YOUR_API_KEY' \\\n" +
      "  -H 'content-type: application/json' \\\n" +
      '  -d \'{"customerId":""}\'',
  })
  sampleCurl!: string;

  @ApiPropertyOptional({
    type: () => UploadSpecDto,
    description:
      "The workflow's upload step (`source.upload`), for testing it in " +
      "the editor's Run drawer. Absent (not `null`) when no such step " +
      "exists. Outside systems can't yet send files into an upload step " +
      "as real work, so no upload URL is given. When both `inputSchema` " +
      "(from `source.api`) and `uploadSpec` are populated, the Run drawer " +
      "renders both options.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UploadSpecDto)
  uploadSpec?: UploadSpecDto;
}
