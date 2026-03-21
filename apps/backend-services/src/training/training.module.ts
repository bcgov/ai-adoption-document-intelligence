import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { TemplateModelModule } from "../template-model/template-model.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { TrainingPollerService } from "./training-poller.service";

@Module({
  imports: [BlobStorageModule, TemplateModelModule, DatabaseModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingPollerService],
  exports: [TrainingService],
})
export class TrainingModule {}
