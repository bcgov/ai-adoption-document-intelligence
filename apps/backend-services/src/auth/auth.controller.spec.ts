import { Test, TestingModule } from "@nestjs/testing";
import { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { GroupService } from "../group/group.service";
import { AuthController } from "./auth.controller";
import { AuthService, LoginUrlResult } from "./auth.service";
import { AUTH_COOKIE_NAMES, COOKIE_OPTIONS } from "./cookie-auth.utils";
import { OAuthCallbackQueryDto } from "./dto";
import { TokenResponseDto } from "./dto/token-response.dto";
import { User } from "./types";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let groupService: jest.Mocked<GroupService>;
  let databaseService: jest.Mocked<Pick<DatabaseService, "isUserSystemAdmin">>;
  let res: jest.Mocked<Response>;
  let req: Partial<Request>;

  beforeEach(async () => {
    authService = {
      refreshAccessToken: jest.fn(),
      getLoginUrl: jest.fn(),
      getLogoutUrl: jest.fn(),
      handleCallback: jest.fn(),
      buildErrorRedirect: jest.fn(),
      getFrontendUrl: jest.fn().mockReturnValue("http://localhost:3000"),
      decodeIdToken: jest.fn().mockReturnValue({}),
      upsertUserFromToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthService>;

    groupService = {
      getUserGroups: jest.fn().mockResolvedValue([]),
      getAllGroups: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<GroupService>;

    databaseService = {
      isUserSystemAdmin: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<Pick<DatabaseService, "isUserSystemAdmin">>;

    res = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as jest.Mocked<Response>;

    req = {
      cookies: {},
      user: undefined,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: GroupService, useValue: groupService },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe("refreshToken", () => {
    it("should read refresh_token from cookie and return expires_in", async () => {
      req.cookies = {
        [AUTH_COOKIE_NAMES.REFRESH_TOKEN]: "refresh-token-value",
      };
      authService.refreshAccessToken.mockResolvedValue({
        access_token: "new-access",
        refresh_token: "new-refresh",
        id_token: "new-id",
        expires_in: 3600,
        token_type: "Bearer",
      } as unknown as TokenResponseDto);

      const result = await controller.refreshToken(
        req as Request,
        res as Response,
      );

      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        "refresh-token-value",
      );
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.ACCESS_TOKEN,
        "new-access",
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({ expires_in: 3600 });
    });

    it("should throw UnauthorizedException when no refresh_token cookie", async () => {
      req.cookies = {};

      await expect(
        controller.refreshToken(req as Request, res as Response),
      ).rejects.toThrow("No refresh token available");
    });
  });

  describe("getLoginUrl", () => {
    it("should set PKCE cookie and redirect to login url", async () => {
      const loginResult: LoginUrlResult = {
        url: "https://auth.example.com/authorize",
        state: "test-state",
        codeVerifier: "test-verifier",
        nonce: "test-nonce",
      };
      authService.getLoginUrl.mockResolvedValue(loginResult);

      await controller.getLoginUrl(res as Response);

      expect(authService.getLoginUrl).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.PKCE_VERIFIER,
        expect.stringContaining("test-state"),
        expect.objectContaining({
          httpOnly: true,
          path: "/api/auth/callback",
        }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        "https://auth.example.com/authorize",
      );
    });

    it("should return 500 if error", async () => {
      authService.getLoginUrl.mockRejectedValue(new Error("OIDC error"));

      await controller.getLoginUrl(res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to generate login URL",
      });
    });
  });

  describe("logout", () => {
    it("should read id_token from cookie, clear cookies, and redirect", async () => {
      req.cookies = { [AUTH_COOKIE_NAMES.ID_TOKEN]: "id-token-value" };
      authService.getLogoutUrl.mockReturnValue(
        "https://auth.example.com/logout",
      );

      await controller.logout(req as Request, res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.ACCESS_TOKEN,
        { path: "/" },
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.REFRESH_TOKEN,
        {
          path: "/api/auth/refresh",
        },
      );
      expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAMES.ID_TOKEN, {
        path: "/api/auth",
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.CSRF_TOKEN,
        { path: "/" },
      );
      expect(authService.getLogoutUrl).toHaveBeenCalledWith("id-token-value");
      expect(res.redirect).toHaveBeenCalledWith(
        "https://auth.example.com/logout",
      );
    });

    it("should work without id_token cookie", async () => {
      req.cookies = {};
      authService.getLogoutUrl.mockReturnValue(
        "https://auth.example.com/logout",
      );

      await controller.logout(req as Request, res as Response);

      expect(authService.getLogoutUrl).toHaveBeenCalledWith(undefined);
      expect(res.redirect).toHaveBeenCalledWith(
        "https://auth.example.com/logout",
      );
    });

    it("should return 500 if error", async () => {
      req.cookies = {};
      authService.getLogoutUrl.mockImplementation(() => {
        throw new Error("fail");
      });

      await controller.logout(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to generate logout URL",
      });
    });
  });

  describe("oauthCallback", () => {
    it("should read PKCE cookie, exchange code, set auth cookies, and redirect", async () => {
      const pkceData = {
        state: "test-state",
        codeVerifier: "test-verifier",
        nonce: "test-nonce",
      };
      req.cookies = {
        [AUTH_COOKIE_NAMES.PKCE_VERIFIER]: JSON.stringify(pkceData),
      };
      authService.handleCallback.mockResolvedValue({
        access_token: "access-token",
        refresh_token: "refresh-token",
        id_token: "id-token",
        expires_in: 3600,
        token_type: "Bearer",
      } as unknown as TokenResponseDto);

      const query: OAuthCallbackQueryDto = {
        code: "auth-code",
        state: "test-state",
        iss: "https://auth.example.com/realms/test",
      };

      await controller.oauthCallback(query, req as Request, res as Response);

      expect(authService.handleCallback).toHaveBeenCalledWith(
        "auth-code",
        "test-state",
        "test-verifier",
        "test-nonce",
        "https://auth.example.com/realms/test",
      );
      // Should clear PKCE cookie
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.PKCE_VERIFIER,
        { path: "/api/auth/callback" },
      );
      // Should set auth cookies
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.ACCESS_TOKEN,
        "access-token",
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.REFRESH_TOKEN,
        "refresh-token",
        expect.objectContaining({ httpOnly: true }),
      );
      // Should redirect to frontend
      expect(res.redirect).toHaveBeenCalledWith("http://localhost:3000");
    });

    it("should throw when PKCE cookie is missing", async () => {
      req.cookies = {};
      authService.buildErrorRedirect.mockReturnValue(
        "http://localhost:3000?auth_error=callback_failed",
      );

      const query: OAuthCallbackQueryDto = { code: "c", state: "s" };
      await controller.oauthCallback(query, req as Request, res as Response);

      expect(authService.buildErrorRedirect).toHaveBeenCalledWith(
        "callback_failed",
      );
      expect(res.redirect).toHaveBeenCalledWith(
        "http://localhost:3000?auth_error=callback_failed",
      );
    });

    it("should redirect to error on state mismatch and clear PKCE cookie", async () => {
      const pkceData = {
        state: "expected-state",
        codeVerifier: "verifier",
        nonce: "nonce",
      };
      req.cookies = {
        [AUTH_COOKIE_NAMES.PKCE_VERIFIER]: JSON.stringify(pkceData),
      };
      authService.buildErrorRedirect.mockReturnValue(
        "http://localhost:3000?auth_error=callback_failed",
      );

      const query: OAuthCallbackQueryDto = {
        code: "c",
        state: "wrong-state",
      };
      await controller.oauthCallback(query, req as Request, res as Response);

      // PKCE cookie should be cleared even on state mismatch
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.PKCE_VERIFIER,
        { path: "/api/auth/callback" },
      );
      expect(authService.buildErrorRedirect).toHaveBeenCalledWith(
        "callback_failed",
      );
      expect(res.redirect).toHaveBeenCalledWith(
        "http://localhost:3000?auth_error=callback_failed",
      );
    });

    it("should redirect to error on callback exception", async () => {
      const pkceData = {
        state: "test-state",
        codeVerifier: "verifier",
        nonce: "nonce",
      };
      req.cookies = {
        [AUTH_COOKIE_NAMES.PKCE_VERIFIER]: JSON.stringify(pkceData),
      };
      authService.handleCallback.mockRejectedValue(new Error("fail"));
      authService.buildErrorRedirect.mockReturnValue("/error");

      const query: OAuthCallbackQueryDto = {
        code: "c",
        state: "test-state",
      };
      await controller.oauthCallback(query, req as Request, res as Response);

      expect(authService.buildErrorRedirect).toHaveBeenCalledWith(
        "callback_failed",
      );
      expect(res.redirect).toHaveBeenCalledWith("/error");
    });
  });

  describe("getMe", () => {
    it("should return user profile with groups from JWT payload", async () => {
      const user: User = {
        sub: "user-123",
        name: "Test User",
        preferred_username: "testuser",
        email: "test@example.com",
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      req.user = user;
      const userGroups = [{ id: "group-1", name: "Group One" }];
      groupService.getUserGroups.mockResolvedValue(userGroups);

      const result = await controller.getMe(req as Request);

      expect(databaseService.isUserSystemAdmin).toHaveBeenCalledWith(
        "user-123",
      );
      expect(groupService.getUserGroups).toHaveBeenCalledWith("user-123");
      expect(result).toEqual({
        sub: "user-123",
        name: "Test User",
        preferred_username: "testuser",
        email: "test@example.com",
        roles: ["admin"],
        expires_in: expect.any(Number),
        groups: userGroups,
      });
      expect(result.expires_in).toBeGreaterThan(0);
      expect(result.expires_in).toBeLessThanOrEqual(3600);
    });

    it("should return empty groups array for user with no memberships", async () => {
      const user: User = {
        sub: "user-456",
        roles: [],
        exp: Math.floor(Date.now() / 1000) + 100,
      };
      req.user = user;
      groupService.getUserGroups.mockResolvedValue([]);

      const result = await controller.getMe(req as Request);

      expect(result.sub).toBe("user-456");
      expect(result.name).toBeUndefined();
      expect(result.preferred_username).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.roles).toEqual([]);
      expect(result.groups).toEqual([]);
    });

    it("should return all groups for a system-admin user", async () => {
      const user: User = {
        sub: "admin-user",
        name: "Admin User",
        roles: ["system-admin"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      req.user = user;
      const allGroups = [
        { id: "group-1", name: "Group One" },
        { id: "group-2", name: "Group Two" },
      ];
      (databaseService.isUserSystemAdmin as jest.Mock).mockResolvedValue(true);
      groupService.getAllGroups.mockResolvedValue(allGroups);

      const result = await controller.getMe(req as Request);

      expect(databaseService.isUserSystemAdmin).toHaveBeenCalledWith(
        "admin-user",
      );
      expect(groupService.getAllGroups).toHaveBeenCalled();
      expect(groupService.getUserGroups).not.toHaveBeenCalled();
      expect(result.groups).toEqual(allGroups);
    });

    it("should return 0 expires_in if token is expired", async () => {
      const user: User = {
        sub: "user-789",
        roles: [],
        exp: Math.floor(Date.now() / 1000) - 100, // expired
      };
      req.user = user;

      const result = await controller.getMe(req as Request);

      expect(result.expires_in).toBe(0);
      expect(result.groups).toEqual([]);
    });
  });
});
