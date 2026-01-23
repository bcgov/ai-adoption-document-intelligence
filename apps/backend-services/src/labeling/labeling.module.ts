import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { DatabaseModule } from "../database/database.module";
import { LabelingController } from "./labeling.controller";
import { LabelingService } from "./labeling.service";
import { LabelingOcrService } from "./labeling-ocr.service";

@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [LabelingController],
  providers: [LabelingService, LabelingOcrService],
  exports: [LabelingService],
})
export class LabelingModule {}
