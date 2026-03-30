import type { NestMiddleware } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AppLoggerService } from "./app-logger.service";
import { requestContext } from "./request-context";

const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(readonly _logger: AppLoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const clientIp = this.extractClientIp(req);

    const store = { requestId, clientIp };
    requestContext.run(store, () => {
      next();
    });
  }

  private extractClientIp(req: Request): string | undefined {
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (typeof xForwardedFor === "string" && xForwardedFor) {
      return xForwardedFor.split(",")[0].trim();
    }

    const xRealIp = req.headers["x-real-ip"];
    if (typeof xRealIp === "string" && xRealIp) {
      return xRealIp;
    }

    return req.socket.remoteAddress;
  }
}
