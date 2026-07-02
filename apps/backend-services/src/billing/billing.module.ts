import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { LoggingModule } from "@/logging/logging.module";
import { PreflightCapCheckService } from "./preflight-cap-check.service";
import { PreflightCostEstimatorService } from "./preflight-cost-estimator.service";
import { RateVersionSeederService } from "./rate-version-seeder.service";
import { UsageEventService } from "./usage-event.service";

@Module({
  imports: [DatabaseModule, LoggingModule],
  providers: [
    RateVersionSeederService,
    UsageEventService,
    PreflightCostEstimatorService,
    PreflightCapCheckService,
  ],
  exports: [
    RateVersionSeederService,
    UsageEventService,
    PreflightCostEstimatorService,
    PreflightCapCheckService,
  ],
})
export class BillingModule {}
