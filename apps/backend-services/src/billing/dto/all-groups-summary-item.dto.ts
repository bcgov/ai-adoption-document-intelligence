import { ApiProperty } from "@nestjs/swagger";

/**
 * Current-month spend summary for a single group, as returned by the platform admin cross-group view.
 */
export class AllGroupsSummaryItemDto {
  @ApiProperty({ description: "Group ID" })
  group_id!: string;

  @ApiProperty({ description: "Group name" })
  group_name!: string;

  @ApiProperty({
    description: "Total dollars spent this calendar month",
    type: Number,
  })
  total_dollars_spent!: number;

  @ApiProperty({
    description:
      "Configured monthly spending cap in dollars. Null if no cap is configured.",
    nullable: true,
    type: Number,
  })
  monthly_cap_dollars!: number | null;

  @ApiProperty({
    description:
      "Spend as a percentage of the cap (0–100+). Null if no cap is configured.",
    nullable: true,
    type: Number,
  })
  usage_percentage!: number | null;
}
