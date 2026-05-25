import { forwardRef, Module } from "@nestjs/common";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { CacheModule } from "@/cache/cache.module";
import { DatabaseModule } from "@/database/database.module";
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
  providers: [WorkflowService, SourceUploadService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
