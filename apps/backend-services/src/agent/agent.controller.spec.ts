import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import type { Request, Response } from "express";
import type { AbortFlagMap } from "./abort-flag-map";
import { AgentController } from "./agent.controller";
import type { AgentService } from "./agent.service";
import { AgentChatRequestDto } from "./dto/agent-chat-request.dto";

// Controller behaviour: auth scoping + delegation, with the service mocked.
// (Request-body validation is covered in dto/agent-chat-request.dto.spec.ts.)
describe("AgentController", () => {
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
    const controller = new AgentController(
      agentService as unknown as AgentService,
      abortFlags as unknown as AbortFlagMap,
      config as unknown as ConfigService,
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
