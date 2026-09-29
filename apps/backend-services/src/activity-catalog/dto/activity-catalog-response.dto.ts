import { ApiProperty } from "@nestjs/swagger";
import { ActivityCatalogEntryDto } from "./activity-catalog-entry.dto";

/**
 * 200-response body for `GET /api/activity-catalog`. Entries are
 * ordered:
 *   1. Static catalog entries first, in their registered order.
 *   2. The calling group's non-deleted dynamic-node head versions
 *      next, sorted by `dynamicNodeSlug` ascending.
 *
 * Soft-deleted dynamic-node lineages are excluded. Cross-group
 * isolation is enforced by the controller's group-id resolution
 * (US-173 Scenario 3).
 */
export class ActivityCatalogResponseDto {
  @ApiProperty({
    type: [ActivityCatalogEntryDto],
    description:
      "Merged static + dynamic catalog entries. Static first, dynamic sorted by `dynamicNodeSlug` ascending.",
  })
  entries!: ActivityCatalogEntryDto[];
}
