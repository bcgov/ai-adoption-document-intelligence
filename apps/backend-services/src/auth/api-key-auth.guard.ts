import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { API_KEY_AUTH_KEY } from "@/decorators/custom-auth-decorators";
import { ApiKeyService } from "../api-key/api-key.service";
import {
  API_KEY_FAILED_WINDOW_MS,
  API_KEY_MAX_FAILED_ATTEMPTS,
  API_KEY_SWEEP_INTERVAL_MS,
} from "./auth.config";

/**
 * Tracks failed API key validation attempts per IP within a time window.
 */
interface FailedAttemptRecord {
  count: number;
  windowStart: number;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate, OnModuleDestroy {
  private readonly failedAttempts = new Map<string, FailedAttemptRecord>();
  private readonly sweepInterval: ReturnType<typeof setInterval>;

  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
  ) {
    this.sweepInterval = setInterval(
      () => this.sweepStaleEntries(),
      API_KEY_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    clearInterval(this.sweepInterval);
    this.failedAttempts.clear();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint allows API key auth
    const allowApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      API_KEY_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowApiKeyAuth) {
      // This guard only handles API key auth for decorated endpoints
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Check if already authenticated via Bearer token (handled by JwtAuthGuard)
    if (request.user) {
      return true;
    }

    // Check for API key header
    const apiKey = request.headers["x-api-key"] as string;

    if (!apiKey) {
      if (!request.user) {
        throw new UnauthorizedException("Authentication required");
      }
      return true;
    }

    // Check if this IP has exceeded the failed-attempt limit
    const clientIp = request.ip || "unknown";
    if (this.isRateLimited(clientIp)) {
      throw new HttpException(
        "Too many failed API key attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Validate the API key
    const keyInfo = await this.apiKeyService.validateApiKey(apiKey);

    if (!keyInfo) {
      this.recordFailedAttempt(clientIp);
      throw new UnauthorizedException("Invalid API key");
    }

    // Successful validation — reset failure counter for this IP
    this.failedAttempts.delete(clientIp);

    // Set user info from API key (roles and email from User relation)
    request.user = {
      sub: keyInfo.userId,
      email: keyInfo.userEmail,
      roles: keyInfo.roles,
    };

    return true;
  }

  /**
   * Checks whether an IP has exceeded the failed-attempt limit within the current window.
   */
  private isRateLimited(ip: string): boolean {
    const record = this.failedAttempts.get(ip);
    if (!record) {
      return false;
    }

    // Reset if the window has expired
    if (Date.now() - record.windowStart >= API_KEY_FAILED_WINDOW_MS) {
      this.failedAttempts.delete(ip);
      return false;
    }

    return record.count >= API_KEY_MAX_FAILED_ATTEMPTS;
  }

  /**
   * Records a failed API key validation attempt for the given IP.
   */
  private recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const record = this.failedAttempts.get(ip);

    if (!record || now - record.windowStart >= API_KEY_FAILED_WINDOW_MS) {
      // Start a new window
      this.failedAttempts.set(ip, { count: 1, windowStart: now });
    } else {
      record.count++;
    }
  }

  /**
   * Removes failed-attempt records that have expired (window has passed).
   */
  private sweepStaleEntries(): void {
    const now = Date.now();
    for (const [ip, record] of this.failedAttempts) {
      if (now - record.windowStart >= API_KEY_FAILED_WINDOW_MS) {
        this.failedAttempts.delete(ip);
      }
    }
  }
}
