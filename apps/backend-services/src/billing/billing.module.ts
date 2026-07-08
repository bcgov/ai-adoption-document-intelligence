import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { LoggingModule } from "@/logging/logging.module";
import { BillingConfigService } from "./billing-config.service";
import { PreflightCapCheckService } from "./preflight-cap-check.service";
import { PreflightCostEstimatorService } from "./preflight-cost-estimator.service";
import { RateVersionSeederService } from "./rate-version-seeder.service";
import { UsageController } from "./usage.controller";
import { UsageEventService } from "./usage-event.service";
import { UsageQueryService } from "./usage-query.service";

@Module({
  imports: [DatabaseModule, LoggingModule],
  controllers: [UsageController],
  providers: [
    RateVersionSeederService,
    UsageEventService,
    PreflightCostEstimatorService,
    PreflightCapCheckService,
    BillingConfigService,
    UsageQueryService,
  ],
  exports: [
    RateVersionSeederService,
    UsageEventService,
    PreflightCostEstimatorService,
    PreflightCapCheckService,
    BillingConfigService,
    UsageQueryService,
  ],
})
export class BillingModule {}
