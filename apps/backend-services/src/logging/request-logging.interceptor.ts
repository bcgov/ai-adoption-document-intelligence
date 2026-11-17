import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { type Observable, tap } from "rxjs";
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
      _loggingCompleted?: boolean;
    }
  }
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Enriches request context and logs completion, including the thrown HTTP status.
   * @param context Current execution context.
   * @param next Route handler stream.
   * @returns The handler stream with completion logging.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
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

    // A custom step's call: the audit events it records name the step and
    // the run it belongs to.
    const dynamicNodeRun = request.internalToken?.dynamicNodeRun;
    if (store && dynamicNodeRun) {
      store.dynamicNodeRun = dynamicNodeRun;
    }

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(request, context.getType()),
        error: (error: unknown) =>
          this.logRequest(
            request,
            context.getType(),
            error instanceof HttpException
              ? error.getStatus()
              : HttpStatus.INTERNAL_SERVER_ERROR,
          ),
      }),
    );
  }

  /**
   * Records a request once and marks it as handled for the exception filter.
   * @param request Current HTTP request.
   * @param contextType Nest execution context type.
   * @param failureStatus Exception status, before Nest updates the response.
   * @returns Nothing.
   */
  private logRequest(
    request: Request,
    contextType: string,
    failureStatus?: number,
  ): void {
    if (contextType !== "http" || !request.res) return;
    const start = request._loggingStartTime;
    const durationMs = start != null ? Date.now() - start : undefined;
    const requestId = request.headers["x-request-id"] as string | undefined;
    const statusCode = failureStatus ?? request.res.statusCode;
    request._loggingCompleted = true;
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
