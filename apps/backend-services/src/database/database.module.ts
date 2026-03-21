import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { DocumentDbService } from "./document-db.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { TemplateModelDbService } from "./template-model-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  providers: [
    PrismaService,
    DocumentDbService,
    LabelingDocumentDbService,
    TemplateModelDbService,
    ReviewDbService,
    DatabaseService,
  ],
  exports: [
    PrismaService,
    DocumentDbService,
    LabelingDocumentDbService,
    TemplateModelDbService,
    ReviewDbService,
    DatabaseService,
  ],
})
export class DatabaseModule {}
