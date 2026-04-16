import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches } from "class-validator";

/**
 * DTO for configuring a benchmark definition schedule
 * See US-035: Scheduled & Nightly Runs
 */
export class ScheduleConfigDto {
  @ApiProperty({ description: "Whether scheduling is enabled" })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description:
      "Cron expression for the schedule (e.g., '0 2 * * *' for 2 AM daily)",
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(\*|([0-5]?\d))\s+(\*|([01]?\d|2[0-3]))\s+(\*|([0-2]?\d|3[01]))\s+(\*|([1-9]|1[0-2]))\s+(\*|([0-6]))$/,
    {
      message:
        "Invalid cron expression. Must be a valid cron format (e.g., '0 2 * * *' for 2 AM daily)",
    },
  )
  cron?: string;
}
