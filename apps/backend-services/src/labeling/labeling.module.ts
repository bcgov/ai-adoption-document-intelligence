import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { LabelingController } from "./labeling.controller";
import { LabelingService } from "./labeling.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingOcrService } from "./labeling-ocr.service";
import { SuggestionService } from "./suggestion.service";

@Module({
  imports: [DatabaseModule, HttpModule, BlobStorageModule],
  controllers: [LabelingController],
  providers: [
    LabelingService,
    LabelingOcrService,
    SuggestionService,
    LabelingDocumentDbService,
  ],
  exports: [LabelingService],
})
export class LabelingModule {}
