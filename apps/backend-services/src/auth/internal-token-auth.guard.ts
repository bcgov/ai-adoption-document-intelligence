import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";
import {
  INTERNAL_TOKEN_HEADER,
  InternalTokenService,
} from "./internal-token.service";

/**
 * Authenticates requests carrying an `x-internal-token` header — the
 * short-lived, group-scoped credentials `InternalTokenService` mints for
 * the agent's HTTP self-calls (this slice) and the worker's `dyn.run`
 * callbacks (slice 05). See Change W.
 *
 * Additive branch in the guard chain: registered after `ApiKeyAuthGuard`
 * and before `IdentityGuard`. It mirrors the API-key guard's shape —
 * internal tokens are machine credentials, so they are accepted only on
 * endpoints that opted into machine auth via
 * `@Identity({ allowApiKey: true })` — and attaches the validated binding
 * as `request.internalToken` for `IdentityGuard` to enrich into a
 * group-scoped `resolvedIdentity`. Requests without the header, and the
 * existing JWT / API-key paths, pass through untouched.
 *
 * No per-IP failure throttling (unlike the API-key guard): a token is 32
 * random bytes with a short TTL, so online guessing is not a realistic
 * surface, and the callers are our own server-side fetch loops.
 */
@Injectable()
export class InternalTokenAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly internalTokenService: InternalTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const identityOptions = this.reflector.getAllAndOverride<
      IdentityOptions | undefined
    >(IDENTITY_KEY, [context.getHandler(), context.getClass()]);

    if (!identityOptions?.allowApiKey) {
      // Machine auth is not allowed here — leave the request untouched.
      // Without another credential it fails in IdentityGuard exactly as an
      // unauthenticated request always has.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Another credential already authenticated this request — JWT
    // (request.user, set by JwtAuthGuard) or API key (request.apiKey, set
    // by ApiKeyAuthGuard). Those paths stay byte-identical in behaviour.
    if (request.user || request.apiKey) {
      return true;
    }

    const rawToken = request.headers[INTERNAL_TOKEN_HEADER];
    if (typeof rawToken !== "string" || rawToken.length === 0) {
      return true;
    }

    const validated = await this.internalTokenService.validate(rawToken);
    if (validated === null) {
      // Unknown or expired. The raw token is deliberately not echoed
      // anywhere — not in the message, not in the logs.
      throw new UnauthorizedException("Invalid internal token");
    }

    request.internalToken = validated;
    return true;
  }
}
