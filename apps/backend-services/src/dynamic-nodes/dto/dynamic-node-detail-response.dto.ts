import { ApiProperty } from "@nestjs/swagger";
import {
  DynamicNodeVersionDto,
  DynamicNodeVersionSummaryDto,
} from "./dynamic-node-version.dto";

/**
 * 200-response body for `GET /api/dynamic-nodes/:slug`. Carries the head
 * version summary + the full version history (newest first) including
 * every version's script body. Used by the editor (US-178) and the
 * version-history pane (US-179).
 */
export class DynamicNodeDetailResponseDto {
  @ApiProperty({
    description: "Lineage slug.",
    example: "uppercase-document-url",
  })
  slug!: string;

  @ApiProperty({
    type: DynamicNodeVersionSummaryDto,
    description: "Lightweight summary of the head version.",
  })
  headVersion!: DynamicNodeVersionSummaryDto;

  @ApiProperty({
    type: [DynamicNodeVersionDto],
    description:
      "Full version history sorted by `versionNumber` descending (newest first).",
  })
  versions!: DynamicNodeVersionDto[];
}
