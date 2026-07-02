import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { LoggingModule } from "@/logging/logging.module";
import { RateVersionSeederService } from "./rate-version-seeder.service";
import { UsageEventService } from "./usage-event.service";

@Module({
  imports: [DatabaseModule, LoggingModule],
  providers: [RateVersionSeederService, UsageEventService],
  exports: [RateVersionSeederService, UsageEventService],
})
export class BillingModule {}
