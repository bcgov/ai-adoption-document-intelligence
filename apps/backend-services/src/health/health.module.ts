import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

/** Provides the liveness probe endpoint at GET /health. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
