import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { AnalyticsService } from "./analytics.service";
import { HitlController } from "./hitl.controller";
import { HitlService } from "./hitl.service";

@Module({
  imports: [DatabaseModule, DocumentModule],
  controllers: [HitlController],
  providers: [HitlService, AnalyticsService],
  exports: [HitlService, AnalyticsService],
})
export class HitlModule {}
