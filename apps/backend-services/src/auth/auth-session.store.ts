import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";

interface StoredTokens {
  tokens: TokenResponseDto;
  expiresAt: number;
}

interface StoredPKCEState {
  state: string;
  codeVerifier: string;
  nonce: string;
  expiresAt: number;
}

/**
 * Lightweight in-memory store for short-lived auth results and PKCE state.
 * Each entry is consumed exactly once by the SPA immediately after OAuth redirect.
 * This avoids persisting sessions server-side while still preventing token leakage in URLs.
 */
@Injectable()
export class AuthSessionStore {
  private readonly ttlMs: number;
  private readonly store = new Map<string, StoredTokens>();
  private readonly pkceStore = new Map<string, StoredPKCEState>();

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
  save(tokens: TokenResponseDto): string {
    const id = randomUUID();
    this.store.set(id, {
      tokens,
      expiresAt: Date.now() + this.ttlMs,
    });
    return id;
  }

  /**
   * Saves PKCE state for the duration of the OAuth flow.
   */
  savePKCEState(state: string, codeVerifier: string, nonce: string): void {
    this.pkceStore.set(state, {
      state,
      codeVerifier,
      nonce,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Retrieves and deletes stored PKCE state.
   */
  consumePKCEState(state: string): { codeVerifier: string; nonce: string } {
    const entry = this.pkceStore.get(state);
    if (!entry || entry.expiresAt < Date.now()) {
      this.pkceStore.delete(state);
      throw new NotFoundException("PKCE state expired or invalid");
    }

    this.pkceStore.delete(state);
    return {
      codeVerifier: entry.codeVerifier,
      nonce: entry.nonce,
    };
  }

  /**
   * Reads and immediately deletes a stored token bundle.
   */
  consume(id: string): TokenResponseDto {
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
    for (const [state, entry] of this.pkceStore.entries()) {
      if (entry.expiresAt < now) {
        this.pkceStore.delete(state);
      }
    }
  }
}

