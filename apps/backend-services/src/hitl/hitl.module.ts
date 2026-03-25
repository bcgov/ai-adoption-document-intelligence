import { Module } from "@nestjs/common";
import { DocumentModule } from "../document/document.module";
import { AnalyticsService } from "./analytics.service";
import { HitlController } from "./hitl.controller";
import { HitlService } from "./hitl.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  imports: [DocumentModule],
  controllers: [HitlController],
  providers: [HitlService, AnalyticsService, ReviewDbService],
  exports: [HitlService, AnalyticsService, ReviewDbService],
})
export class HitlModule {}
