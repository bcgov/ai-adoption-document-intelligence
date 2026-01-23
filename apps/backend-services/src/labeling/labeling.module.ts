import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { LabelingController } from "./labeling.controller";
import { LabelingService } from "./labeling.service";

@Module({
  imports: [DatabaseModule],
  controllers: [LabelingController],
  providers: [LabelingService],
  exports: [LabelingService],
})
export class LabelingModule {}
