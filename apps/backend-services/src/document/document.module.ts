import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { TemporalModule } from "../temporal/temporal.module";
import { UploadNormalizationLimiter } from "../upload/upload-normalization-limiter";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";
import { DocumentDbService } from "./document-db.service";
import { PdfNormalizationService } from "./pdf-normalization.service";

@Module({
  imports: [BlobStorageModule, TemporalModule],
  providers: [
    DocumentDbService,
    DocumentService,
    PdfNormalizationService,
    UploadNormalizationLimiter,
  ],
  controllers: [DocumentController],
  exports: [DocumentService, PdfNormalizationService],
})
export class DocumentModule {}
