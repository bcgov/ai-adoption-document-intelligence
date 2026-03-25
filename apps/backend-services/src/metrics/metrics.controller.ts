import { Controller, ForbiddenException, Get, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "@/auth/public.decorator";
import { MetricsService } from "./metrics.service";

@ApiExcludeController()
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get("metrics")
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Block external access: when the request arrives via the OpenShift Route,
    // the router injects X-Forwarded-Host. In-cluster Prometheus scrapes
    // directly via the Service, so this header is absent.
    const forwardedHost = req.headers["x-forwarded-host"];
    if (forwardedHost) {
      throw new ForbiddenException(
        "Metrics endpoint is not accessible externally",
      );
    }

    const metrics = await this.metricsService.getMetrics();
    res.set("Content-Type", this.metricsService.getContentType());
    res.send(metrics);
  }
}
