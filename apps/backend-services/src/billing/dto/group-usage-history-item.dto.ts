import { ApiProperty } from "@nestjs/swagger";

/**
 * A single historical billing period summary for a group.
 */
export class GroupUsageHistoryItemDto {
  @ApiProperty({ description: "Calendar year of the billing period" })
  period_year!: number;

  @ApiProperty({ description: "Calendar month of the billing period (1–12)" })
  period_month!: number;

  @ApiProperty({ description: "Total billing units consumed", type: Number })
  total_units_consumed!: number;

  @ApiProperty({ description: "Total dollars spent", type: Number })
  total_dollars_spent!: number;
}
