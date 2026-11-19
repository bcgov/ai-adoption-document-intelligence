import { ApiProperty } from "@nestjs/swagger";
import { DynamicNodeSignatureDto } from "./dynamic-node-signature.dto";
import { ParseErrorDto } from "./parse-error.dto";

/**
 * Success-path response for `POST` (201) + `PUT` (200). On error responses
 * (400 with structured parse errors) the body uses `PublishErrorsResponseDto`
 * instead.
 *
 * `errors` is intentionally an always-present empty array on success — it
 * keeps the response shape uniform with the error path so the Phase 7
 * agent can dispatch on `version != null` rather than chasing a missing
 * field.
 */
export class DynamicNodePublishResponseDto {
  @ApiProperty({
    description: "Lineage slug (derived from the script's `@name` tag).",
    example: "my-node",
  })
  slug!: string;

  @ApiProperty({
    description:
      "Newly-created version number (1 on POST; N+1 on PUT). Reflects the row that `headVersionId` now points at.",
    example: 1,
  })
  version!: number;

  @ApiProperty({
    type: DynamicNodeSignatureDto,
    description: "Parsed signature persisted on this version.",
  })
  signature!: DynamicNodeSignatureDto;

  @ApiProperty({
    type: [ParseErrorDto],
    description:
      "Always empty on the success path. Surfaces non-fatal warnings in future revisions; in 6.0 the array is always `[]` when version is set.",
    example: [],
  })
  errors!: ParseErrorDto[];
}
