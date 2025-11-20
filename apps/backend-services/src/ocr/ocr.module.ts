import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { OcrService } from "./ocr.service";
import { DatabaseModule } from "@/database/database.module";

@Module({
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule, HttpModule],
})
export class OcrModule {}
