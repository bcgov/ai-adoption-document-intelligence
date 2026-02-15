/**
 * DTO for schedule information returned to clients
 * See US-035: Scheduled & Nightly Runs
 */
export class ScheduleInfoDto {
  scheduleId: string;
  cron: string;
  nextRunTime?: Date;
  lastRunTime?: Date;
  paused: boolean;
}
