import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { BCGovAuthGuard } from "./bcgov-auth.guard";

describe("BCGovAuthGuard", () => {
  let guard: BCGovAuthGuard;
  let configService: jest.Mocked<ConfigService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          SSO_AUTH_SERVER_URL:
            "https://auth.example.com/protocol/openid-connect",
          SSO_REALM: "test-realm",
          SSO_CLIENT_ID: "client-id",
        };
        return config[key];
      }),
    } as any;
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new BCGovAuthGuard(configService, reflector);
    jest
      .spyOn(JwksClient.prototype, "getSigningKey")
      .mockResolvedValue({ getPublicKey: () => "key" } as unknown as never);
    jest
      .spyOn(jwt, "decode")
      .mockImplementation(() => ({ header: { kid: "kid" } }) as any);
    jest.spyOn(jwt, "verify").mockImplementation(
      (token, key, opts) =>
        ({
          idir_username: "u",
          display_name: "d",
          email: "e",
          roles: ["admin"],
        }) as any,
    );
  });

  describe("constructor", () => {
    it("should throw if clientId missing", () => {
      (configService.get as jest.Mock).mockImplementation((key: string) =>
        key === "SSO_CLIENT_ID" ? undefined : "value",
      );
      expect(() => new BCGovAuthGuard(configService, reflector)).toThrow();
    });
  });

  describe("canActivate", () => {
    it("should allow public route", async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context: any = { getHandler: () => {}, getClass: () => {} };
      expect(await guard.canActivate(context)).toBe(true);
    });

    it("should throw Unauthorized if no Bearer token", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      };
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw Forbidden if token validation fails", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jest
        .spyOn(Object.getPrototypeOf(guard), "validateToken")
        .mockRejectedValue(new Error("fail"));
      const context: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: "Bearer token" } }),
        }),
      };
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should attach user and return true if token valid", async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const request: any = { headers: { authorization: "Bearer token" } };
      const context: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({ getRequest: () => request }),
      };
      jest
        .spyOn(Object.getPrototypeOf(guard), "validateToken")
        .mockResolvedValue({ idir_username: "u" });
      expect(await guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({ idir_username: "u" });
    });
  });

  // Weird mocking needed here. Couldn't get them working otherwise.
  describe("validateToken", () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      jest
        .spyOn(JwksClient.prototype, "getSigningKey")
        .mockResolvedValue({ getPublicKey: () => "key" } as unknown as never);
    });
    it("should throw Unauthorized if token format invalid", async () => {
      jest.spyOn(jwt, "decode").mockReturnValue(null);
      await expect(guard["validateToken"]("bad")).rejects.toThrow(
        UnauthorizedException,
      );
    });
    it("should return user if token valid", async () => {
      jest
        .spyOn(jwt, "decode")
        .mockReturnValue({ header: { kid: "kid" } } as any);
      jest
        .spyOn(jwt, "verify")
        .mockReturnValue({ idir_username: "u", roles: ["admin"] } as any);
      const result = await guard["validateToken"]("token");
      expect(result.idir_username).toBe("u");
      expect(result.roles).toContain("admin");
    });
    it("should throw Unauthorized if verification fails", async () => {
      jest.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("fail");
      });
      await expect(guard["validateToken"]("token")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("extractRoles", () => {
    it("should extract roles from payload", () => {
      const payload: any = {
        roles: ["admin"],
        realm_access: { roles: ["user"] },
        resource_access: { client_id: { roles: ["editor"] } },
      };
      const roles = guard["extractRoles"](payload);
      expect(roles).toEqual(
        expect.arrayContaining(["admin", "user", "editor"]),
      );
    });

    it("should handle missing roles gracefully", () => {
      const payload: any = {};
      const roles = guard["extractRoles"](payload);
      expect(roles).toEqual([]);
    });
  });
});
