import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as client from "openid-client";
import { AuthService } from "./auth.service";
import { AuthSessionStore } from "./auth-session.store";

// Mock openid-client
jest.mock("openid-client");

describe("AuthService", () => {
  let service: AuthService;
  let configService: ConfigService;
  let authSessionStore: AuthSessionStore;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          SSO_AUTH_SERVER_URL: "https://auth.example.com",
          SSO_REALM: "test-realm",
          SSO_CLIENT_ID: "client-id",
          SSO_CLIENT_SECRET: "client-secret",
          SSO_REDIRECT_URI: "http://localhost:3002/api/auth/callback",
          FRONTEND_URL: "http://localhost:3000",
          SSO_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000",
        };
        return config[key];
      }),
    } as any;

    authSessionStore = {
      save: jest.fn().mockReturnValue("result-id"),
      consume: jest.fn().mockReturnValue({
        access_token: "token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
      savePKCEState: jest.fn(),
      consumePKCEState: jest.fn().mockReturnValue({
        codeVerifier: "code-verifier",
        nonce: "nonce",
      }),
    } as any;

    // Mock openid-client functions
    (client.discovery as jest.Mock) = jest.fn().mockResolvedValue({
      issuer: "https://auth.example.com/realms/test-realm",
      authorization_endpoint: "https://auth.example.com/realms/test-realm/protocol/openid-connect/auth",
      token_endpoint: "https://auth.example.com/realms/test-realm/protocol/openid-connect/token",
    });
    (client.randomPKCECodeVerifier as jest.Mock) = jest.fn().mockReturnValue("code-verifier");
    (client.calculatePKCECodeChallenge as jest.Mock) = jest.fn().mockResolvedValue("code-challenge");
    (client.randomState as jest.Mock) = jest.fn().mockReturnValue("state");
    (client.randomNonce as jest.Mock) = jest.fn().mockReturnValue("nonce");
    (client.buildAuthorizationUrl as jest.Mock) = jest.fn().mockReturnValue(
      new URL("https://auth.example.com/realms/test-realm/protocol/openid-connect/auth?client_id=client-id")
    );
    (client.authorizationCodeGrant as jest.Mock) = jest.fn().mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      id_token: "id-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
    (client.refreshTokenGrant as jest.Mock) = jest.fn().mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      id_token: "new-id-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: configService },
        { provide: AuthSessionStore, useValue: authSessionStore },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    
    // Initialize the service (calls onModuleInit)
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should throw if config missing", () => {
      (configService.get as jest.Mock).mockReturnValueOnce(undefined);
      expect(() => new AuthService(configService, authSessionStore)).toThrow(
        "SSO_AUTH_SERVER_URL and SSO_REALM must be configured"
      );
    });

    it("should throw if client credentials missing", () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        const config: Record<string, string> = {
          SSO_AUTH_SERVER_URL: "https://auth.example.com",
          SSO_REALM: "test-realm",
          SSO_CLIENT_ID: "", // Missing
          SSO_CLIENT_SECRET: "",
        };
        return config[key];
      });
      expect(() => new AuthService(configService, authSessionStore)).toThrow(
        "SSO_CLIENT_ID and SSO_CLIENT_SECRET must be configured"
      );
    });
  });

  describe("onModuleInit", () => {
    it("should discover OIDC endpoints", async () => {
      expect(client.discovery).toHaveBeenCalledWith(
        expect.any(URL),
        "client-id",
        "client-secret"
      );
    });

    it("should throw if discovery fails", async () => {
      const newService = new AuthService(configService, authSessionStore);
      (client.discovery as jest.Mock).mockRejectedValueOnce(new Error("Discovery failed"));
      
      await expect(newService.onModuleInit()).rejects.toThrow(
        /Failed to discover OIDC endpoints/
      );
    });
  });

  describe("getLoginUrl", () => {
    it("should build login url with PKCE", async () => {
      const url = await service.getLoginUrl();
      
      expect(client.randomPKCECodeVerifier).toHaveBeenCalled();
      expect(client.calculatePKCECodeChallenge).toHaveBeenCalledWith("code-verifier");
      expect(client.randomState).toHaveBeenCalled();
      expect(client.randomNonce).toHaveBeenCalled();
      expect(authSessionStore.savePKCEState).toHaveBeenCalledWith(
        "state",
        "code-verifier",
        "nonce"
      );
      expect(client.buildAuthorizationUrl).toHaveBeenCalled();
      expect(url).toContain("auth.example.com");
    });
  });

  describe("getLogoutUrl", () => {
    it("should build logout url with id_token_hint", () => {
      const url = service.getLogoutUrl("idtoken");
      expect(url).toContain("id_token_hint=idtoken");
      expect(url).toContain("post_logout_redirect_uri");
    });

    it("should build logout url without id_token_hint", () => {
      const url = service.getLogoutUrl();
      expect(url).toContain("post_logout_redirect_uri");
      expect(url).not.toContain("id_token_hint");
    });
  });

  describe("handleCallback", () => {
    it("should handle callback with PKCE validation", async () => {
      const result = await service.handleCallback("auth-code", "state");
      
      expect(authSessionStore.consumePKCEState).toHaveBeenCalledWith("state");
      expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(URL),
        expect.objectContaining({
          pkceCodeVerifier: "code-verifier",
          expectedNonce: "nonce",
          expectedState: "state",
        })
      );
      expect(authSessionStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
        })
      );
      expect(result).toBe("result-id");
    });

    it("should throw on callback failure", async () => {
      (client.authorizationCodeGrant as jest.Mock).mockRejectedValueOnce(
        new Error("Invalid code")
      );
      
      await expect(service.handleCallback("bad-code", "state")).rejects.toThrow(
        /OAuth callback failed/
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh access token using openid-client", async () => {
      const result = await service.refreshAccessToken("old-refresh-token");
      
      expect(client.refreshTokenGrant).toHaveBeenCalledWith(
        expect.anything(),
        "old-refresh-token"
      );
      expect(result).toEqual({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        id_token: "new-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    });

    it("should throw on refresh failure", async () => {
      (client.refreshTokenGrant as jest.Mock).mockRejectedValueOnce(
        new Error("Invalid refresh token")
      );
      
      await expect(service.refreshAccessToken("bad-token")).rejects.toThrow(
        /Failed to refresh access token/
      );
    });
  });

  describe("consumeAuthResult", () => {
    it("should consume auth result", () => {
      const result = service.consumeAuthResult("result-id");
      expect(result).toHaveProperty("access_token");
      expect(authSessionStore.consume).toHaveBeenCalledWith("result-id");
    });
  });

  describe("buildAuthResultRedirect", () => {
    it("should build auth result redirect", () => {
      const url = service.buildAuthResultRedirect("result-id");
      expect(url).toContain("auth_result=result-id");
    });
  });

  describe("buildErrorRedirect", () => {
    it("should build error redirect", () => {
      const url = service.buildErrorRedirect("fail");
      expect(url).toContain("auth_error=fail");
    });
  });
});
