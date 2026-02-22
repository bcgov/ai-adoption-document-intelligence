import { Controller, Get, INestApplication, Post } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { Throttle, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { AuthController } from "./auth.controller";
import {
  THROTTLE_AUTH_LIMIT,
  THROTTLE_AUTH_REFRESH_LIMIT,
  THROTTLE_AUTH_REFRESH_TTL_MS,
  THROTTLE_AUTH_TTL_MS,
} from "./auth.config";

/**
 * Verifies that rate limiting decorators are correctly applied
 * to auth controller endpoints via metadata reflection.
 */
describe("AuthController — Throttle decorators", () => {
  const THROTTLER_LIMIT_KEY = "THROTTLER:LIMIT";
  const THROTTLER_TTL_KEY = "THROTTLER:TTL";

  it("should have @Throttle on refreshToken with configured limit per window", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT_KEY}default`,
      AuthController.prototype.refreshToken,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL_KEY}default`,
      AuthController.prototype.refreshToken,
    );
    expect(limit).toBe(THROTTLE_AUTH_REFRESH_LIMIT);
    expect(ttl).toBe(THROTTLE_AUTH_REFRESH_TTL_MS);
  });

  it("should have @Throttle on getLoginUrl with configured limit per window", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT_KEY}default`,
      AuthController.prototype.getLoginUrl,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL_KEY}default`,
      AuthController.prototype.getLoginUrl,
    );
    expect(limit).toBe(THROTTLE_AUTH_LIMIT);
    expect(ttl).toBe(THROTTLE_AUTH_TTL_MS);
  });

  it("should have @Throttle on logout with configured limit per window", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT_KEY}default`,
      AuthController.prototype.logout,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL_KEY}default`,
      AuthController.prototype.logout,
    );
    expect(limit).toBe(THROTTLE_AUTH_LIMIT);
    expect(ttl).toBe(THROTTLE_AUTH_TTL_MS);
  });

  it("should have @Throttle on oauthCallback with configured limit per window", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT_KEY}default`,
      AuthController.prototype.oauthCallback,
    );
    const ttl = Reflect.getMetadata(
      `${THROTTLER_TTL_KEY}default`,
      AuthController.prototype.oauthCallback,
    );
    expect(limit).toBe(THROTTLE_AUTH_LIMIT);
    expect(ttl).toBe(THROTTLE_AUTH_TTL_MS);
  });

  it("should NOT have a per-route @Throttle on getMe (uses global default)", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT_KEY}default`,
      AuthController.prototype.getMe,
    );
    expect(limit).toBeUndefined();
  });
});

/**
 * Integration-style test: proves ThrottlerGuard actually rejects requests
 * once the limit is exceeded on a minimal controller.
 */
describe("ThrottlerGuard integration", () => {
  // Create a minimal controller with a tight rate limit for testing
  @Controller("test")
  class TestThrottleController {
    @Get("limited")
    @Throttle({ default: { ttl: 60_000, limit: 2 } })
    limited() {
      return { ok: true };
    }

    @Post("strict")
    @Throttle({ default: { ttl: 60_000, limit: 1 } })
    strict() {
      return { ok: true };
    }
  }

  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: "default", ttl: 60_000, limit: 100 }],
        }),
      ],
      controllers: [TestThrottleController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should allow requests within the rate limit", async () => {
    const res = await request(app.getHttpServer()).get("/test/limited");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should include rate limit headers in response", async () => {
    const res = await request(app.getHttpServer()).get("/test/limited");
    expect(res.headers).toHaveProperty("x-ratelimit-limit");
    expect(res.headers).toHaveProperty("x-ratelimit-remaining");
  });

  it("should return 429 when rate limit is exceeded", async () => {
    // First request should succeed
    const first = await request(app.getHttpServer()).post("/test/strict");
    expect(first.status).toBe(201);

    // Second request should be throttled (limit is 1)
    const second = await request(app.getHttpServer()).post("/test/strict");
    expect(second.status).toBe(429);
  });
});
