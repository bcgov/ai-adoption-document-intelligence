import { Module } from "@nestjs/common";
import { DocumentModule } from "../document/document.module";
import { QueueModule } from "../queue/queue.module";
import { TrainingModule } from "../training/training.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { UploadController } from "./upload.controller";

@Module({
  imports: [DocumentModule, QueueModule, TrainingModule, WorkflowModule],
  controllers: [UploadController],
})
export class UploadModule {}
