import { Module } from "@nestjs/common";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DocumentModule } from "@/document/document.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { TrainingModule } from "@/training/training.module";
import { OcrController } from "./ocr.controller";
import { OcrService } from "./ocr.service";

@Module({
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
  imports: [DocumentModule, TrainingModule, TemporalModule, BlobStorageModule],
})
export class OcrModule {}
