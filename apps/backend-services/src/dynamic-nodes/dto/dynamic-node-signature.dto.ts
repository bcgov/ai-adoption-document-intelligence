import { ApiProperty } from "@nestjs/swagger";

/**
 * A single declared input or output port on a dynamic node.
 *
 * Mirrors the shared `DynamicNodePort` interface from `@ai-di/graph-workflow`.
 * Class form is required for `@ApiProperty` Swagger surfacing per CLAUDE.md.
 */
export class DynamicNodePortDto {
  @ApiProperty({
    description: "Port slot name (matches the `port` in PortBinding).",
    example: "document",
  })
  name!: string;

  @ApiProperty({
    description:
      "ArtifactKind name (or `<Kind>[]` for arrays). Cross-checked against the Phase 3 registry at publish time.",
    example: "Document",
  })
  kind!: string;

  @ApiProperty({
    required: false,
    description:
      "Whether this port must be bound for the workflow to validate.",
    example: true,
  })
  required?: boolean;

  @ApiProperty({
    required: false,
    description: "Optional description shown as field help text.",
  })
  description?: string;
}

/**
 * The parsed JSDoc signature of a dynamic-node script. Mirrors the shared
 * `DynamicNodeSignature` interface.
 *
 * Persisted in `DynamicNodeVersion.signature` as JSON (round-tripped via
 * `Prisma.InputJsonValue`) and surfaced verbatim on every publish /
 * detail / list response.
 */
export class DynamicNodeSignatureDto {
  @ApiProperty({
    description: "Slug from `@name`. Group-scoped unique identifier.",
    example: "uppercase-document-url",
  })
  name!: string;

  @ApiProperty({
    description: "Description from `@description`.",
  })
  description!: string;

  @ApiProperty({
    description: "Category from `@category` (default: 'Custom').",
    example: "Custom",
  })
  category!: string;

  @ApiProperty({
    description:
      "From `@deterministic`. When true, the activity's outputs are cached by the Phase 4 cache decorator.",
    example: false,
  })
  deterministic!: boolean;

  @ApiProperty({
    type: [DynamicNodePortDto],
    description: "Declared input ports from `@inputs`.",
  })
  inputs!: DynamicNodePortDto[];

  @ApiProperty({
    type: [DynamicNodePortDto],
    description: "Declared output ports from `@outputs`.",
  })
  outputs!: DynamicNodePortDto[];

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description:
      "JSON Schema 7 built from the `@parameters` JSDoc declaration. Empty schema for nodes without static parameters.",
  })
  paramsSchema!: Record<string, unknown>;

  @ApiProperty({
    type: [String],
    description:
      "Host patterns from `@allowNet` after intersection with the global `DYNAMIC_NODE_ALLOW_NET` allowlist.",
    example: ["api.landingai.com"],
  })
  allowNet!: string[];

  @ApiProperty({
    description: "Per-invocation timeout in milliseconds (cap 60_000 in 6.0).",
    example: 60_000,
  })
  timeoutMs!: number;

  @ApiProperty({
    description: "Per-invocation memory cap in MB (cap 256 in 6.0).",
    example: 256,
  })
  maxMemoryMB!: number;
}
