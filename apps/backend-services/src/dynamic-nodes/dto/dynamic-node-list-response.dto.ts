import { ApiProperty } from "@nestjs/swagger";
import { DynamicNodeListItemDto } from "./dynamic-node-list-item.dto";

/**
 * 200-response body for `GET /api/dynamic-nodes`. Items are sorted by
 * `slug` ascending; soft-deleted lineages are excluded.
 */
export class DynamicNodeListResponseDto {
  @ApiProperty({
    type: [DynamicNodeListItemDto],
    description: "Group's non-deleted dynamic-node lineages.",
  })
  items!: DynamicNodeListItemDto[];
}
