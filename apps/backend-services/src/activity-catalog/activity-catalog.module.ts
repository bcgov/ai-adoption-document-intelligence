import { Module } from "@nestjs/common";
import { DynamicNodesModule } from "@/dynamic-nodes/dynamic-nodes.module";
import { ActivityCatalogController } from "./activity-catalog.controller";

/**
 * NestJS module wiring the Phase 6 Milestone D activity-catalog merge
 * endpoint.
 *
 * Composition:
 *  - `ActivityCatalogController` — `GET /api/activity-catalog`.
 *  - `DynamicNodesModule` (imported) — supplies the
 *    `DynamicNodesService` whose `getMergedCatalogForGroup` produces
 *    the merged list.
 */
@Module({
  imports: [DynamicNodesModule],
  controllers: [ActivityCatalogController],
})
export class ActivityCatalogModule {}
