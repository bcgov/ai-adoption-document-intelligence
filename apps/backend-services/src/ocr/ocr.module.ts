import { Module } from "@nestjs/common";
import { OcrService } from "./ocr.service";
import { DatabaseModule } from "@/database/database.module";

@Module({
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule],
})
export class OcrModule {}
