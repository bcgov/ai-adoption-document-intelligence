import {
  getDatabaseConnectionString,
  getPrismaPgOptions,
} from "./database-url";

describe("database-url", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getDatabaseConnectionString", () => {
    it("returns empty string when url is undefined", () => {
      expect(getDatabaseConnectionString(undefined)).toBe("");
    });

    it("returns url unchanged when PGSSLMODE is not set", () => {
      delete process.env.PGSSLMODE;
      expect(
        getDatabaseConnectionString("postgresql://user:pass@host/db"),
      ).toBe("postgresql://user:pass@host/db");
    });

    it("appends sslmode and uselibpqcompat when PGSSLMODE is set", () => {
      process.env.PGSSLMODE = "require";
      const result = getDatabaseConnectionString(
        "postgresql://user:pass@host/db",
      );
      expect(result).toContain("sslmode=require");
      expect(result).toContain("uselibpqcompat=true");
    });

    it("returns url unchanged when URL parsing throws", () => {
      process.env.PGSSLMODE = "require";
      const invalidUrl = "not-a-valid-url";
      expect(getDatabaseConnectionString(invalidUrl)).toBe(invalidUrl);
    });
  });

  describe("getPrismaPgOptions", () => {
    it("returns connectionString and no ssl when PGSSLREJECTUNAUTHORIZED is not false", () => {
      delete process.env.PGSSLREJECTUNAUTHORIZED;
      const result = getPrismaPgOptions("postgresql://localhost/db");
      expect(result.connectionString).toBe("postgresql://localhost/db");
      expect(result.ssl).toBeUndefined();
    });

    it("returns ssl.rejectUnauthorized false when PGSSLREJECTUNAUTHORIZED is false", () => {
      process.env.PGSSLREJECTUNAUTHORIZED = "false";
      const result = getPrismaPgOptions("postgresql://localhost/db");
      expect(result.ssl).toEqual({ rejectUnauthorized: false });
    });

    it("does not add ssl when PGSSLREJECTUNAUTHORIZED is true", () => {
      process.env.PGSSLREJECTUNAUTHORIZED = "true";
      const result = getPrismaPgOptions("postgresql://localhost/db");
      expect(result.ssl).toBeUndefined();
    });
  });
});
