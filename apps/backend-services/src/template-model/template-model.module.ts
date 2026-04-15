import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { SuggestionService } from "./suggestion.service";
import { TemplateModelController } from "./template-model.controller";
import { TemplateModelService } from "./template-model.service";
import { TemplateModelDbService } from "./template-model-db.service";
import { TemplateModelOcrService } from "./template-model-ocr.service";

@Module({
  imports: [DatabaseModule, HttpModule, BlobStorageModule, DocumentModule],
  controllers: [TemplateModelController],
  providers: [
    TemplateModelService,
    TemplateModelDbService,
    LabelingDocumentDbService,
    TemplateModelOcrService,
    SuggestionService,
  ],
  exports: [TemplateModelService],
})
export class TemplateModelModule {}
