import { forwardRef, Module } from "@nestjs/common";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { SourceUploadService } from "./source-upload.service";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => TemporalModule),
    BlobStorageModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, SourceUploadService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
