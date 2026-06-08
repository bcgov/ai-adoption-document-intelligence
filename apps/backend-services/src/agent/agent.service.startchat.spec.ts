import { ForbiddenException } from "@nestjs/common";
import type { OnFinishEvent, StreamTextResult, ToolSet } from "ai";

// Mock the AI SDK boundary so startChat's orchestration is unit-testable
// without a real model. `streamText` captures its options (so we can
// invoke onFinish), and returns a stub stream whose finishReason resolves
// immediately (driving the abort-cleanup `.finally`).
let capturedStreamTextOptions: {
  onFinish?: (event: OnFinishEvent<ToolSet>) => Promise<void> | void;
  abortSignal?: AbortSignal;
} | null = null;

jest.mock("ai", () => {
  const actual = jest.requireActual("ai");
  return {
    ...actual,
    convertToModelMessages: jest.fn(async (msgs: unknown) => msgs),
    streamText: jest.fn((options: unknown) => {
      capturedStreamTextOptions = options as typeof capturedStreamTextOptions;
      return {
        finishReason: Promise.resolve("stop"),
      } as unknown as StreamTextResult<ToolSet, never>;
    }),
  };
});

// Capture the AgentToolContext the service binds so we can drive the
// onWorkflowCreated hook (ctx-binding test).
let capturedToolCtx: import("./tools").AgentToolContext | null = null;
jest.mock("./tools", () => {
  const actual = jest.requireActual("./tools");
  return {
    ...actual,
    createAgentTools: jest.fn((ctx: import("./tools").AgentToolContext) => {
      capturedToolCtx = ctx;
      return {};
    }),
  };
});

import { AbortFlagMap } from "./abort-flag-map";
import type { AgentEnv } from "./agent.env";
import { AgentService } from "./agent.service";
import type { ChatRepository } from "./chat.repository";
import type { ProviderResolver } from "./provider-resolver";

function makeEnv(overrides: Partial<AgentEnv> = {}): AgentEnv {
  return {
    maxSteps: 30,
    maxOutputTokens: 4096,
    maxConversationTokens: 500000,
    maxToolResultChars: 20000,
    ...overrides,
  } as unknown as AgentEnv;
}

interface Harness {
  service: AgentService;
  chatRepository: jest.Mocked<Partial<ChatRepository>>;
  abortFlags: AbortFlagMap;
  setWorkflowId: jest.Mock;
}

function makeHarness(opts: {
  env?: Partial<AgentEnv>;
  conversation?: Record<string, unknown> | null;
  spentTokens?: number;
}): Harness {
  capturedStreamTextOptions = null;
  capturedToolCtx = null;

  const conversation =
    opts.conversation === undefined
      ? {
          id: "conv-1",
          workflowId: null,
          title: "existing",
        }
      : opts.conversation;

  const setWorkflowId = jest.fn().mockResolvedValue(undefined);

  const chatRepository: jest.Mocked<Partial<ChatRepository>> = {
    findConversationByIdForUser: jest.fn().mockResolvedValue(conversation),
    createConversation: jest
      .fn()
      .mockResolvedValue({ id: "conv-new", workflowId: null, title: null }),
    listMessagesForConversation: jest.fn().mockResolvedValue([]),
    createMessage: jest.fn().mockResolvedValue({ id: "m1" }),
    touchLastMessageAt: jest.fn().mockResolvedValue(undefined),
    sumConversationTokens: jest.fn().mockResolvedValue(opts.spentTokens ?? 0),
    setWorkflowId,
  };

  const providerResolver = {
    resolve: jest.fn().mockReturnValue({ provider: "anthropic", model: "m" }),
    buildModel: jest.fn().mockReturnValue({ modelId: "m" }),
  } as unknown as ProviderResolver;

  const abortFlags = new AbortFlagMap();
  const logger = { log: jest.fn(), error: jest.fn() };

  const service = new AgentService(
    makeEnv(opts.env),
    providerResolver,
    chatRepository as unknown as ChatRepository,
    {} as never,
    {} as never,
    abortFlags,
    logger as never,
  );

  return { service, chatRepository, abortFlags, setWorkflowId };
}

function userMsg(text: string) {
  return {
    id: "u1",
    role: "user" as const,
    parts: [{ type: "text", text }],
  };
}

