import { ApiProperty } from "@nestjs/swagger";

/**
 * A single activity-level spend record for one billing period.
 * Used to build the stacked bar chart on the billing dashboard.
 */
export class GroupActivityHistoryItemDto {
  @ApiProperty({ description: "Calendar year of the billing period" })
  period_year!: number;

  @ApiProperty({ description: "Calendar month of the billing period (1–12)" })
  period_month!: number;

  @ApiProperty({
    description:
      "Activity name (e.g. ocr.page_extraction). Null events are grouped as 'other'.",
  })
  activity_name!: string;

  @ApiProperty({ description: "Total billing units consumed", type: Number })
  units_consumed!: number;

  @ApiProperty({ description: "Total dollars spent", type: Number })
  dollars_spent!: number;

  @ApiProperty({
    description: "The category of event the usage record falls under.",
  })
  event_type!: string;
}
