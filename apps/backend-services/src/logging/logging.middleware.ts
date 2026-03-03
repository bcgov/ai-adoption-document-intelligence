import type { NestMiddleware } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContext } from "./request-context";
import { AppLoggerService } from "./app-logger.service";

const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();
    req.headers[REQUEST_ID_HEADER] = requestId;

    const store = { requestId };
    requestContext.run(store, () => {
      next();
    });
  }
}
