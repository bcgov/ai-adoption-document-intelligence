import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { TemplateModelController } from "./template-model.controller";
import { TemplateModelService } from "./template-model.service";
import { TemplateModelOcrService } from "./template-model-ocr.service";
import { SuggestionService } from "./suggestion.service";

@Module({
  imports: [DatabaseModule, HttpModule, BlobStorageModule],
  controllers: [TemplateModelController],
  providers: [TemplateModelService, TemplateModelOcrService, SuggestionService],
  exports: [TemplateModelService],
})
export class TemplateModelModule {}
