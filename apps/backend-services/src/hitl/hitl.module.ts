import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { AnalyticsService } from "./analytics.service";
import { HitlController } from "./hitl.controller";
import { HitlService } from "./hitl.service";
import { HitlAggregationService } from "./hitl-aggregation.service";
import { LockExpiryService } from "./lock-expiry.service";
import { ReviewDbService } from "./review-db.service";
import { ToolManifestService } from "./tool-manifest.service";

@Module({
  imports: [DatabaseModule, DocumentModule, ScheduleModule.forRoot()],
  controllers: [HitlController],
  providers: [
    HitlService,
    ReviewDbService,
    AnalyticsService,
    HitlAggregationService,
    ToolManifestService,
    LockExpiryService,
  ],
  exports: [
    HitlService,
    ReviewDbService,
    AnalyticsService,
    HitlAggregationService,
    ToolManifestService,
  ],
})
export class HitlModule {}
