import { Module } from "@nestjs/common";
import { OcrModule } from "../ocr/ocr.module";
import { QueueService } from "./queue.service";

@Module({
  providers: [QueueService],
  exports: [QueueService],
  imports: [OcrModule],
})
export class QueueModule {}
