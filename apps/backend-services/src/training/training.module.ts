import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { LabelingModule } from "../labeling/labeling.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { TrainingPollerService } from "./training-poller.service";

@Module({
  imports: [BlobStorageModule, LabelingModule, DatabaseModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingPollerService],
  exports: [TrainingService],
})
export class TrainingModule {}
