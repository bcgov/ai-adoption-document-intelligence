import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  providers: [
    PrismaService,
    LabelingDocumentDbService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
  exports: [
    PrismaService,
    LabelingDocumentDbService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
})
export class DatabaseModule {}
