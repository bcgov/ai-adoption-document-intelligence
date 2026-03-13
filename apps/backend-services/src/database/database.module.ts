import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

@Module({
  providers: [PrismaService, ReviewDbService, DatabaseService],
  exports: [PrismaService, ReviewDbService, DatabaseService],
})
export class DatabaseModule {}
