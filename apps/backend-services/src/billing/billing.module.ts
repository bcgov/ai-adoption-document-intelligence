import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { LoggingModule } from "@/logging/logging.module";
import { RateVersionSeederService } from "./rate-version-seeder.service";

@Module({
  imports: [DatabaseModule, LoggingModule],
  providers: [RateVersionSeederService],
  exports: [RateVersionSeederService],
})
export class BillingModule {}
