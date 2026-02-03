import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import * as jwt from "jsonwebtoken";
import { JwksClient, SigningKey } from "jwks-rsa";
import { AuthService } from "./auth.service";
import { AuthSessionStore } from "./auth-session.store";

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
          AUTH_STATE_SECRET: "state-secret",
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
    } as any;
    jest.spyOn(jwt, "sign").mockImplementation(() => "signed-state" as any);
    jest
      .spyOn(jwt, "verify")
      .mockImplementation(() => ({ nonce: "nonce" }) as any);
    jest
      .spyOn(jwt, "decode")
      .mockImplementation(() => ({ header: { kid: "kid" } }) as any);
    jest.spyOn(JwksClient.prototype, "getSigningKey");
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: configService },
        { provide: AuthSessionStore, useValue: authSessionStore },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should throw if config missing", () => {
      (configService.get as jest.Mock).mockReturnValueOnce(undefined);
      expect(() => new AuthService(configService, authSessionStore)).toThrow();
    });
  });

  describe("getLoginUrl", () => {
    it("should build login url", () => {
      const url = service.getLoginUrl();
      expect(url).toContain("client_id=client-id");
      expect(url).toContain(
        "redirect_uri=" +
          encodeURIComponent("http://localhost:3002/api/auth/callback"),
      );
    });
  });

  describe("getLogoutUrl", () => {
    it("should build logout url", () => {
      const url = service.getLogoutUrl("idtoken");
      expect(url).toContain("id_token_hint=idtoken");
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

  describe("createStateToken", () => {
    it("should create a state token and nonce", () => {
      const { state, nonce } = (service as any).createStateToken();
      expect(state).toBe("signed-state");
      expect(nonce).toBeDefined();
    });
  });

  describe("verifyStateToken", () => {
    it("should verify a valid state token and return nonce", () => {
      const { state } = (service as any).createStateToken();
      const verified = (service as any).verifyStateToken(state);
      expect(verified.nonce).toBe("nonce");
    });

    it("should throw on invalid state token", () => {
      (jwt.verify as jest.Mock).mockImplementationOnce(() => {
        throw new Error();
      });
      expect(() => (service as any).verifyStateToken("bad")).toThrow();
    });
  });

  describe("handleCallback", () => {
    it("should handle callback and save session", async () => {
      jest
        .spyOn(service, "exchangeCodeForTokens")
        .mockResolvedValue({ id_token: "idtoken" } as any);
      jest
        .spyOn(service as any, "validateIdTokenNonce")
        .mockResolvedValue(undefined);
      const result = await service.handleCallback("code", "state");
      expect(result).toBe("result-id");
      expect(authSessionStore.save).toHaveBeenCalled();
    });
  });

  describe("consumeAuthResult", () => {
    it("should consume auth result", () => {
      const result = service.consumeAuthResult("result-id");
      expect(result).toHaveProperty("access_token");
      expect(authSessionStore.consume).toHaveBeenCalledWith("result-id");
    });
  });

  describe("validateIdTokenNonce", () => {
    it("should throw on invalid id token nonce", async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: {} });
      await expect(
        (service as any).validateIdTokenNonce("bad", "nonce"),
      ).rejects.toThrow();
    });

    it("should throw on nonce mismatch", async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: "kid" } });
      jest
        .spyOn(JwksClient.prototype, "getSigningKey")
        .mockResolvedValue({ getPublicKey: () => "key" } as unknown as never);
      (jwt.verify as jest.Mock).mockReturnValue({ nonce: "wrong" });
      // This error message is because it's caught and re-thrown. Maybe should rethink this implementation
      await expect(
        (service as any).validateIdTokenNonce("idtoken", "expectedNonce"),
      ).rejects.toThrow("Invalid ID token");
    });

    it("should throw HttpException on error", async () => {
      (jwt.decode as jest.Mock).mockImplementation(() => {
        throw new Error("decode fail");
      });
      await expect(
        (service as any).validateIdTokenNonce("idtoken", "nonce"),
      ).rejects.toThrow("Invalid ID token");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should return response data on success", async () => {
      const mockData = { access_token: "abc", id_token: "def" };
      jest.spyOn(axios, "post").mockResolvedValueOnce({ data: mockData });
      const result = await service.exchangeCodeForTokens("code", "identifier");
      expect(result).toEqual(mockData);
    });

    it("should throw HttpException on axios error", async () => {
      jest.spyOn(axios, "post").mockRejectedValueOnce(new Error("fail"));
      await expect(service.exchangeCodeForTokens("code")).rejects.toThrow(
        "Failed to exchange authorization code for tokens",
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("should return response data on success", async () => {
      const mockData = { access_token: "abc", id_token: "def" };
      jest.spyOn(axios, "post").mockResolvedValueOnce({ data: mockData });
      const result = await service.refreshAccessToken("refreshToken");
      expect(result).toEqual(mockData);
    });

    it("should throw HttpException on axios error", async () => {
      jest.spyOn(axios, "post").mockRejectedValueOnce(new Error("fail"));
      await expect(service.refreshAccessToken("refreshToken")).rejects.toThrow(
        "Failed to refresh access token",
      );
    });
  });
});
