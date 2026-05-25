import { Module } from "@nestjs/common";
import { ActivityOutputCacheRepository } from "./activity-output-cache.repository";

/**
 * Wraps the Phase 4 try-in-place cache repository as an injectable provider.
 *
 * The repository depends on the globally-provided `PrismaService` (see
 * `DatabaseModule`), so no additional imports are required here. Consumers
 * (controllers, services, Temporal-facing helpers) import this module to
 * pull `ActivityOutputCacheRepository` into their DI graph.
 */
@Module({
  providers: [ActivityOutputCacheRepository],
  exports: [ActivityOutputCacheRepository],
})
export class CacheModule {}
