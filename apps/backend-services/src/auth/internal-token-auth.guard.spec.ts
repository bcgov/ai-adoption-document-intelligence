import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";
import type {
  InternalTokenService,
  ValidatedInternalToken,
} from "./internal-token.service";
import { InternalTokenAuthGuard } from "./internal-token-auth.guard";

describe("InternalTokenAuthGuard", () => {
  const createContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const createReflector = (
    identityOptions: IdentityOptions | undefined,
  ): Reflector =>
    ({
      getAllAndOverride: jest
        .fn()
        .mockImplementation((key: string) =>
          key === IDENTITY_KEY ? identityOptions : undefined,
        ),
    }) as unknown as Reflector;

  function makeGuard(
    identityOptions: IdentityOptions | undefined,
    validateResult: ValidatedInternalToken | null = null,
  ): { guard: InternalTokenAuthGuard; validate: jest.Mock } {
    const validate = jest.fn().mockResolvedValue(validateResult);
    const guard = new InternalTokenAuthGuard(createReflector(identityOptions), {
      validate,
    } as unknown as InternalTokenService);
    return { guard, validate };
  }

  const validBinding: ValidatedInternalToken = {
    groupId: "g-1",
    userId: "actor-1",
    purpose: "agent-self-call",
  };

  it("attaches request.internalToken for a valid token on an allowApiKey endpoint", async () => {
    const { guard, validate } = makeGuard({ allowApiKey: true }, validBinding);
    const request: Record<string, unknown> = {
      headers: { "x-internal-token": "raw-token" },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validate).toHaveBeenCalledWith("raw-token");
    expect(request.internalToken).toEqual(validBinding);
  });

  it("throws 401 for an unknown or expired token (validate → null)", async () => {
    const { guard } = makeGuard({ allowApiKey: true }, null);
    const request: Record<string, unknown> = {
      headers: { "x-internal-token": "expired-or-bogus" },
    };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.internalToken).toBeUndefined();
  });

  it("passes through untouched when the header is absent", async () => {
    const { guard, validate } = makeGuard({ allowApiKey: true }, validBinding);
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(request.internalToken).toBeUndefined();
  });

  it("does not validate on endpoints without allowApiKey (machine auth not opted in)", async () => {
    const { guard, validate } = makeGuard(undefined, validBinding);
    const request: Record<string, unknown> = {
      headers: { "x-internal-token": "raw-token" },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(request.internalToken).toBeUndefined();
  });

  it("defers to an already-authenticated JWT (request.user) — existing path unchanged", async () => {
    const { guard, validate } = makeGuard({ allowApiKey: true }, validBinding);
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user" },
      headers: { "x-internal-token": "raw-token" },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(request.internalToken).toBeUndefined();
  });

  it("defers to an already-validated API key (request.apiKey) — existing path unchanged", async () => {
    const { guard, validate } = makeGuard({ allowApiKey: true }, validBinding);
    const request: Record<string, unknown> = {
      apiKey: { groupId: "g-1", keyPrefix: "abc", actorId: "actor-k" },
      headers: { "x-internal-token": "raw-token" },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(request.internalToken).toBeUndefined();
  });
});
