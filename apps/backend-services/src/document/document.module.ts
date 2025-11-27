import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";

@Module({
  imports: [DatabaseModule],
  providers: [DocumentService],
  controllers: [DocumentController],
  exports: [DocumentService],
})
export class DocumentModule {}
