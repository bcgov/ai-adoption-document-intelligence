import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";

@Module({
  imports: [DatabaseModule],
  controllers: [GroupController],
  providers: [GroupService],
})
export class GroupModule {}
