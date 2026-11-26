import {
  type ArgumentsHost,
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, BaseExceptionFilter } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import * as request from "supertest";
import { AppLoggerService } from "./app-logger.service";
import { RequestFailureLoggingFilter } from "./request-failure-logging.filter";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

const mockLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
} as unknown as AppLoggerService;

const makeRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  method: "GET",
  path: "/api/does-not-exist",
  headers: {},
  ...overrides,
});

@Controller("logging-test")
class LoggingTestController {
  /**
   * Returns a successful response for completion logging.
   * @returns A test response.
   */
  @Get()
  success(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Throws inside the handler, after the interceptor starts.
   * @returns Never.
   */
  @Get("forbidden")
  forbidden(): never {
    throw new ForbiddenException();
  }

  /**
   * Exercises rejection by a guard, before the interceptor starts.
   * @returns A test response if the guard allows access.
   */
  @Get("guarded")
  @UseGuards({
    canActivate: () => {
      throw new UnauthorizedException();
    },
  })
  guarded(): { ok: boolean } {
    return { ok: true };
  }
}

describe("Request failure logging HTTP integration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LoggingTestController],
      providers: [
        { provide: AppLoggerService, useValue: mockLogger },
        { provide: APP_FILTER, useClass: RequestFailureLoggingFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("preserves unmatched-route responses and logs the failure once", async () => {
    await request(app.getHttpServer())
      .get("/logging-test/missing")
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({ statusCode: 404 });
      });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it("preserves guard rejections and logs the failure once", async () => {
    await request(app.getHttpServer()).get("/logging-test/guarded").expect(401);

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ statusCode: 401 }),
    );
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it("preserves handler failures without duplicate or successful-status logs", async () => {
    await request(app.getHttpServer())
      .get("/logging-test/forbidden")
      .expect(403);

    expect(mockLogger.log).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Request completed",
      expect.objectContaining({ statusCode: 403 }),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("leaves successful requests unchanged", async () => {
    await request(app.getHttpServer())
      .get("/logging-test")
      .expect(200, { ok: true });

    expect(mockLogger.log).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

const makeHost = (
  request: Partial<Request>,
  type: "http" | "rpc" = "http",
): ArgumentsHost =>
  ({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ArgumentsHost;

describe("RequestFailureLoggingFilter", () => {
  let filter: RequestFailureLoggingFilter;
  let superCatch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    superCatch = jest
      .spyOn(BaseExceptionFilter.prototype, "catch")
      .mockImplementation(() => undefined);
    filter = new RequestFailureLoggingFilter(mockLogger);
  });

  afterEach(() => {
    superCatch.mockRestore();
  });

  it("logs a warning for an unmatched route", () => {
    const request = makeRequest();

    filter.catch(new NotFoundException(), makeHost(request));

    expect(mockLogger.warn).toHaveBeenCalledWith("Request failed", {
      method: "GET",
      path: "/api/does-not-exist",
      statusCode: 404,
      errorName: "NotFoundException",
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthorized", new UnauthorizedException(), 401],
    ["forbidden", new ForbiddenException(), 403],
  ])("logs a warning for a %s guard rejection", (_label, exception, status) => {
    filter.catch(exception, makeHost(makeRequest()));

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ statusCode: status }),
    );
  });

  it("logs an error for a non-HTTP exception as a 500", () => {
    filter.catch(new Error("boom"), makeHost(makeRequest()));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({ statusCode: 500, errorName: "Error" }),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("does not log when the interceptor already logged the request", () => {
    const request = makeRequest({ _loggingCompleted: true });

    filter.catch(new NotFoundException(), makeHost(request));

    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("ignores non-HTTP execution contexts", () => {
    filter.catch(new Error("boom"), makeHost(makeRequest(), "rpc"));

    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("always delegates to the base filter so the response is unchanged", () => {
    const exception = new NotFoundException();
    const host = makeHost(makeRequest());

    filter.catch(exception, host);

    expect(superCatch).toHaveBeenCalledWith(exception, host);
  });
});
