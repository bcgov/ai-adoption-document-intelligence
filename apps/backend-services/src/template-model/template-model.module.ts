import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { FormatSuggestionService } from "./format-suggestion.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { SuggestionService } from "./suggestion.service";
import { TemplateModelController } from "./template-model.controller";
import { TemplateModelService } from "./template-model.service";
import { TemplateModelDbService } from "./template-model-db.service";
import { TemplateModelOcrService } from "./template-model-ocr.service";

@Module({
  imports: [
    DatabaseModule,
    HttpModule,
    BlobStorageModule,
    DocumentModule,
    AuditModule,
  ],
  controllers: [TemplateModelController],
  providers: [
    TemplateModelService,
    TemplateModelDbService,
    LabelingDocumentDbService,
    TemplateModelOcrService,
    SuggestionService,
    FormatSuggestionService,
  ],
  exports: [TemplateModelService],
})
export class TemplateModelModule {}
