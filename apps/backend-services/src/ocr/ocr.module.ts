import { Module } from "@nestjs/common";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { OcrController } from "./ocr.controller";
import { OcrService } from "./ocr.service";

@Module({
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule, TemporalModule, BlobStorageModule],
})
export class OcrModule {}
