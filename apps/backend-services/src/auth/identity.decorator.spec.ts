import "reflect-metadata";
import { GroupRole } from "@generated/client";
import { Reflector } from "@nestjs/core";
import { IDENTITY_KEY, Identity, IdentityOptions } from "./identity.decorator";

const SWAGGER_API_SECURITY_KEY = "swagger/apiSecurity";

describe("Identity decorator", () => {
  let reflector: Reflector;

  /**
   * Creates a minimal class with a method decorated by @Identity(options)
   * and returns the method handler so that metadata can be read from it.
   */
  const createHandler = (options: IdentityOptions): (() => void) => {
    class TestController {
      @Identity(options)
      handler() {}
    }
    return TestController.prototype.handler as () => void;
  };

  beforeEach(() => {
    reflector = new Reflector();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Decorator is defined and importable
  // ---------------------------------------------------------------------------

  it("should compile and attach metadata without errors", () => {
    const handler = createHandler({});
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Options object is retrievable as metadata
  // ---------------------------------------------------------------------------

  it("should store and retrieve the exact options object passed to the decorator", () => {
    const options: IdentityOptions = {
      requireSystemAdmin: true,
      groupIdFrom: { param: "groupId" },
      minimumRole: GroupRole.ADMIN,
      allowApiKey: true,
    };
    const handler = createHandler(options);
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata).toEqual(options);
  });

  it("should store options with groupIdFrom using a query field", () => {
    const options: IdentityOptions = {
      groupIdFrom: { query: "group" },
      minimumRole: GroupRole.MEMBER,
    };
    const handler = createHandler(options);
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata).toEqual(options);
  });

  it("should store options with groupIdFrom using a body field", () => {
    const options: IdentityOptions = {
      groupIdFrom: { body: "groupId" },
    };
    const handler = createHandler(options);
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata).toEqual(options);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Decorator can be applied with no options (all defaults)
  // ---------------------------------------------------------------------------

  it("should store an empty options object when @Identity({}) is applied", () => {
    const handler = createHandler({});
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata).toEqual({});
  });

  it("should not set requireSystemAdmin, allowApiKey, groupIdFrom, or minimumRole when options are empty", () => {
    const handler = createHandler({});
    const metadata = reflector.get<IdentityOptions>(IDENTITY_KEY, handler);
    expect(metadata.requireSystemAdmin).toBeUndefined();
    expect(metadata.allowApiKey).toBeUndefined();
    expect(metadata.groupIdFrom).toBeUndefined();
    expect(metadata.minimumRole).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // IDENTITY_KEY constant
  // ---------------------------------------------------------------------------

  it("should export IDENTITY_KEY as a non-empty string constant", () => {
    expect(typeof IDENTITY_KEY).toBe("string");
    expect(IDENTITY_KEY.length).toBeGreaterThan(0);
  });

  it("should retrieve metadata using getAllAndOverride", () => {
    const options: IdentityOptions = {
      requireSystemAdmin: false,
      minimumRole: GroupRole.MEMBER,
    };

    class TestController {
      @Identity(options)
      handler() {}
    }

    const metadata = reflector.getAllAndOverride<IdentityOptions>(
      IDENTITY_KEY,
      [TestController.prototype.handler, TestController],
    );

    expect(metadata).toEqual(options);
  });

  // ---------------------------------------------------------------------------
  // Swagger security metadata (US-009)
  // ---------------------------------------------------------------------------

  it("should apply @ApiBearerAuth('keycloak-sso') by default when no allowApiKey option is set", () => {
    const handler = createHandler({});
    const security: Record<string, string[]>[] = Reflect.getMetadata(
      SWAGGER_API_SECURITY_KEY,
      handler,
    );
    expect(security).toBeDefined();
    expect(security).toEqual(expect.arrayContaining([{ "keycloak-sso": [] }]));
  });

  it("should apply both Bearer auth and api-key security schemes when allowApiKey is true", () => {
    const handler = createHandler({ allowApiKey: true });
    const security: Record<string, string[]>[] = Reflect.getMetadata(
      SWAGGER_API_SECURITY_KEY,
      handler,
    );
    expect(security).toBeDefined();
    expect(security).toEqual(
      expect.arrayContaining([{ "keycloak-sso": [] }, { "api-key": [] }]),
    );
  });

  it("should apply only Bearer auth and not api-key security when allowApiKey is false", () => {
    const handler = createHandler({ allowApiKey: false });
    const security: Record<string, string[]>[] = Reflect.getMetadata(
      SWAGGER_API_SECURITY_KEY,
      handler,
    );
    expect(security).toBeDefined();
    expect(security).toEqual(expect.arrayContaining([{ "keycloak-sso": [] }]));
    const hasApiKey = security.some((scheme) => "api-key" in scheme);
    expect(hasApiKey).toBe(false);
  });

  it("should not apply api-key security scheme when allowApiKey is not set", () => {
    const handler = createHandler({});
    const security: Record<string, string[]>[] = Reflect.getMetadata(
      SWAGGER_API_SECURITY_KEY,
      handler,
    );
    const hasApiKey = (security ?? []).some((scheme) => "api-key" in scheme);
    expect(hasApiKey).toBe(false);
  });
});
