import { Module } from "@nestjs/common";
import { BlobStorageModule } from "../blob-storage/blob-storage.module";
import { DatabaseModule } from "../database/database.module";
import { TemporalModule } from "../temporal/temporal.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";

@Module({
  imports: [BlobStorageModule, DatabaseModule, TemporalModule, WorkflowModule],
  providers: [DocumentService],
  controllers: [DocumentController],
  exports: [DocumentService],
})
export class DocumentModule {}
