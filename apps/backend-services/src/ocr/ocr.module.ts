import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { OcrController } from "./ocr.controller";
import { OcrService } from "./ocr.service";

@Module({
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule, HttpModule],
})
export class OcrModule {}
