import {
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import { Identity } from "@/auth/identity.decorator";
import { ApiKeyService } from "../api-key/api-key.service";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { CsrfGuard } from "./csrf.guard";
import { IdentityGuard } from "./identity.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { DatabaseService } from "../database/database.service";
import { Public } from "./public.decorator";

/**
 * Integration tests for guard composition.
 *
 * These tests verify that different combinations of auth decorators
 * produce correct access-control behavior when the full guard chain
 * (JwtAuthGuard → ApiKeyAuthGuard → IdentityGuard → CsrfGuard) executes.
 *
 * The Passport JWT strategy is replaced with a lightweight stub that
 * validates a known test token, keeping the rest of the guard chain real.
 */

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const VALID_JWT = "valid-jwt-token";
const VALID_API_KEY = "test-prefix.valid-api-key";
const INVALID_API_KEY = "test-prefix.invalid-api-key";

const JWT_USER = {
  sub: "jwt-user-id",
  email: "jwt@example.com",
};

const JWT_ADMIN = {
  sub: "jwt-admin-id",
  email: "admin@example.com",
};

const API_KEY_USER = { groupId: "group-user" };
const API_KEY_ADMIN = { groupId: "group-admin" };

// ---------------------------------------------------------------------------
// Stub: replaces Passport JWT validation with a simple token check.
// We override canActivate on JwtAuthGuard so that `super.canActivate`
// (which would hit the real Passport strategy requiring JWKS) is never called.
// ---------------------------------------------------------------------------

class StubJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    const reflector = (this as unknown as { reflector: Reflector }).reflector;

    // Reproduce the same @Public() / @Identity() routing as the real guard
    const isPublic = reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const identityOptions = reflector.getAllAndOverride<
      { allowApiKey?: boolean } | undefined
    >("identity", [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest();
    const apiKeyHeader = req.headers["x-api-key"];

    if (identityOptions?.allowApiKey && apiKeyHeader) {
      return true;
    }

    // Stub JWT validation: check for our known test tokens
    const authHeader: string | undefined = req.headers["authorization"];
    const cookieToken: string | undefined = req.cookies?.access_token;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : cookieToken;

    if (!token || !token.startsWith("valid-")) {
      throw new UnauthorizedException("Invalid or missing JWT");
    }

    // Determine which user based on the token value
    req.user = token.includes("admin") ? { ...JWT_ADMIN } : { ...JWT_USER };
    return true;
  }
}

// ---------------------------------------------------------------------------
// Test controller: one endpoint per decorator combination
// ---------------------------------------------------------------------------

@Controller("test-guards")
class TestGuardController {
  /** Default — no @Identity decorator, JWT required via guard chain */
  @Get("default")
  getDefault() {
    return { route: "default" };
  }

  /** @Public() — no auth required */
  @Public()
  @Get("public")
  getPublic() {
    return { route: "public" };
  }

  /** @Identity({ allowApiKey: true }) — API key or JWT accepted */
  @Identity({ allowApiKey: true })
  @Get("api-key")
  getApiKey() {
    return { route: "api-key" };
  }

  /** @Identity({ allowApiKey: true }) with POST — also tests CSRF behavior */
  @Identity({ allowApiKey: true })
  @Post("api-key-post")
  postApiKey() {
    return { route: "api-key-post" };
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("Guard Composition Integration", () => {
  let app: INestApplication;

  const mockApiKeyService = {
    validateApiKey: jest.fn(),
  };

  const mockDatabaseService = {
    isUserSystemAdmin: jest.fn().mockResolvedValue(false),
    getUsersGroups: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestGuardController],
      providers: [
        Reflector,
        { provide: APP_GUARD, useClass: StubJwtAuthGuard },
        { provide: APP_GUARD, useClass: ApiKeyAuthGuard },
        { provide: APP_GUARD, useClass: IdentityGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: ApiKeyService, useValue: mockApiKeyService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockApiKeyService.validateApiKey.mockImplementation(
      (key: string): Promise<{ groupId: string } | null> => {
        if (key === VALID_API_KEY) return Promise.resolve(API_KEY_USER);
        if (key === "valid-admin-api-key")
          return Promise.resolve(API_KEY_ADMIN);
        return Promise.resolve(null);
      },
    );

    mockDatabaseService.isUserSystemAdmin.mockResolvedValue(false);
    mockDatabaseService.getUsersGroups.mockResolvedValue([]);
  });

  // =========================================================================
  // Default (no decorators) — JWT only
  // =========================================================================

  describe("GET /test-guards/default (no special decorators)", () => {
    it("should reject with 401 when no credentials provided", () => {
      return request(app.getHttpServer())
        .get("/test-guards/default")
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should allow access with valid JWT", () => {
      return request(app.getHttpServer())
        .get("/test-guards/default")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.OK)
        .expect({ route: "default" });
    });

    it("should reject with 401 when only API key provided (no @ApiKeyAuth decorator)", () => {
      return request(app.getHttpServer())
        .get("/test-guards/default")
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should reject with 401 for invalid JWT", () => {
      return request(app.getHttpServer())
        .get("/test-guards/default")
        .set("Authorization", "Bearer invalid-token")
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // =========================================================================
  // @Public()
  // =========================================================================

  describe("GET /test-guards/public (@Public)", () => {
    it("should allow access with no credentials", () => {
      return request(app.getHttpServer())
        .get("/test-guards/public")
        .expect(HttpStatus.OK)
        .expect({ route: "public" });
    });

    it("should allow access with valid JWT", () => {
      return request(app.getHttpServer())
        .get("/test-guards/public")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.OK);
    });

    it("should allow access with API key (guard chain is a no-op)", () => {
      return request(app.getHttpServer())
        .get("/test-guards/public")
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.OK);
    });

    it("should allow access even with invalid credentials", () => {
      return request(app.getHttpServer())
        .get("/test-guards/public")
        .set("Authorization", "Bearer garbage")
        .expect(HttpStatus.OK);
    });
  });

  // =========================================================================
  // @Identity({ allowApiKey: true }) — accepts either JWT or API key
  // =========================================================================

  describe("GET /test-guards/api-key (@Identity + allowApiKey)", () => {
    it("should reject with 401 when no credentials provided", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key")
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should allow access with valid JWT (no API key)", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.OK)
        .expect({ route: "api-key" });
    });

    it("should allow access with valid API key (no JWT)", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key")
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.OK)
        .expect({ route: "api-key" });
    });

    it("should reject with 401 for invalid API key", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key")
        .set("X-API-Key", INVALID_API_KEY)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should allow access when both valid JWT and valid API key provided", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.OK);
    });
  });

  // =========================================================================
  // @Identity({ allowApiKey: true }) POST — CSRF behavior
  // =========================================================================

  describe("POST /test-guards/api-key-post (@Identity + allowApiKey + POST)", () => {
    it("should allow API key POST without CSRF token (API keys are CSRF-exempt)", () => {
      return request(app.getHttpServer())
        .post("/test-guards/api-key-post")
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.CREATED);
    });

    it("should allow Bearer JWT POST without CSRF token (Bearer is CSRF-exempt)", () => {
      return request(app.getHttpServer())
        .post("/test-guards/api-key-post")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.CREATED);
    });

    it("should reject POST with no credentials", () => {
      return request(app.getHttpServer())
        .post("/test-guards/api-key-post")
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
