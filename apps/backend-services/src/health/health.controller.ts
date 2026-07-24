import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "@/auth/public.decorator";
import { HealthService } from "./health.service";

@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get("health")
  async getHealth(@Res() res: Response): Promise<void> {
    const health = await this.healthService.checkHealth();

    if (health.status === "healthy") {
      res.status(HttpStatus.OK).json(health);
    } else {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json(health);
    }
  }

  @Public()
  @Get("health/live")
  async getLiveness(@Res() res: Response): Promise<void> {
    // Liveness probe: application is running and can accept requests
    // This is a lightweight check - just confirms the app is responsive
    res.status(HttpStatus.OK).json({ status: "ok" });
  }

  @Public()
  @Get("health/ready")
  async getReadiness(@Res() res: Response): Promise<void> {
    // Readiness probe: application is ready to handle traffic
    // Checks all dependencies are accessible
    const health = await this.healthService.checkHealth();

    if (health.status === "healthy") {
      res.status(HttpStatus.OK).json(health);
    } else {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json(health);
    }
  }
}
