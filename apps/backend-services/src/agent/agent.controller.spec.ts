import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import type { Request, Response } from "express";
import type { AbortFlagMap } from "./abort-flag-map";
import { AgentController } from "./agent.controller";
import { AgentEnv } from "./agent.env";
import type { AgentService } from "./agent.service";
import { AgentChatRequestDto } from "./dto/agent-chat-request.dto";

// Controller behaviour: auth scoping + delegation, with the service mocked.
// (Request-body validation is covered in dto/agent-chat-request.dto.spec.ts.)
describe("AgentController", () => {
  /** Environment the controller's `AgentEnv` is built from, per test. */
  let envValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    envValues = {
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_ENDPOINT: "https://example.invalid",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5.4",
      // Present but blank — the shape the repo-root `.env` actually has.
      ANTHROPIC_API_KEY: "",
    };
  });

  function makeController() {
    const pipe = jest.fn();
    const agentService = {
      startChat: jest.fn().mockResolvedValue({
        conversationId: "c1",
        streamResult: { pipeUIMessageStreamToResponse: pipe },
      }),
      listConversationsForCaller: jest.fn().mockResolvedValue([{ id: "c1" }]),
      getConversationForCaller: jest
        .fn()
        .mockResolvedValue({ conversation: { id: "c1" }, messages: [] }),
      deleteConversationForCaller: jest.fn().mockResolvedValue(undefined),
    };
    const abortFlags = { abort: jest.fn().mockReturnValue(true) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const env = new AgentEnv({
      get: <T = unknown>(key: string, defaultValue?: T): T =>
        (envValues[key] ?? defaultValue) as T,
    } as unknown as ConfigService);
    const controller = new AgentController(
      agentService as unknown as AgentService,
      abortFlags as unknown as AbortFlagMap,
      config as unknown as ConfigService,
      env,
    );
    return { controller, agentService, abortFlags, pipe };
  }

  function reqWith(identity: unknown, extra: Partial<Request> = {}): Request {
    return {
      resolvedIdentity: identity,
      body: {},
      headers: { "x-api-key": "k1" },
      query: {},
      ...extra,
    } as unknown as Request;
  }

  const member = {
    actorId: "u1",
    isSystemAdmin: false,
    groupRoles: { g1: "member" },
  };

  it("chat: starts a chat, sets x-conversation-id, and pipes the stream", async () => {
    const { controller, agentService, pipe } = makeController();
    const res = { setHeader: jest.fn() } as unknown as Response;
    const body = plainToInstance(AgentChatRequestDto, { messages: [] });

    await controller.chat(
      reqWith(member, { body: { messages: [] } }),
      res,
      body,
    );

    expect(agentService.startChat).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("x-conversation-id", "c1");
    expect(pipe).toHaveBeenCalledTimes(1);
  });

  it("listConversations: wraps the service result in { items }", async () => {
    const { controller } = makeController();
    const result = await controller.listConversations(reqWith(member));
    expect(result).toEqual({ items: [{ id: "c1" }] });
  });

  it("throws Unauthorized when there is no resolved identity", async () => {
    const { controller } = makeController();
    await expect(
      controller.listConversations(reqWith(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws Unauthorized when a system-admin omits groupId", async () => {
    const { controller } = makeController();
    const admin = { actorId: "admin", isSystemAdmin: true };
    await expect(
      controller.listConversations(reqWith(admin)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("abort: verifies visibility then signals the abort flag", async () => {
    const { controller, agentService, abortFlags } = makeController();
    const result = await controller.abortConversation(reqWith(member), "c1");
    expect(agentService.getConversationForCaller).toHaveBeenCalledWith(
      "c1",
      "u1",
      "g1",
    );
    expect(abortFlags.abort).toHaveBeenCalledWith("c1");
    expect(result).toEqual({ ok: true, aborted: true });
  });

  it("getConversation: scopes the lookup to the caller AND their group", async () => {
    const { controller, agentService } = makeController();
    await controller.getConversation(reqWith(member), "c1");
    // The group half is what keeps item 24's demo visibility from leaking
    // one group's seeded transcripts into another's.
    expect(agentService.getConversationForCaller).toHaveBeenCalledWith(
      "c1",
      "u1",
      "g1",
    );
  });

  // ITEM 23 — the picker renders this list verbatim, so it must describe what
  // the backend can serve and nothing else.
  it("listModels: reports the configured Azure deployment, flagged default", () => {
    const { controller } = makeController();
    expect(controller.listModels()).toEqual({
      items: [
        {
          provider: "azure",
          model: "gpt-5.4",
          label: "Azure OpenAI — gpt-5.4",
          name: "gpt-5.4",
          tier: "Balanced",
          isDefault: true,
        },
      ],
      missingConfig: [
        { provider: "anthropic", variables: ["ANTHROPIC_API_KEY"] },
      ],
    });
  });

  it("listModels: omits a provider whose key is present but blank", () => {
    const { controller } = makeController();
    const providers = controller
      .listModels()
      .items.map((item) => item.provider);
    expect(providers).not.toContain("anthropic");
  });

  // I1 / D4, 2026-08-14. An empty `items` is a real answer — "no provider has
  // credentials here" — and used to be indistinguishable from a failed list
  // request, so the drawer said "Server default model" and left the composer
  // live over a server that could not answer at all.
  it("listModels: says WHICH variables are missing when nothing is configured", () => {
    envValues = {};
    const { controller } = makeController();
    const result = controller.listModels();

    expect(result.items).toEqual([]);
    expect(result.missingConfig).toEqual([
      { provider: "anthropic", variables: ["ANTHROPIC_API_KEY"] },
      {
        provider: "azure",
        variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
      },
    ]);
  });

  it("listModels: the controller still answers when no provider is configured", () => {
    // The point of the change: an unconfigured environment yields a working
    // app with a disabled assistant, not a backend that refuses to boot.
    envValues = {};
    expect(() => makeController()).not.toThrow();
  });

  it("chat: gives the stream a real error describer, not the SDK's silence", async () => {
    const { controller, pipe } = makeController();
    const res = { setHeader: jest.fn() } as unknown as Response;
    const body = plainToInstance(AgentChatRequestDto, { messages: [] });

    await controller.chat(
      reqWith(member, { body: { messages: [] } }),
      res,
      body,
    );

    // Item 22: without an `onError` the AI SDK masks every mid-stream
    // failure as "An error occurred." — the response headers are already
    // sent, so this callback is the only way the cause reaches the user.
    const options = pipe.mock.calls[0][1] as {
      onError?: (error: unknown) => string;
    };
    expect(typeof options.onError).toBe("function");
    const described = options.onError?.(
      Object.assign(new Error("Access denied"), { statusCode: 401 }),
    );
    expect(described).toContain("HTTP 401");
  });
});
