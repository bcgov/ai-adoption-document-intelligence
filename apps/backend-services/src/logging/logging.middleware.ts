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

    const store = { requestId };
    requestContext.run(store, () => {
      next();
    });
  }
}
