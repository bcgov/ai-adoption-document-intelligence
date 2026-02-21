import { Response } from "express";
import {
  COOKIE_OPTIONS,
  AUTH_COOKIE_NAMES,
  setAuthCookies,
  clearAuthCookies,
  generateCsrfToken,
} from "./cookie-auth.utils";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";

describe("cookie-auth.utils", () => {
  describe("COOKIE_OPTIONS.csrfToken", () => {
    it("should include maxAge matching the provided expiresInSeconds", () => {
      const expiresIn = 3600;
      const options = COOKIE_OPTIONS.csrfToken(expiresIn);

      expect(options.maxAge).toBe(expiresIn * 1000);
    });

    it("should NOT be httpOnly (readable by frontend JS)", () => {
      const options = COOKIE_OPTIONS.csrfToken(300);

      expect(options.httpOnly).toBe(false);
    });

    it("should use sameSite strict", () => {
      const options = COOKIE_OPTIONS.csrfToken(300);

      expect(options.sameSite).toBe("strict");
    });

    it("should set path to /", () => {
      const options = COOKIE_OPTIONS.csrfToken(300);

      expect(options.path).toBe("/");
    });

    it("should scale maxAge correctly for different expiry values", () => {
      expect(COOKIE_OPTIONS.csrfToken(60).maxAge).toBe(60_000);
      expect(COOKIE_OPTIONS.csrfToken(300).maxAge).toBe(300_000);
      expect(COOKIE_OPTIONS.csrfToken(86400).maxAge).toBe(86_400_000);
    });
  });

  describe("COOKIE_OPTIONS.accessToken", () => {
    it("should have maxAge matching expiresInSeconds", () => {
      const options = COOKIE_OPTIONS.accessToken(3600);

      expect(options.maxAge).toBe(3_600_000);
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe("/");
    });
  });

  describe("setAuthCookies", () => {
    let res: jest.Mocked<Response>;
    const tokens: TokenResponseDto = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      id_token: "test-id-token",
      expires_in: 3600,
      token_type: "Bearer",
    };

    beforeEach(() => {
      res = {
        cookie: jest.fn(),
      } as unknown as jest.Mocked<Response>;
    });

    it("should set CSRF cookie with maxAge matching token expires_in", () => {
      setAuthCookies(res, tokens, "csrf-token-value");

      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.CSRF_TOKEN,
        "csrf-token-value",
        expect.objectContaining({
          httpOnly: false,
          sameSite: "strict",
          path: "/",
          maxAge: 3_600_000,
        }),
      );
    });

    it("should set access token cookie with matching maxAge", () => {
      setAuthCookies(res, tokens, "csrf-token-value");

      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.ACCESS_TOKEN,
        "test-access-token",
        expect.objectContaining({
          httpOnly: true,
          maxAge: 3_600_000,
          path: "/",
        }),
      );
    });

    it("should use default 300s when expires_in is missing", () => {
      const tokensNoExpiry: TokenResponseDto = {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 0,
      };

      setAuthCookies(res, tokensNoExpiry, "csrf");

      // expires_in defaults to 300 when falsy
      expect(res.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.CSRF_TOKEN,
        "csrf",
        expect.objectContaining({ maxAge: 300_000 }),
      );
    });

    it("should set all four cookies (access, refresh, id, csrf)", () => {
      setAuthCookies(res, tokens, "csrf-value");

      const cookieNames = (res.cookie as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(cookieNames).toContain(AUTH_COOKIE_NAMES.ACCESS_TOKEN);
      expect(cookieNames).toContain(AUTH_COOKIE_NAMES.REFRESH_TOKEN);
      expect(cookieNames).toContain(AUTH_COOKIE_NAMES.ID_TOKEN);
      expect(cookieNames).toContain(AUTH_COOKIE_NAMES.CSRF_TOKEN);
    });
  });

  describe("clearAuthCookies", () => {
    it("should clear all auth cookies including CSRF", () => {
      const res = {
        clearCookie: jest.fn(),
      } as unknown as jest.Mocked<Response>;

      clearAuthCookies(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.ACCESS_TOKEN,
        { path: "/" },
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.REFRESH_TOKEN,
        { path: "/api/auth/refresh" },
      );
      expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAMES.ID_TOKEN, {
        path: "/api/auth",
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAMES.CSRF_TOKEN,
        { path: "/" },
      );
    });
  });

  describe("generateCsrfToken", () => {
    it("should return a 64-char hex string", () => {
      const token = generateCsrfToken();

      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).not.toBe(token2);
    });
  });
});
