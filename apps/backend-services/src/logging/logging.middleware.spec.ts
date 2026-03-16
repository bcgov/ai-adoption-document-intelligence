import type { NextFunction, Request, Response } from "express";
import { requestContext } from "./request-context";
import { LoggingMiddleware } from "./logging.middleware";
import { AppLoggerService } from "./app-logger.service";

jest.mock("./request-context", () => ({
  requestContext: { run: jest.fn() },
  getRequestContext: jest.fn(),
}));

const mockRun = requestContext.run as jest.MockedFunction<
  typeof requestContext.run
>;

const mockLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
} as unknown as AppLoggerService;

describe("LoggingMiddleware", () => {
  let middleware: LoggingMiddleware;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = new LoggingMiddleware(mockLogger);

    mockReq = { headers: {} } as Partial<Request>;
    mockRes = { setHeader: jest.fn() } as Partial<Response>;
    mockNext = jest.fn();

    mockRun.mockImplementation((_store, callback) => callback());
  });

  it("sets a UUID request-id header on the request", () => {
    middleware.use(mockReq as Request, mockRes as Response, mockNext);
    const requestId = mockReq.headers?.["x-request-id"];
    expect(typeof requestId).toBe("string");
    expect((requestId as string).length).toBeGreaterThan(0);
  });

  it("sets the x-request-id header on the response", () => {
    middleware.use(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
  });

  it("runs the context store and calls next", () => {
    middleware.use(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
      expect.any(Function),
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it("assigns the same requestId to request header and context store", () => {
    middleware.use(mockReq as Request, mockRes as Response, mockNext);
    const headerRequestId = mockReq.headers?.["x-request-id"];
    const storeArg = mockRun.mock.calls[0][0];
    expect(storeArg.requestId).toBe(headerRequestId);
  });

  it("generates unique requestIds across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const req = { headers: {} } as unknown as Request;
      middleware.use(req, mockRes as Response, mockNext);
      ids.add(req.headers["x-request-id"] as string);
    }
    expect(ids.size).toBe(5);
  });
});
