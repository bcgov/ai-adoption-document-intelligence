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

/**
 * Requests to these paths are logged at `debug` rather than `info`.
 *
 * They are the kubelet's two probes and Prometheus's scrape, fired every few
 * seconds per replica, and together they are the overwhelming majority of
 * request log volume — 99% of a 20,000-line production sample. Logging them at
 * `debug` keeps them out of the shipped log without discarding them: raise the
 * level and they come back, which is what you want when a probe is the thing
 * being investigated.
 *
 * The optional `api/` prefix mirrors the promtail drop rule, so the two agree
 * on what counts as a probe path.
 */
const PROBE_PATH = /^\/(?:api\/)?(?:health(?:\/|$)|metrics\/?$)/;

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
      const actorId =
        "actorId" in request.resolvedIdentity
          ? request.resolvedIdentity.actorId
          : undefined;
      if (actorId) store.actorId = actorId;
      const userId = request.resolvedIdentity.userId;
      if (userId) store.userId = userId;
    }

    if (store && request.apiKey) {
      store.apiKeyId = request.apiKey.keyPrefix;
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
    const context = {
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
      durationMs,
    };
    if (PROBE_PATH.test(request.path)) {
      this.logger.debug("Request completed", context);
      return;
    }
    this.logger.log("Request completed", context);
  }
}
