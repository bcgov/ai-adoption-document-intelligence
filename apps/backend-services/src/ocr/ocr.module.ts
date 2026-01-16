import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { OcrService } from "./ocr.service";

@Module({
  providers: [OcrService],
  exports: [OcrService],
  imports: [DatabaseModule, TemporalModule],
})
export class OcrModule {}
