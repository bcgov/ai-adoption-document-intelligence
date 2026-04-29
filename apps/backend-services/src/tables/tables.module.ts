import { Module } from "@nestjs/common";
import { TablesController } from "./tables.controller";
import { TablesService } from "./tables.service";
import { TablesDbService } from "./tables-db.service";

@Module({
  controllers: [TablesController],
  providers: [TablesDbService, TablesService],
  exports: [TablesService],
})
export class TablesModule {}