const baseInput = {
  conversationId: "conv-1",
  workflowId: null,
  groupId: "g1",
  actorId: "actor-1",
  apiKey: "key",
  backendBaseUrl: "http://backend",
};

describe("AgentService.startChat — per-conversation budget (ITEM 26)", () => {
  it("refuses a new turn when cumulative spend exceeds the ceiling", async () => {
    const { service } = makeHarness({
      env: { maxConversationTokens: 1000 },
      spentTokens: 1500,
    });

    await expect(
      service.startChat({
        ...baseInput,
        messages: [userMsg("hi")],
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a turn when under the ceiling", async () => {
    const { service } = makeHarness({
      env: { maxConversationTokens: 1000 },
      spentTokens: 200,
    });

    const result = await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    expect(result.conversationId).toBe("conv-1");
    expect(capturedStreamTextOptions).not.toBeNull();
  });
});

describe("AgentService.startChat — onFinish persistence (ITEM 23 + 26)", () => {
  it("persists full assistant parts (tool calls included) and totals tokens", async () => {
    const { service, chatRepository } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("build a workflow")],
    } as never);

    // Simulate the model finishing a 2-step tool loop.
    const finishEvent = {
      text: "done",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
      totalUsage: { inputTokens: 100, outputTokens: 40 },
      steps: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "addNode",
              input: { node: { id: "n1" } },
            },
            {
              type: "tool-result",
              toolCallId: "tc1",
              toolName: "addNode",
              input: { node: { id: "n1" } },
              output: { ok: true },
            },
          ],
        },
        {
          content: [{ type: "text", text: "All set." }],
        },
      ],
    } as unknown as OnFinishEvent<ToolSet>;

    await capturedStreamTextOptions?.onFinish?.(finishEvent);

    // The user turn + the assistant turn are both persisted.
    const assistantCall = (
      chatRepository.createMessage as jest.Mock
    ).mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall).toBeDefined();
    const content = assistantCall[0].content as {
      parts: Array<{ type: string }>;
    };
    expect(content.parts).toEqual([
      {
        type: "dynamic-tool",
        toolName: "addNode",
        toolCallId: "tc1",
        state: "output-available",
        input: { node: { id: "n1" } },
        output: { ok: true },
      },
      { type: "text", text: "All set." },
    ]);
    // Cumulative token totals are recorded from totalUsage.
    expect(assistantCall[0].inputTokens).toBe(100);
    expect(assistantCall[0].outputTokens).toBe(40);
  });
});

describe("AgentService.startChat — abort cleanup (ITEM 24/25)", () => {
  it("scoped cleanup evicts only the current registration after the stream settles", async () => {
    const { service, abortFlags } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    // Wait a tick for the finishReason .finally() to run.
    await new Promise((r) => setImmediate(r));
    // After settle, the registration cleared itself → no controller left.
    expect(abortFlags.abort("conv-1")).toBe(false);
  });

  it("registers an abort signal that the stream receives", async () => {
    const { service } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    expect(capturedStreamTextOptions?.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe("AgentService.startChat — ctx binding via onWorkflowCreated (ITEM 25)", () => {
  it("binds the conversation workflowId when the agent's onWorkflowCreated hook fires", async () => {
    const { service, setWorkflowId } = makeHarness({
      conversation: { id: "conv-1", workflowId: null, title: "t" },
    });
    await service.startChat({
      ...baseInput,
      messages: [userMsg("make a wf")],
    } as never);

    // Not bound until the hook fires.
    expect(setWorkflowId).not.toHaveBeenCalled();
    expect(capturedToolCtx?.maxToolResultChars).toBe(20000);

    // Fire the hook the agent's createWorkflow tool would call.
    await capturedToolCtx?.onWorkflowCreated?.("wf-created");
    expect(setWorkflowId).toHaveBeenCalledWith("conv-1", "wf-created");
  });

  it("does not rebind when the conversation already has a workflowId", async () => {
    const { service, setWorkflowId } = makeHarness({
      conversation: { id: "conv-1", workflowId: "wf-existing", title: "t" },
    });
    await service.startChat({
      ...baseInput,
      messages: [userMsg("edit wf")],
    } as never);

    await capturedToolCtx?.onWorkflowCreated?.("wf-other");
    expect(setWorkflowId).not.toHaveBeenCalled();
  });
});
