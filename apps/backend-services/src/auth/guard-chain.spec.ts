/**
 * The global guards, run in the order AuthModule registers them.
 *
 * Each guard has its own spec. This one catches what those cannot: a guard
 * early in the chain refusing a credential that a later guard exists to
 * accept. The guard list and its order come from AuthModule itself, so
 * reordering the registrations runs through here too.
 */
import { CanActivate, Controller, ExecutionContext, Get } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { APP_GUARD, Reflector } from "@nestjs/core";
import type { ApiKeyService } from "@/actor/api-key.service";
import type { UserService } from "@/actor/user.service";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { AuthModule } from "./auth.module";
import { CsrfGuard } from "./csrf.guard";
import { Identity } from "./identity.decorator";
import { IdentityGuard } from "./identity.guard";
import type {
  InternalTokenService,
  ValidatedInternalToken,
} from "./internal-token.service";
import { InternalTokenAuthGuard } from "./internal-token-auth.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller()
class MachineAuthController {
  @Get()
  @Identity({ allowApiKey: true })
  read(): void {}
}

const TOKENS: Record<string, ValidatedInternalToken> = {
  "custom-step-token": { groupId: "g-1", userId: null, purpose: "dyn-run" },
  "agent-token": {
    groupId: "g-1",
    userId: "actor-1",
    purpose: "agent-self-call",
  },
};

type GuardClass = new (...args: never[]) => CanActivate;

/** The APP_GUARD classes AuthModule registers, in registration order. */
function registeredGuards(): GuardClass[] {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];
  return providers
    .filter(
      (p): p is { provide: unknown; useClass: GuardClass } =>
        typeof p === "object" &&
        p !== null &&
        "provide" in p &&
        p.provide === APP_GUARD,
    )
    .map((p) => p.useClass);
}

describe("global guard chain", () => {
  const reflector = new Reflector();
  const apiKeyGuard = new ApiKeyAuthGuard(reflector, {
    validateApiKey: jest.fn().mockResolvedValue(null),
  } as unknown as ApiKeyService);
  const instances = new Map<GuardClass, CanActivate>([
    [JwtAuthGuard, new JwtAuthGuard(reflector)],
    [ApiKeyAuthGuard, apiKeyGuard],
    [
      InternalTokenAuthGuard,
      new InternalTokenAuthGuard(reflector, {
        validate: jest.fn(async (raw: string) => TOKENS[raw] ?? null),
      } as unknown as InternalTokenService),
    ],
    [IdentityGuard, new IdentityGuard(reflector, {} as unknown as UserService)],
    [CsrfGuard, new CsrfGuard()],
  ]);

  afterAll(() => apiKeyGuard.onModuleDestroy());

  async function runChain(request: Record<string, unknown>): Promise<void> {
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => MachineAuthController.prototype.read,
      getClass: () => MachineAuthController,
    } as unknown as ExecutionContext;
    for (const guardClass of registeredGuards()) {
      const guard = instances.get(guardClass);
      if (!guard) {
        throw new Error(`No test instance for ${guardClass.name}`);
      }
      expect(await guard.canActivate(context)).toBe(true);
    }
  }

  const tokenRequest = (token: string): Record<string, unknown> => ({
    method: "GET",
    headers: { "x-internal-token": token },
    cookies: {},
  });

  it("covers every guard AuthModule registers", () => {
    expect(registeredGuards().length).toBeGreaterThan(0);
    for (const guardClass of registeredGuards()) {
      expect(instances.has(guardClass)).toBe(true);
    }
  });

  it("lets a custom step's token through, as the custom-step actor", async () => {
    const request = tokenRequest("custom-step-token");
    await runChain(request);
    expect(request.resolvedIdentity).toMatchObject({
      actorId: "internal:dyn-run",
      groupRoles: { "g-1": "EDITOR" },
    });
  });

  it("lets the agent's token through, as the person it was minted for", async () => {
    const request = tokenRequest("agent-token");
    await runChain(request);
    expect(request.resolvedIdentity).toMatchObject({ actorId: "actor-1" });
  });

  it("refuses an unknown token at the token check", async () => {
    await expect(runChain(tokenRequest("not-a-token"))).rejects.toThrow(
      "Invalid internal token",
    );
  });
});
