import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger / OpenAPI translation of the shared `ParseError` discriminated union
 * from `@ai-di/graph-workflow`. Per CLAUDE.md every DTO must be a NestJS class
 * with `@ApiProperty` decorators so Swagger picks the type up — re-exporting
 * the shared type wouldn't surface in the OpenAPI doc.
 *
 * `stage` is the discriminant; `line`, `column`, `tag`, `unknownKind`,
 * `rejectedHost` are populated per stage as documented on each field.
 */
export class ParseErrorDto {
  @ApiProperty({
    enum: ["jsdoc-parse", "signature-semantics", "ts-check", "allowlist"],
    description:
      "Which publish-time validation stage produced this error. Discriminates the union shape.",
    example: "ts-check",
  })
  stage!: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist";

  @ApiProperty({
    description: "Human-readable error message",
    example: "Type 'string' is not assignable to type 'number'.",
  })
  message!: string;

  @ApiProperty({
    required: false,
    description:
      "1-based source line of the error. Populated for jsdoc-parse / signature-semantics / ts-check; absent for allowlist.",
    example: 10,
  })
  line?: number;

  @ApiProperty({
    required: false,
    description:
      "1-based source column. Populated by ts-check + sometimes by jsdoc-parse.",
    example: 7,
  })
  column?: number;

  @ApiProperty({
    required: false,
    description:
      "Offending JSDoc tag for jsdoc-parse / signature-semantics errors (e.g. '@inputs').",
    example: "@inputs",
  })
  tag?: string;

  @ApiProperty({
    required: false,
    description:
      "ArtifactKind name when signature-semantics rejected a declared kind absent from the registry.",
    example: "BogusKind",
  })
  unknownKind?: string;

  @ApiProperty({
    required: false,
    description:
      "Host pattern rejected by the allowlist stage (not present in DYNAMIC_NODE_ALLOW_NET).",
    example: "evil.example.com",
  })
  rejectedHost?: string;
}
