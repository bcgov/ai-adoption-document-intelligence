import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { tap } from "rxjs";
import { AppLoggerService } from "./app-logger.service";
import { requestContext } from "./request-context";

// Augment Express Request for request-scoped logging timing (standard pattern; namespace required)
declare global {
  // biome-ignore lint/style/noNamespace: Express type augmentation requires namespace
  namespace Express {
    interface Request {
      _loggingStartTime?: number;
    }
  }
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    request._loggingStartTime = Date.now();

    const store = requestContext.getStore();
    if (store && request.resolvedIdentity) {
      const userId =
        "userId" in request.resolvedIdentity
          ? request.resolvedIdentity.userId
          : undefined;
      if (userId) store.userId = userId;
    }

    if (store && request.apiKeyPrefix) {
      store.apiKeyId = request.apiKeyPrefix;
    } else if (store && request.user) {
      const sessionState = request.user.session_state;
      if (typeof sessionState === "string" && sessionState) {
        store.sessionId = sessionState;
      }
    }

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(request, context.getType()),
        error: () => this.logRequest(request, context.getType()),
      }),
    );
  }

  private logRequest(request: Request, contextType: string): void {
    if (contextType !== "http" || !request.res) return;
    const start = request._loggingStartTime;
    const durationMs = start != null ? Date.now() - start : undefined;
    const requestId = request.headers["x-request-id"] as string | undefined;
    const statusCode = request.res.statusCode;
    this.logger.log("Request completed", {
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
      durationMs,
    });
  }
}
