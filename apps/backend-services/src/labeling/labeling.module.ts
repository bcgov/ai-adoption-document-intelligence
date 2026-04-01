import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DocumentModule } from "../document/document.module";
import { LabelingController } from "./labeling.controller";
import { LabelingService } from "./labeling.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingOcrService } from "./labeling-ocr.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { SuggestionService } from "./suggestion.service";

@Module({
  imports: [HttpModule, BlobStorageModule, DocumentModule],
  controllers: [LabelingController],
  providers: [
    LabelingService,
    LabelingOcrService,
    SuggestionService,
    LabelingDocumentDbService,
    LabelingProjectDbService,
  ],
  exports: [LabelingService],
})
export class LabelingModule {}
