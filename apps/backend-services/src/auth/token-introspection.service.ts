import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createHash } from "crypto";
import * as client from "openid-client";
import { AuthService } from "./auth.service";

/**
 * Cached introspection result for a single token.
 */
interface CacheEntry {
  active: boolean;
  expiresAt: number;
}

/** How long introspection results are cached (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** How often stale cache entries are swept (5 minutes). */
const CACHE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Service that checks whether a JWT access token has been revoked by Keycloak
 * via the OAuth 2.0 Token Introspection endpoint (RFC 7662).
 *
 * Results are cached in-memory by SHA-256 hash of the token for 5 minutes.
 * On introspection failure (network error, Keycloak unavailability), the service
 * fails open — the request is allowed through because the JWT has already been
 * signature-validated by Passport. Introspection is defense-in-depth.
 */
@Injectable()
export class TokenIntrospectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenIntrospectionService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private sweepInterval: ReturnType<typeof setInterval> | undefined;
  private oidcConfig: client.Configuration;

  constructor(private readonly authService: AuthService) {}

  onModuleInit() {
    this.oidcConfig = this.authService.getOidcConfig();
    this.sweepInterval = setInterval(
      () => this.sweepExpiredEntries(),
      CACHE_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
    }
    this.cache.clear();
  }

  /**
   * Checks whether the given access token is still active according to Keycloak.
   * Returns `true` if active (or on error — fail-open), `false` if revoked.
   */
  async isTokenActive(token: string): Promise<boolean> {
    const cacheKey = this.hashToken(token);

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.active;
    }

    try {
      const result = await client.tokenIntrospection(this.oidcConfig, token);
      const active = result.active === true;

      this.cache.set(cacheKey, {
        active,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return active;
    } catch (error) {
      this.logger.warn(
        `Token introspection failed, allowing request (fail-open): ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      // Fail open — JWT is already signature-validated
      return true;
    }
  }

  /**
   * SHA-256 hash of the token, used as the cache key.
   * Avoids storing raw tokens in memory.
   */
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Removes expired entries from the cache to prevent memory leaks.
   */
  private sweepExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
