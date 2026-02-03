import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TemporalModule } from "../temporal/temporal.module";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";

@Module({
  imports: [DatabaseModule, TemporalModule],
  providers: [DocumentService],
  controllers: [DocumentController],
  exports: [DocumentService],
})
export class DocumentModule {}
