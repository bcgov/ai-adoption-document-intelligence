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
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { ApiKeyService } from "../api-key/api-key.service";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { CsrfGuard } from "./csrf.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Public } from "./public.decorator";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

/**
 * Integration tests for guard composition.
 *
 * These tests verify that different combinations of auth decorators
 * produce correct access-control behavior when the full guard chain
 * (JwtAuthGuard → ApiKeyAuthGuard → RolesGuard → CsrfGuard) executes.
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
  roles: ["user"],
};

const JWT_ADMIN = {
  sub: "jwt-admin-id",
  email: "admin@example.com",
  roles: ["admin", "user"],
};

const API_KEY_USER = {
  userId: "apikey-user-id",
  userEmail: "apikey@example.com",
  roles: ["user"],
};

const API_KEY_ADMIN = {
  userId: "apikey-admin-id",
  userEmail: "apikey-admin@example.com",
  roles: ["admin", "user"],
};

// ---------------------------------------------------------------------------
// Stub: replaces Passport JWT validation with a simple token check.
// We override canActivate on JwtAuthGuard so that `super.canActivate`
// (which would hit the real Passport strategy requiring JWKS) is never called.
// ---------------------------------------------------------------------------

class StubJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    const reflector = (this as unknown as { reflector: Reflector }).reflector;

    // Reproduce the same @Public() / @ApiKeyAuth() routing as the real guard
    const isPublic = reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowApiKeyAuth = reflector.getAllAndOverride<boolean>(
      "allowApiKeyAuth",
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest();
    const apiKeyHeader = req.headers["x-api-key"];

    if (allowApiKeyAuth && apiKeyHeader) {
      return true;
    }

    // Stub JWT validation: check for our known test tokens
    const authHeader: string | undefined = req.headers["authorization"];
    const cookieToken: string | undefined = req.cookies?.access_token;
    const token =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

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
  /** Default (no decorators) — JWT required */
  @Get("default")
  @KeycloakSSOAuth()
  getDefault() {
    return { route: "default" };
  }

  /** @Public() — no auth required */
  @Public()
  @Get("public")
  getPublic() {
    return { route: "public" };
  }

  /** @ApiKeyAuth() only — API key or JWT accepted */
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @Get("api-key")
  getApiKey() {
    return { route: "api-key" };
  }

  /** @ApiKeyAuth() with POST — also tests CSRF behavior */
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @Post("api-key-post")
  postApiKey() {
    return { route: "api-key-post" };
  }

  /** @Roles('admin') — JWT required + admin role */
  @Roles("admin")
  @KeycloakSSOAuth()
  @Get("roles-admin")
  getRolesAdmin() {
    return { route: "roles-admin" };
  }

  /** @ApiKeyAuth() + @Roles('admin') — either auth method, admin required */
  @ApiKeyAuth()
  @Roles("admin")
  @KeycloakSSOAuth()
  @Get("api-key-roles-admin")
  getApiKeyRolesAdmin() {
    return { route: "api-key-roles-admin" };
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

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestGuardController],
      providers: [
        Reflector,
        { provide: APP_GUARD, useClass: StubJwtAuthGuard },
        { provide: APP_GUARD, useClass: ApiKeyAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: ApiKeyService, useValue: mockApiKeyService },
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
      (key: string): Promise<{
        userId: string;
        userEmail: string;
        roles: string[];
      } | null> => {
        if (key === VALID_API_KEY) return Promise.resolve(API_KEY_USER);
        if (key === "valid-admin-api-key")
          return Promise.resolve(API_KEY_ADMIN);
        return Promise.resolve(null);
      },
    );
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
  // @ApiKeyAuth() — accepts either JWT or API key
  // =========================================================================

  describe("GET /test-guards/api-key (@ApiKeyAuth + @KeycloakSSOAuth)", () => {
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
  // @ApiKeyAuth() POST — CSRF behavior
  // =========================================================================

  describe("POST /test-guards/api-key-post (@ApiKeyAuth + POST)", () => {
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

  // =========================================================================
  // @Roles('admin') — JWT required + role check
  // =========================================================================

  describe("GET /test-guards/roles-admin (@Roles('admin'))", () => {
    it("should reject with 401 when no credentials provided", () => {
      return request(app.getHttpServer())
        .get("/test-guards/roles-admin")
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should allow access for JWT user with admin role", () => {
      return request(app.getHttpServer())
        .get("/test-guards/roles-admin")
        .set("Authorization", "Bearer valid-admin-token")
        .expect(HttpStatus.OK)
        .expect({ route: "roles-admin" });
    });

    it("should reject with 403 for JWT user without admin role", () => {
      return request(app.getHttpServer())
        .get("/test-guards/roles-admin")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it("should reject API key with 401 (no @ApiKeyAuth decorator)", () => {
      return request(app.getHttpServer())
        .get("/test-guards/roles-admin")
        .set("X-API-Key", "valid-admin-api-key")
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // =========================================================================
  // @ApiKeyAuth() + @Roles('admin') — either auth method, admin required
  // =========================================================================

  describe("GET /test-guards/api-key-roles-admin (@ApiKeyAuth + @Roles('admin'))", () => {
    it("should reject with 401 when no credentials provided", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it("should allow JWT admin", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .set("Authorization", "Bearer valid-admin-token")
        .expect(HttpStatus.OK)
        .expect({ route: "api-key-roles-admin" });
    });

    it("should reject JWT user without admin role with 403", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .set("Authorization", `Bearer ${VALID_JWT}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it("should allow API key with admin role", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .set("X-API-Key", "valid-admin-api-key")
        .expect(HttpStatus.OK)
        .expect({ route: "api-key-roles-admin" });
    });

    it("should reject API key without admin role with 403", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .set("X-API-Key", VALID_API_KEY)
        .expect(HttpStatus.FORBIDDEN);
    });

    it("should reject invalid API key with 401", () => {
      return request(app.getHttpServer())
        .get("/test-guards/api-key-roles-admin")
        .set("X-API-Key", INVALID_API_KEY)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
