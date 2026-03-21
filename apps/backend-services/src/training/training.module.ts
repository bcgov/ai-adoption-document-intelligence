import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { TemplateModelModule } from "../template-model/template-model.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { TrainingDbService } from "./training-db.service";
import { TrainingPollerService } from "./training-poller.service";

@Module({
  imports: [BlobStorageModule, TemplateModelModule],
  controllers: [TrainingController],
  providers: [TrainingDbService, TrainingService, TrainingPollerService],
  exports: [TrainingService],
})
export class TrainingModule {}
