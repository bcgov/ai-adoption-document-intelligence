import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { TemporalModule } from "../temporal/temporal.module";
import { DocumentRetentionService } from "./retention.service";
import { EphemeralDocumentCleanupService } from "./ephemeral-document-cleanup.service";
import { RetentionDbService } from "./retention-db.service";
import { DocumentDbService } from "@/document/document-db.service";


@Module({
  imports: [BlobStorageModule, TemporalModule],
  providers: [
    DocumentRetentionService,
    EphemeralDocumentCleanupService,
    RetentionDbService,
    DocumentDbService
  ],
  exports: [],
})
export class DocumentModule {}
