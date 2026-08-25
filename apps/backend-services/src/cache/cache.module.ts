import { Module } from "@nestjs/common";
import { ActivityOutputCacheRepository } from "./activity-output-cache.repository";
import { ActivityOutputCacheGcService } from "./activity-output-cache-gc.service";

/**
 * Wraps the Phase 4 try-in-place cache repository as an injectable provider,
 * plus the hourly GC sweep that reclaims expired rows.
 *
 * Both depend only on globally-provided services (`PrismaService` from
 * `DatabaseModule`, `AppLoggerService` from `LoggingModule`), so no
 * additional imports are required here. Consumers (controllers, services,
 * Temporal-facing helpers) import this module to pull
 * `ActivityOutputCacheRepository` into their DI graph; the GC service is
 * cron-driven and not exported.
 */
@Module({
  providers: [ActivityOutputCacheRepository, ActivityOutputCacheGcService],
  exports: [ActivityOutputCacheRepository],
})
export class CacheModule {}
