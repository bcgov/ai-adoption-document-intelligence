import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { AnalyticsService } from "./analytics.service";
import { HitlController } from "./hitl.controller";
import { HitlService } from "./hitl.service";
import { HitlAggregationService } from "./hitl-aggregation.service";
import { ToolManifestService } from "./tool-manifest.service";

@Module({
  imports: [DatabaseModule, DocumentModule],
  controllers: [HitlController],
  providers: [
    HitlService,
    AnalyticsService,
    HitlAggregationService,
    ToolManifestService,
  ],
  exports: [
    HitlService,
    AnalyticsService,
    HitlAggregationService,
    ToolManifestService,
  ],
})
export class HitlModule {}
