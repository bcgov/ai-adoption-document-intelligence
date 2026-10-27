import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AzureModule } from "../azure/azure.module";
import { BenchmarkDefinitionDbService } from "../benchmark/benchmark-definition-db.service";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { TrainingDbService } from "../training/training-db.service";
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
    AzureModule,
  ],
  controllers: [TemplateModelController],
  providers: [
    TemplateModelService,
    TemplateModelDbService,
    LabelingDocumentDbService,
    TemplateModelOcrService,
    SuggestionService,
    FormatSuggestionService,
    // Template deletion checks in-flight trainings and benchmark definitions.
    // Provided here, not imported: TrainingModule imports this module, and
    // BenchmarkModule reaches it through OcrModule and TrainingModule.
    TrainingDbService,
    BenchmarkDefinitionDbService,
  ],
  exports: [TemplateModelService],
})
export class TemplateModelModule {}
