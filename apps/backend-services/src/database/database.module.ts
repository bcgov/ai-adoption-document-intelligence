import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  providers: [
    PrismaService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
  exports: [
    PrismaService,
    LabelingProjectDbService,
    ReviewDbService,
    DatabaseService,
  ],
})
export class DatabaseModule {}
