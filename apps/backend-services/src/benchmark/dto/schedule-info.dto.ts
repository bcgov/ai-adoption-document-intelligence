import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * DTO for schedule information returned to clients
 * See US-035: Scheduled & Nightly Runs
 */
export class ScheduleInfoDto {
  @ApiProperty({ description: "Temporal schedule ID" })
  scheduleId!: string;

  @ApiProperty({ description: "Cron expression for the schedule" })
  cron!: string;

  @ApiPropertyOptional({ description: "Next scheduled run time", type: Date })
  nextRunTime?: Date;

  @ApiPropertyOptional({ description: "Last run time", type: Date })
  lastRunTime?: Date;

  @ApiProperty({ description: "Whether the schedule is paused" })
  paused!: boolean;
}
