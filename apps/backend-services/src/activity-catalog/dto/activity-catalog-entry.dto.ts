import { ApiProperty } from "@nestjs/swagger";
import { CatalogEntryPortDescriptorDto } from "./port-descriptor.dto";

/**
 * Single entry in `GET /api/activity-catalog`'s response array. Carries
 * everything the frontend palette / settings panel / binding-walk
 * validator need to render and validate one activity (static or
 * Phase 6 dynamic).
 *
 * The shape mirrors the shared `ActivityCatalogEntry` interface from
 * `@ai-di/graph-workflow`. Dynamic-node entries populate the three
 * optional Phase 6 fields (`dynamicNodeSlug`, `dynamicNodeVersion`,
 * `colorHint: "dyn"`) so consumers can branch on `dynamicNodeSlug`
 * without inspecting `activityType`.
 *
 * `parametersSchema` (Zod) is intentionally omitted from this DTO —
 * Zod schemas don't round-trip over JSON. Consumers receive
 * `paramsSchema` (JSON Schema 7) for static entries that have one,
 * and dynamic entries always have it. Static entries without
 * `paramsSchema` would need the frontend to convert their Zod schema
 * via `z.toJSONSchema()` against the shared package's `ACTIVITY_CATALOG` —
 * which it already does today (`getActivityParametersJsonSchema`).
 */
export class ActivityCatalogEntryDto {
  @ApiProperty({
    description: "Matches `ActivityNode.activityType`.",
    example: "document.split",
  })
  activityType!: string;

  @ApiProperty({
    required: false,
    description:
      "Display name in the palette and on the node. Omitted on dynamic entries (which surface `dynamicNodeSlug` instead).",
  })
  displayName?: string;

  @ApiProperty({
    description: "Palette category.",
    example: "Document Handling",
  })
  category!: string;

  @ApiProperty({ description: "Short description shown on hover." })
  description!: string;

  @ApiProperty({
    description: "Icon identifier (resolved by the frontend).",
    example: "document",
  })
  iconHint!: string;

  @ApiProperty({
    description:
      "Colour hint; resolved by the frontend to a Mantine colour token. Dynamic entries surface `'dyn'`.",
    example: "blue",
  })
  colorHint!: string;

  @ApiProperty({
    type: [CatalogEntryPortDescriptorDto],
    description: "Required and optional input slots.",
  })
  inputs!: CatalogEntryPortDescriptorDto[];

  @ApiProperty({
    type: [CatalogEntryPortDescriptorDto],
    description: "Output slots produced by this activity.",
  })
  outputs!: CatalogEntryPortDescriptorDto[];

  @ApiProperty({
    required: false,
    additionalProperties: true,
    description:
      "JSON Schema 7 fragment for this activity's parameters. Dynamic entries always carry this; static entries omit it (the frontend converts the Zod `parametersSchema` from the shared package's `ACTIVITY_CATALOG`).",
  })
  paramsSchema?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      "When true, the worker's cache decorator short-circuits. Dynamic entries surface `true` unless their script declares `@deterministic true`.",
  })
  nonCacheable?: boolean;

  @ApiProperty({
    required: false,
    description:
      "Phase 6 dynamic-node lineage slug. Present only on entries materialised from a `DynamicNodeVersion.signature`.",
    example: "uppercase-document-url",
  })
  dynamicNodeSlug?: string;

  @ApiProperty({
    required: false,
    description:
      "Phase 6 dynamic-node version number — the lineage's head at the time the merged catalog was built.",
    example: 3,
  })
  dynamicNodeVersion?: number;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      "Phase 6 host allowlist. Present on dynamic entries; absent on static entries.",
  })
  allowNet?: string[];
}
