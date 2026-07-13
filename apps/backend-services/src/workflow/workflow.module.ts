import { forwardRef, Module } from "@nestjs/common";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { CacheModule } from "@/cache/cache.module";
import { DatabaseModule } from "@/database/database.module";
import { DocumentDbService } from "@/document/document-db.service";
import { DynamicNodesModule } from "@/dynamic-nodes/dynamic-nodes.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { SourceUploadService } from "./source-upload.service";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => TemporalModule),
    BlobStorageModule,
    CacheModule,
    DynamicNodesModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, SourceUploadService, DocumentDbService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
