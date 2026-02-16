import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { API_KEY_AUTH_KEY } from "@/decorators/custom-auth-decorators";
import { ApiKeyService } from "../api-key/api-key.service";

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiKeyService: ApiKeyService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if already authenticated via Bearer token (handled by BCGovAuthGuard)
    if (request.user) {
      return true;
    }

    // Check if this endpoint allows API key auth
    const allowApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      API_KEY_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    // In test mode, always attempt to resolve API key if present (regardless of decorator)
    const isTestMode = this.configService.get<string>("NODE_ENV") === "test";
    const shouldResolveApiKey = allowApiKeyAuth || isTestMode;

    if (!shouldResolveApiKey) {
      // This guard only handles API key auth for decorated endpoints (or all endpoints in test mode)
      return true;
    }

    // Check for API key header
    const apiKey = request.headers["x-api-key"] as string;

    if (!apiKey) {
      // No API key provided, let other guards handle it
      return true;
    }

    // Validate the API key
    const keyInfo = await this.apiKeyService.validateApiKey(apiKey);

    if (!keyInfo) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Set user info from API key
    request.user = {
      sub: keyInfo.userId,
      email: keyInfo.userEmail,
      roles: [],
    };

    return true;
  }
}
