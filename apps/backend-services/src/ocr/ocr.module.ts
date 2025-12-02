import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { OcrService } from "./ocr.service";

@Module({
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule, HttpModule],
})
export class OcrModule {}
