import { getErrorStack } from "@ai-di/shared-logging";
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLoggerService } from "@/logging/app-logger.service";
import { ActivityOutputCacheRepository } from "./activity-output-cache.repository";

/**
 * Hourly janitor for the Phase 4 activity-output cache.
 *
 * Expiry is enforced on read — `findFresh` and friends never return a row
 * past `expiresAt` — so this sweep exists purely to reclaim storage: without
 * it, expired rows accumulate invisibly until the volume fills. Deleting by
 * expiry is idempotent, so multiple backend replicas running the sweep
 * concurrently is harmless (the same stance the ephemeral-document and
 * classifier-orphan cleanup crons take).
 *
 * Failures are logged and swallowed: a missed sweep costs nothing but disk
 * until the next hour, and a cron handler must never take the process down.
 *
 * Spec: docs-md/workflows/TRY_IN_PLACE_DESIGN.md §2 (cache GC).
 */
@Injectable()
export class ActivityOutputCacheGcService {
  constructor(
    private readonly cacheRepository: ActivityOutputCacheRepository,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Runs every hour: deletes all cache rows whose `expiresAt` is in the
   * past (one bulk `deleteMany` via the `(expiresAt)` index).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(): Promise<void> {
    let deleted: number;
    try {
      deleted = await this.cacheRepository.deleteExpired();
    } catch (err) {
      this.logger.error(
        "Activity-output cache GC sweep failed — will retry next hour",
        { stack: getErrorStack(err) },
      );
      return;
    }

    if (deleted > 0) {
      this.logger.log("Activity-output cache GC sweep complete", { deleted });
    }
  }
}
