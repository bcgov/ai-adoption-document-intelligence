import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";
import { GroupDbService } from "./group-db.service";

@Module({
  imports: [DatabaseModule],
  controllers: [GroupController],
  providers: [GroupService, GroupDbService],
  exports: [GroupService],
})
export class GroupModule {}
