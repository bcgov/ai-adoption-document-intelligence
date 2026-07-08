import { ApiProperty } from "@nestjs/swagger";

export class ActivityItemDto {
  @ApiProperty({
    description: "Total billing units consumed for this activity type",
    type: Number,
  })
  units_consumed!: number;

  @ApiProperty({
    description: "Total dollars spent for this activity type",
    type: Number,
  })
  dollars_spent!: number;
}

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
      "A map of activity names/types for cost breakdowns (e.g. ocr.page_extraction). Null events are grouped as 'other'.",
    type: ActivityItemDto,
  })
  activities!: Record<string, ActivityItemDto>;

  @ApiProperty({
    description: "Total billing units consumed for this event type",
    type: Number,
  })
  units_consumed!: number;

  @ApiProperty({
    description: "Total dollars spent for this event type",
    type: Number,
  })
  dollars_spent!: number;

  @ApiProperty({
    description: "The category of event the usage record falls under.",
  })
  event_type!: string;
}
