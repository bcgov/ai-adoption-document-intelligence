import { ApiProperty } from "@nestjs/swagger";
import { DynamicNodeSignatureDto } from "./dynamic-node-signature.dto";

/**
 * Full per-version row shape used by the detail endpoint's `versions[]`.
 * Includes the script source verbatim so the editor's version-history
 * pane (US-179) can mount it without an additional round-trip.
 */
export class DynamicNodeVersionDto {
  @ApiProperty({
    description: "Per-lineage version number, starting at 1.",
    example: 3,
  })
  versionNumber!: number;

  @ApiProperty({
    description:
      "Full TypeScript source as published (with the JSDoc header verbatim).",
  })
  script!: string;

  @ApiProperty({
    type: DynamicNodeSignatureDto,
    description: "Parsed signature persisted on this version.",
  })
  signature!: DynamicNodeSignatureDto;

  @ApiProperty({
    type: [String],
    description:
      "Allowlist-intersected host patterns granted to this version's subprocess at runtime.",
  })
  allowNet!: string[];

  @ApiProperty({
    description:
      "Whether this version is cache-eligible (per `@deterministic`).",
    example: false,
  })
  deterministic!: boolean;

  @ApiProperty({
    description: "ISO 8601 timestamp of publication.",
    example: "2026-05-25T22:30:00.000Z",
  })
  publishedAt!: string;

  @ApiProperty({
    required: false,
    description:
      "User id of the publisher (when known — API-key publishes carry no user).",
  })
  publishedByUserId?: string;
}

/**
 * Lightweight version summary used by the detail endpoint's `headVersion`
 * field + the list endpoint's items. Omits `script` to keep list payloads
 * small.
 */
export class DynamicNodeVersionSummaryDto {
  @ApiProperty({ example: 3 })
  versionNumber!: number;

  @ApiProperty({ type: DynamicNodeSignatureDto })
  signature!: DynamicNodeSignatureDto;

  @ApiProperty({
    description: "ISO 8601 timestamp of publication.",
    example: "2026-05-25T22:30:00.000Z",
  })
  publishedAt!: string;
}
