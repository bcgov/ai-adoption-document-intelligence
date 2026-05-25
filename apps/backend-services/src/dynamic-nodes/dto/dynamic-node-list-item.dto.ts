import { ApiProperty } from "@nestjs/swagger";
import { DynamicNodeVersionSummaryDto } from "./dynamic-node-version.dto";

/**
 * One row in `GET /api/dynamic-nodes`. Carries enough for the management
 * page's table view (US-180) without hauling every version's full script.
 */
export class DynamicNodeListItemDto {
  @ApiProperty({
    description: "Lineage slug.",
    example: "uppercase-document-url",
  })
  slug!: string;

  @ApiProperty({
    type: DynamicNodeVersionSummaryDto,
    description: "Lightweight summary of the head version (no script body).",
  })
  headVersion!: DynamicNodeVersionSummaryDto;

  @ApiProperty({
    description: "Total number of versions ever published for this lineage.",
    example: 3,
  })
  versionCount!: number;

  @ApiProperty({
    description:
      'Approximate count of workflows in this group whose config references `"dyn.<slug>"`. Backed by a simple LIKE query.',
    example: 1,
  })
  usedInWorkflowCount!: number;
}
