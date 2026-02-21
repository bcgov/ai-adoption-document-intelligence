import { Test, TestingModule } from "@nestjs/testing";
import { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  AuthResultQueryDto,
  LogoutQueryDto,
  OAuthCallbackQueryDto,
  RefreshTokenDto,
} from "./dto";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let res: jest.Mocked<Response>;

  beforeEach(async () => {
    authService = {
      refreshAccessToken: jest.fn(),
      getLoginUrl: jest.fn(),
      getLogoutUrl: jest.fn(),
      handleCallback: jest.fn(),
      buildAuthResultRedirect: jest.fn(),
      buildErrorRedirect: jest.fn(),
      consumeAuthResult: jest.fn(),
    } as any;
    res = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
  });

  describe("refreshToken", () => {
    it("should return tokens from service", async () => {
      const dto: RefreshTokenDto = { refresh_token: "refresh" };
      authService.refreshAccessToken.mockResolvedValue({
        access_token: "a",
        refresh_token: "r",
        id_token: "i",
        expires_in: 123,
        token_type: "Bearer",
      });
      const result = await controller.refreshToken(dto);
      expect(authService.refreshAccessToken).toHaveBeenCalledWith("refresh");
      expect(result).toEqual({
        access_token: "a",
        refresh_token: "r",
        id_token: "i",
        expires_in: 123,
      });
    });
  });

  describe("getLoginUrl", () => {
    it("should redirect to login url", async () => {
      authService.getLoginUrl.mockResolvedValue("http://login");
      await controller.getLoginUrl(res);
      expect(authService.getLoginUrl).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith("http://login");
    });

    it("should return 500 if error", async () => {
      authService.getLoginUrl.mockRejectedValue(new Error());
      await controller.getLoginUrl(res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });

  describe("logout", () => {
    it("should redirect to logout url", async () => {
      authService.getLogoutUrl.mockReturnValue("http://logout");
      const query: LogoutQueryDto = { id_token_hint: "idtoken" };
      await controller.logout(query, res);
      expect(authService.getLogoutUrl).toHaveBeenCalledWith("idtoken");
      expect(res.redirect).toHaveBeenCalledWith("http://logout");
    });

    it("should return 500 if error", async () => {
      authService.getLogoutUrl.mockImplementation(() => {
        throw new Error();
      });
      await controller.logout({ id_token_hint: "idtoken" }, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });

  describe("oauthCallback", () => {
    it("should handle callback and redirect", async () => {
      authService.handleCallback.mockResolvedValue("resultId");
      authService.buildAuthResultRedirect.mockReturnValue("/redirect");
      const query: OAuthCallbackQueryDto = {
        code: "c",
        state: "s",
        iss: "https://auth.example.com/realms/test",
      };
      await controller.oauthCallback(query, res);
      expect(authService.handleCallback).toHaveBeenCalledWith(
        "c",
        "s",
        "https://auth.example.com/realms/test",
      );
      expect(authService.buildAuthResultRedirect).toHaveBeenCalledWith(
        "resultId",
      );
      expect(res.redirect).toHaveBeenCalledWith("/redirect");
    });

    it("should pass undefined iss when not provided", async () => {
      authService.handleCallback.mockResolvedValue("resultId");
      authService.buildAuthResultRedirect.mockReturnValue("/redirect");
      const query: OAuthCallbackQueryDto = { code: "c", state: "s" };
      await controller.oauthCallback(query, res);
      expect(authService.handleCallback).toHaveBeenCalledWith(
        "c",
        "s",
        undefined,
      );
    });

    it("should redirect to error if exception", async () => {
      authService.handleCallback.mockRejectedValue(new Error("fail"));
      authService.buildErrorRedirect.mockReturnValue("/error");
      const query: OAuthCallbackQueryDto = { code: "c", state: "s" };
      await controller.oauthCallback(query, res);
      expect(authService.buildErrorRedirect).toHaveBeenCalledWith(
        "callback_failed",
      );
      expect(res.redirect).toHaveBeenCalledWith("/error");
    });
  });

  describe("consumeResult", () => {
    it("should return result from service", async () => {
      authService.consumeAuthResult.mockReturnValue({
        access_token: "token",
        expires_in: 3600,
        token_type: "Bearer",
      });
      const query: AuthResultQueryDto = { result: "uuid" };
      const result = await controller.consumeResult(query);
      expect(authService.consumeAuthResult).toHaveBeenCalledWith("uuid");
      expect(result).toEqual({
        access_token: "token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    });
  });
});
