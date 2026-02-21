import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import helmet from "helmet";
import * as request from "supertest";

/**
 * Integration tests verifying that helmet security headers are applied
 * to HTTP responses from the NestJS application.
 */
describe("Security Headers (helmet)", () => {
  @Controller("test")
  class TestController {
    @Get("hello")
    hello() {
      return { ok: true };
    }
  }

  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = module.createNestApplication();

    // Apply the same helmet configuration as main.ts
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://validator.swagger.io"],
          },
        },
        hsts: {
          maxAge: 31_536_000,
          includeSubDomains: true,
        },
        frameguard: { action: "deny" },
        noSniff: true,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should set X-Content-Type-Options to nosniff", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should set X-Frame-Options to DENY", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("should set Strict-Transport-Security header", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("should set Referrer-Policy header", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("should set Content-Security-Policy header", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    const csp = res.headers["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: https://validator.swagger.io");
  });

  it("should not include X-Powered-By header", async () => {
    const res = await request(app.getHttpServer()).get("/test/hello");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
