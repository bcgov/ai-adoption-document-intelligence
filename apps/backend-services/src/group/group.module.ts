import { Module } from "@nestjs/common";
import { BillingModule } from "@/billing/billing.module";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";
import { GroupDbService } from "./group-db.service";

@Module({
  imports: [BillingModule],
  controllers: [GroupController],
  providers: [GroupService, GroupDbService],
  exports: [GroupService],
})
export class GroupModule {}
