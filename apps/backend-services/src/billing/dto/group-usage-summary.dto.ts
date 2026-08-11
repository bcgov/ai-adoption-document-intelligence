import { ApiProperty } from "@nestjs/swagger";

/**
 * Current-month usage summary for a group, including cap status and burn-rate projection.
 */
export class GroupUsageSummaryDto {
  @ApiProperty({ description: "Group ID" })
  group_id!: string;

  @ApiProperty({ description: "Calendar year of the billing period" })
  period_year!: number;

  @ApiProperty({ description: "Calendar month of the billing period (1–12)" })
  period_month!: number;

  @ApiProperty({
    description: "Total billing units consumed in this period",
    type: Number,
  })
  total_units_consumed!: number;

  @ApiProperty({
    description: "Total dollars spent in this period",
    type: Number,
  })
  total_dollars_spent!: number;

  @ApiProperty({
    description:
      "Monthly spending cap in dollars. Null means no cap is configured.",
    nullable: true,
    type: Number,
  })
  monthly_cap_dollars!: number | null;

  @ApiProperty({
    description:
      "Remaining dollars before the cap is exhausted. Null if no cap is configured.",
    nullable: true,
    type: Number,
  })
  remaining_dollars!: number | null;
}
