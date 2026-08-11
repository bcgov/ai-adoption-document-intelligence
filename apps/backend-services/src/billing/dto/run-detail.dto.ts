import { ApiProperty } from "@nestjs/swagger";

/**
 * Full cost breakdown for a single workflow execution, including all usage events.
 */
export class RunDetailDto {
  @ApiProperty({ description: "Temporal workflow execution ID" })
  workflow_execution_id!: string;

  @ApiProperty({ description: "Version ID of workflow ran" })
  workflow_version_id!: string;

  @ApiProperty({ description: "Group that owns this execution" })
  group_id!: string;

  @ApiProperty({
    description: "Pre-flight estimated units from the workflow_started event",
    nullable: true,
    type: Number,
  })
  estimated_units!: number | null;

  @ApiProperty({
    description:
      "Actual total units consumed from the terminal event (workflow_completed / workflow_failed / workflow_cancelled)",
    nullable: true,
    type: Number,
  })
  total_units_consumed!: number | null;

  @ApiProperty({ description: "Usage event ID" })
  id!: string;

  @ApiProperty({ description: "Event type (e.g. activity_completed)" })
  event_type!: string;

  @ApiProperty({
    description: "Activity name, present on activity_completed events",
    nullable: true,
  })
  activity_name!: string | null;

  @ApiProperty({
    description: "Billing units consumed by this event",
    type: Number,
  })
  units_consumed!: number;

  @ApiProperty({
    description:
      "Dollar value of this event (units_consumed × rate unit_cost_dollars)",
    type: Number,
  })
  dollar_value!: number;

  @ApiProperty({
    description:
      "Number of pages processed for per-page activities. Null for flat-cost activities.",
    nullable: true,
    type: Number,
  })
  metered_quantity!: number | null;

  @ApiProperty({
    description: "Timestamp when this event was recorded",
    type: Date,
  })
  created_at!: Date;
}
