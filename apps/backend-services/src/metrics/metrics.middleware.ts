import type { NestMiddleware } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { MetricsService } from "./metrics.service";

const METRICS_PATH = "/metrics";

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Exclude the /metrics endpoint itself from being counted
    if (req.path === METRICS_PATH) {
      next();
      return;
    }

    const startTime = process.hrtime.bigint();

    res.on("finish", () => {
      const durationNs = Number(process.hrtime.bigint() - startTime);
      const durationSeconds = durationNs / 1e9;
      const method = req.method;
      const path = req.route?.path ?? req.path;
      const statusCode = res.statusCode.toString();

      this.metricsService.httpRequestsTotal.inc({
        method,
        path,
        status_code: statusCode,
      });

      this.metricsService.httpRequestDurationSeconds.observe(
        { method, path },
        durationSeconds,
      );

      if (res.statusCode >= 400) {
        this.metricsService.httpRequestErrorsTotal.inc({
          method,
          path,
          status_code: statusCode,
        });
      }
    });

    next();
  }
}
