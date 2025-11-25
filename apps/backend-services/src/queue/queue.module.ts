import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { OcrModule } from "../ocr/ocr.module";
import { DatabaseModule } from "../database/database.module";

@Module({
  providers: [QueueService],
  exports: [QueueService],
  imports: [OcrModule, DatabaseModule],
})
export class QueueModule {}
