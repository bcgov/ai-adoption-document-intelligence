import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { QueueModule } from "../queue/queue.module";
import { UploadController } from "./upload.controller";

@Module({
  imports: [DatabaseModule, DocumentModule, QueueModule],
  controllers: [UploadController],
})
export class UploadModule {}
