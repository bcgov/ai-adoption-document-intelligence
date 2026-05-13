import { forwardRef, Module } from "@nestjs/common";
import { BenchmarkModule } from "../benchmark/benchmark.module";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { TemplateModelModule } from "../template-model/template-model.module";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { TrainingDbService } from "./training-db.service";
import { TrainingPollerService } from "./training-poller.service";

@Module({
  // forwardRef breaks a file-evaluation cycle: TrainingModule → BenchmarkModule
  // → OcrModule → TrainingModule (OcrModule imports TrainingModule because the
  // OCR controller depends on TrainingService for trained-model lookup).
  imports: [
    BlobStorageModule,
    TemplateModelModule,
    forwardRef(() => BenchmarkModule),
  ],
  controllers: [TrainingController],
  providers: [TrainingDbService, TrainingService, TrainingPollerService],
  exports: [TrainingService],
})
export class TrainingModule {}
