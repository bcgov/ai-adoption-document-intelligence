import { Module } from "@nestjs/common";
import { UploadController } from "./upload.controller";
import { DocumentModule } from "../document/document.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [DocumentModule, QueueModule],
  controllers: [UploadController],
})
export class UploadModule {}
