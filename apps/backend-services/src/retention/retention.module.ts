import { Module } from "@nestjs/common";
import { AuditService } from "@/audit/audit.service";
import { DocumentDbService } from "@/document/document-db.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { TemporalModule } from "../temporal/temporal.module";
import { EphemeralDocumentCleanupService } from "./ephemeral-document-cleanup.service";
import { DocumentRetentionService } from "./retention.service";
import { RetentionDbService } from "./retention-db.service";

@Module({
  imports: [BlobStorageModule, TemporalModule],
  providers: [
    DocumentRetentionService,
    EphemeralDocumentCleanupService,
    RetentionDbService,
    DocumentDbService,
    AuditService,
    AppLoggerService,
  ],
  exports: [],
})
export class DocumentModule {}
