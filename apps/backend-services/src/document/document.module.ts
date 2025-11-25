import { Module } from "@nestjs/common";
import { DocumentService } from "./document.service";
import { DocumentController } from "./document.controller";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "@/queue/queue.module";

@Module({
  imports: [DatabaseModule, QueueModule],
  providers: [DocumentService],
  controllers: [DocumentController],
  exports: [DocumentService],
})
export class DocumentModule {}
