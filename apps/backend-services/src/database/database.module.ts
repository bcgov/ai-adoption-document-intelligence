import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { DocumentDbService } from "./document-db.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  providers: [
    PrismaService,
    DocumentDbService,
    LabelingDocumentDbService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
  exports: [
    PrismaService,
    DocumentDbService,
    LabelingDocumentDbService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
})
export class DatabaseModule {}
