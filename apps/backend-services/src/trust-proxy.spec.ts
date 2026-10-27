import { Controller, Get, Req } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import * as request from "supertest";
import { applyTrustProxy } from "./trust-proxy";

@Controller("test")
class IpController {
  @Get("ip")
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

describe("applyTrustProxy", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [IpController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    applyTrustProxy(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const ipFor = async (forwardedFor?: string): Promise<string> => {
    const req = request(app.getHttpServer()).get("/test/ip");
    const res = await (forwardedFor
      ? req.set("X-Forwarded-For", forwardedFor)
      : req);
    return res.body.ip;
  };

  it("takes the caller's address the router appended", async () => {
    await expect(ipFor("142.22.10.5")).resolves.toBe("142.22.10.5");
  });

  it("skips the router's private address that nginx appended", async () => {
    await expect(ipFor("142.22.10.5, 10.128.4.2")).resolves.toBe("142.22.10.5");
  });

  it("ignores an address the caller sent ahead of the one the router appended", async () => {
    await expect(ipFor("6.6.6.6, 142.22.10.5")).resolves.toBe("142.22.10.5");
  });

  it("gives two callers behind the same proxies different addresses", async () => {
    const [first, second] = await Promise.all([
      ipFor("142.22.10.5, 10.128.4.2"),
      ipFor("142.30.7.9, 10.128.4.2"),
    ]);
    expect(first).not.toBe(second);
  });

  it("uses the connection's own address without X-Forwarded-For", async () => {
    await expect(ipFor()).resolves.toMatch(/127\.0\.0\.1$|^::1$/);
  });
});
