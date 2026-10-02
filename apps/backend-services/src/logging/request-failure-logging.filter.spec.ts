import {
  type ArgumentsHost,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Request } from "express";
import type { AppLoggerService } from "./app-logger.service";
import { RequestFailureLoggingFilter } from "./request-failure-logging.filter";

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
