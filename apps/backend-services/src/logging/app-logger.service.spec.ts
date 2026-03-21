import { AppLoggerService } from "./app-logger.service";
import { requestContext } from "./request-context";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string | Buffer, ...args: unknown[]) => {
    const line = typeof chunk === "string" ? chunk : chunk.toString();
    lines.push(line.trimEnd());
    const cb = typeof args[0] === "function" ? args[0] : () => {};
    (cb as (err?: Error) => void)();
    return true;
  }) as typeof process.stdout.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

function parseLastLine(lines: string[]): Record<string, unknown> {
  const last = lines[lines.length - 1];
  if (!last) throw new Error("No lines captured");
  return JSON.parse(last) as Record<string, unknown>;
}

describe("AppLoggerService", () => {
  const orig = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    if (orig !== undefined) process.env.LOG_LEVEL = orig;
    else delete process.env.LOG_LEVEL;
  });

  it("includes sessionId in log output when present in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-1",
        userId: "user-1",
        sessionId: "session-abc-123",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.sessionId).toBe("session-abc-123");
        expect(entry.requestId).toBe("req-1");
        expect(entry.userId).toBe("user-1");
      });
    } finally {
      out.restore();
    }
  });

  it("omits sessionId from log output when not in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-2",
        userId: "user-2",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.sessionId).toBeUndefined();
        expect(entry.requestId).toBe("req-2");
      });
    } finally {
      out.restore();
    }
  });

  it("omits sessionId from log output for unauthenticated requests (no context)", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      service.log("public request");
      const entry = parseLastLine(out.lines);
      expect(entry.sessionId).toBeUndefined();
    } finally {
      out.restore();
    }
  });

  it("includes clientIp in log output when present in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-3",
        clientIp: "203.0.113.50",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.clientIp).toBe("203.0.113.50");
        expect(entry.requestId).toBe("req-3");
      });
    } finally {
      out.restore();
    }
  });

  it("omits clientIp from log output when not in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-4",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.clientIp).toBeUndefined();
      });
    } finally {
      out.restore();
    }
  });

  it("includes apiKeyId in log output when present in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-5",
        apiKeyId: "aBcDeFgH",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.apiKeyId).toBe("aBcDeFgH");
        expect(entry.requestId).toBe("req-5");
      });
    } finally {
      out.restore();
    }
  });

  it("omits apiKeyId from log output when not in request context", () => {
    const out = captureStdout();
    try {
      const service = new AppLoggerService();
      const store = {
        requestId: "req-6",
        sessionId: "session-xyz",
      };
      requestContext.run(store, () => {
        service.log("test message");
        const entry = parseLastLine(out.lines);
        expect(entry.apiKeyId).toBeUndefined();
        expect(entry.sessionId).toBe("session-xyz");
      });
    } finally {
      out.restore();
    }
  });
});
