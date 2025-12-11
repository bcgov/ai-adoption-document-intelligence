import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OcrModule } from "../ocr/ocr.module";
import { QueueService } from "./queue.service";

@Module({
  providers: [QueueService],
  exports: [QueueService],
  imports: [OcrModule, DatabaseModule],
})
export class QueueModule {}
