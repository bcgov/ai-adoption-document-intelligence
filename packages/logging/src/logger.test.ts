/**
 * Tests for shared logging module (feature-docs/007-logging-system).
 * Covers LOG_LEVEL, NDJSON shape, redaction, child context, and no-throw behavior.
 */

import { createLogger, getLogLevel } from "./logger";

const SERVICE = "test-service";

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

describe("getLogLevel", () => {
  const orig = process.env.LOG_LEVEL;

  afterEach(() => {
    if (orig !== undefined) process.env.LOG_LEVEL = orig;
    else delete process.env.LOG_LEVEL;
  });

  it("returns info when LOG_LEVEL is unset", () => {
    delete process.env.LOG_LEVEL;
    expect(getLogLevel()).toBe("info");
  });

  it("returns info when LOG_LEVEL is invalid", () => {
    process.env.LOG_LEVEL = "trace";
    expect(getLogLevel()).toBe("info");
  });

  it("returns the level when LOG_LEVEL is debug, info, warn, or error", () => {
    for (const level of ["debug", "info", "warn", "error"]) {
      process.env.LOG_LEVEL = level;
      expect(getLogLevel()).toBe(level);
    }
  });

  it("is case-insensitive", () => {
    process.env.LOG_LEVEL = "DEBUG";
    expect(getLogLevel()).toBe("debug");
  });
});

describe("createLogger", () => {
  const orig = process.env.LOG_LEVEL;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "production"; // tests assert NDJSON; dev mode uses pretty format
  });

  afterEach(() => {
    if (orig !== undefined) process.env.LOG_LEVEL = orig;
    else delete process.env.LOG_LEVEL;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
  });

  describe("NDJSON output", () => {
    it("emits one line of JSON with timestamp, level, service, message", () => {
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("hello");
        expect(out.lines).toHaveLength(1);
        const entry = parseLastLine(out.lines);
        expect(entry.timestamp).toBeDefined();
        expect(typeof entry.timestamp).toBe("string");
        expect(entry.level).toBe("info");
        expect(entry.service).toBe(SERVICE);
        expect(entry.message).toBe("hello");
      } finally {
        out.restore();
      }
    });

    it("includes context in the emitted object", () => {
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("done", { documentId: "doc-1", durationMs: 10 });
        const entry = parseLastLine(out.lines);
        expect(entry.message).toBe("done");
        expect(entry.documentId).toBe("doc-1");
        expect(entry.durationMs).toBe(10);
      } finally {
        out.restore();
      }
    });
  });

  describe("LOG_LEVEL filtering", () => {
    it("does not emit debug when LOG_LEVEL is info", () => {
      process.env.LOG_LEVEL = "info";
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.debug("debug only");
        expect(out.lines).toHaveLength(0);
      } finally {
        out.restore();
      }
    });

    it("emits info, warn, error when LOG_LEVEL is info", () => {
      process.env.LOG_LEVEL = "info";
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("i");
        log.warn("w");
        log.error("e");
        expect(out.lines).toHaveLength(3);
        expect(parseLastLine([out.lines[0]]).level).toBe("info");
        expect(parseLastLine([out.lines[1]]).level).toBe("warn");
        expect(parseLastLine([out.lines[2]]).level).toBe("error");
      } finally {
        out.restore();
      }
    });

    it("emits only warn and error when LOG_LEVEL is warn", () => {
      process.env.LOG_LEVEL = "warn";
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.debug("d");
        log.info("i");
        log.warn("w");
        log.error("e");
        expect(out.lines).toHaveLength(2);
        expect(parseLastLine([out.lines[0]]).level).toBe("warn");
        expect(parseLastLine([out.lines[1]]).level).toBe("error");
      } finally {
        out.restore();
      }
    });
  });

  describe("redaction", () => {
    it("redacts apiKey, token, authorization in context", () => {
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("auth", {
          apiKey: "secret-key",
          token: "jwt-xxx",
          userId: "u1",
        });
        const entry = parseLastLine(out.lines);
        expect(entry.apiKey).toBe("[REDACTED]");
        expect(entry.token).toBe("[REDACTED]");
        expect(entry.authorization).toBeUndefined();
        expect(entry.userId).toBe("u1");
      } finally {
        out.restore();
      }
    });

    it("redacts Authorization (capitalized) and password", () => {
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("login", {
          Authorization: "Bearer x",
          password: "pwd",
          requestId: "r1",
        });
        const entry = parseLastLine(out.lines);
        expect(entry.Authorization).toBe("[REDACTED]");
        expect(entry.password).toBe("[REDACTED]");
        expect(entry.requestId).toBe("r1");
      } finally {
        out.restore();
      }
    });
  });

  describe("child logger", () => {
    it("merges base context into every log line", () => {
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE, { requestId: "req-1" });
        log.info("step1");
        log.info("step2", { event: "done" });
        expect(out.lines).toHaveLength(2);
        expect(parseLastLine([out.lines[0]]).requestId).toBe("req-1");
        const second = parseLastLine([out.lines[1]]);
        expect(second.requestId).toBe("req-1");
        expect(second.event).toBe("done");
      } finally {
        out.restore();
      }
    });

    it("child() returns a logger with merged context", () => {
      const out = captureStdout();
      try {
        const parent = createLogger(SERVICE, { workflowExecutionId: "wf-1" });
        const child = parent.child({ activity: "myActivity" });
        child.info("activity ran");
        const entry = parseLastLine(out.lines);
        expect(entry.workflowExecutionId).toBe("wf-1");
        expect(entry.activity).toBe("myActivity");
        expect(entry.message).toBe("activity ran");
      } finally {
        out.restore();
      }
    });
  });

  describe("development mode", () => {
    it("emits pretty one-line format when NODE_ENV is development", () => {
      process.env.NODE_ENV = "development";
      const out = captureStdout();
      try {
        const log = createLogger(SERVICE);
        log.info("hello");
        expect(out.lines).toHaveLength(1);
        const line = out.lines[0];
        expect(line).toContain("INFO");
        expect(line).toContain(SERVICE);
        expect(line).toContain("hello");
        expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
        expect(() => JSON.parse(line)).toThrow(); // not NDJSON
      } finally {
        out.restore();
        if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });
  });

  describe("failure behavior", () => {
    it("does not throw when stdout.write throws", () => {
      const original = process.stdout.write;
      process.stdout.write = () => {
        throw new Error("write failed");
      };
      try {
        const log = createLogger(SERVICE);
        expect(() => log.info("test")).not.toThrow();
      } finally {
        process.stdout.write = original;
      }
    });

    it("does not throw when stdout.write calls callback with error", () => {
      const original = process.stdout.write;
      process.stdout.write = ((_chunk: unknown, cb: (err?: Error) => void) => {
        cb(new Error("write failed"));
        return true;
      }) as typeof process.stdout.write;
      try {
        const log = createLogger(SERVICE);
        expect(() => log.info("test")).not.toThrow();
      } finally {
        process.stdout.write = original;
      }
    });
  });
});
