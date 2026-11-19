import { ApiProperty } from "@nestjs/swagger";

/**
 * Catalog-entry port descriptor. Mirrors the shared
 * `PortDescriptor` interface from `@ai-di/graph-workflow`.
 *
 * `kind` is optional in the shared type — when omitted, the consumer
 * treats the port as the `Artifact` wildcard. We surface it as the
 * string form (e.g. `"Document"`, `"Segment[]"`) because the
 * `ArtifactKind` registry is open-ended and the Swagger contract is
 * easier to consume as raw strings than as a discriminated union.
 */
export class CatalogEntryPortDescriptorDto {
  @ApiProperty({
    description: "Slot name (matches the `port` in `PortBinding`).",
    example: "document",
  })
  name!: string;

  @ApiProperty({
    description: "Human-readable label for the settings panel.",
    example: "Document",
  })
  label!: string;

  @ApiProperty({
    required: false,
    description: "Optional description shown as field help text.",
  })
  description?: string;

  @ApiProperty({
    required: false,
    description:
      "Whether this slot must be bound for the workflow to validate.",
  })
  required?: boolean;

  @ApiProperty({
    required: false,
    description:
      "ArtifactKind name (or `<Kind>[]` for arrays). Omitted = `Artifact` wildcard.",
    example: "Document",
  })
  kind?: string;
}
