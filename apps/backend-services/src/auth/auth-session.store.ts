import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type { TokenResponse } from "./auth.service";

interface StoredTokens {
  tokens: TokenResponse;
  expiresAt: number;
}

/**
 * Lightweight in-memory store for short-lived auth results.
 * Each entry is consumed exactly once by the SPA immediately after OAuth redirect.
 * This avoids persisting sessions server-side while still preventing token leakage in URLs.
 */
@Injectable()
export class AuthSessionStore {
  private readonly ttlMs: number;
  private readonly store = new Map<string, StoredTokens>();

  constructor(private configService: ConfigService) {
    const ttlSeconds = Number(
      this.configService.get<string>("AUTH_RESULT_TTL_SECONDS") ?? "60",
    );
    this.ttlMs = ttlSeconds * 1000;

    // Background sweeper keeps the map from growing unbounded if the SPA never redeems an id.
    setInterval(() => this.cleanupExpired(), this.ttlMs).unref();
  }

  /**
   * Saves provider tokens and returns a one-time opaque identifier.
   */
  save(tokens: TokenResponse): string {
    const id = randomUUID();
    this.store.set(id, {
      tokens,
      expiresAt: Date.now() + this.ttlMs,
    });
    return id;
  }

  /**
   * Reads and immediately deletes a stored token bundle.
   */
  consume(id: string): TokenResponse {
    const entry = this.store.get(id);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(id);
      throw new NotFoundException("Auth result expired or invalid");
    }

    this.store.delete(id);
    return entry.tokens;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(id);
      }
    }
  }
}
