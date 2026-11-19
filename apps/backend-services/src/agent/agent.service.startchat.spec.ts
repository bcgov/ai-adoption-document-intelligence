import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { OnFinishEvent, StreamTextResult, ToolSet } from "ai";

// Mock the AI SDK boundary so startChat's orchestration is unit-testable
// without a real model. `streamText` captures its options (so we can
// invoke onFinish), and returns a stub stream whose finishReason resolves
// immediately (driving the abort-cleanup `.finally`).
let capturedStreamTextOptions: {
  onFinish?: (event: OnFinishEvent<ToolSet>) => Promise<void> | void;
  abortSignal?: AbortSignal;
} | null = null;

// The `finishReason` promise the stubbed stream exposes. Defaults to a
// resolved stream; individual tests override it (e.g. to a rejected
// promise) to simulate an errored turn. `mock`-prefixed so the hoisted
// jest.mock factory may reference it.
let mockFinishReason: () => Promise<unknown> = () => Promise.resolve("stop");

jest.mock("ai", () => {
  const actual = jest.requireActual("ai");
  return {
    ...actual,
    convertToModelMessages: jest.fn(async (msgs: unknown) => msgs),
    streamText: jest.fn((options: unknown) => {
      capturedStreamTextOptions = options as typeof capturedStreamTextOptions;
      return {
        finishReason: mockFinishReason(),
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
import { RunBudgetMap } from "./run-budget-map";

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
  internalTokenService: { mint: jest.Mock };
  auditService: { recordEvent: jest.Mock };
}

function makeHarness(opts: {
  env?: Partial<AgentEnv>;
  conversation?: Record<string, unknown> | null;
  spentTokens?: number;
}): Harness {
  capturedStreamTextOptions = null;
  capturedToolCtx = null;
  mockFinishReason = () => Promise.resolve("stop");

  const conversation =
    opts.conversation === undefined
      ? {
          id: "conv-1",
          workflowId: null,
          title: "existing",
          // Must match baseInput.groupId — startChat rejects a resume whose
          // stored group differs from the request's group.
          groupId: "g1",
        }
      : opts.conversation;

  const setWorkflowId = jest.fn().mockResolvedValue(undefined);

  const chatRepository: jest.Mocked<Partial<ChatRepository>> = {
    findConversationForReader: jest.fn().mockResolvedValue(conversation),
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
  // Change W: startChat mints one internal token per run from the resolved
  // identity; the harness records the mint arguments.
  const internalTokenService = {
    mint: jest.fn().mockResolvedValue("raw-internal-token"),
  };
  const auditService = { recordEvent: jest.fn().mockResolvedValue(undefined) };

  const service = new AgentService(
    makeEnv(opts.env),
    providerResolver,
    chatRepository as unknown as ChatRepository,
    {} as never,
    {} as never,
    abortFlags,
    new RunBudgetMap(),
    internalTokenService as never,
    auditService as never,
    logger as never,
  );

  return {
    service,
    chatRepository,
    abortFlags,
    setWorkflowId,
    internalTokenService,
    auditService,
  };
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

describe("AgentService.startChat — resume group scoping (SECURITY §2.4)", () => {
  it("rejects resuming a conversation whose stored group differs from the request group", async () => {
    const { service, chatRepository } = makeHarness({
      conversation: {
        id: "conv-1",
        workflowId: "wf-in-group-B",
        title: "existing",
        groupId: "group-B",
      },
    });

    await expect(
      service.startChat({
        ...baseInput,
        // Request presents group A ("g1") but the conversation belongs to B.
        messages: [userMsg("hi")],
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    // The mismatch is caught before any message is persisted.
    expect(chatRepository.createMessage).not.toHaveBeenCalled();
  });
});

describe("AgentService.startChat — seeded demo replays (item 24)", () => {
  it("refuses to append a turn to a demo conversation, naming why", async () => {
    const { service, chatRepository } = makeHarness({
      conversation: {
        id: "demo-agent-ocr-pipeline",
        workflowId: "wf-1",
        title: "Invoice OCR pipeline",
        groupId: "g1",
        isDemo: true,
      },
    });

    // A demo is group-visible so anyone can REPLAY it; writing to it would
    // put one reader's follow-up into everyone else's demo.
    await expect(
      service.startChat({
        ...baseInput,
        conversationId: "demo-agent-ocr-pipeline",
        messages: [userMsg("carry on")],
      } as never),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: "demo-conversation-read-only" },
    });
    expect(chatRepository.createMessage).not.toHaveBeenCalled();
  });

  it("leaves an ordinary conversation writable", async () => {
    const { service } = makeHarness({
      conversation: {
        id: "conv-1",
        workflowId: null,
        title: "existing",
        groupId: "g1",
        isDemo: false,
      },
    });
    const result = await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    expect(result.conversationId).toBe("conv-1");
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

  // Batched (parallel) tool calls in one step race the agent tools'
  // read-modify-write of the workflow config, silently dropping nodes.
  // Disable parallel tool calls so the model emits graph edits one at a
  // time. Set for both providers; each ignores the other's key.
  it("disables parallel tool calls to avoid racing workflow writes", async () => {
    const { service } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    const opts = capturedStreamTextOptions as unknown as {
      providerOptions?: {
        openai?: { parallelToolCalls?: boolean };
        anthropic?: { disableParallelToolUse?: boolean };
      };
    };
    expect(opts.providerOptions?.openai?.parallelToolCalls).toBe(false);
    expect(opts.providerOptions?.anthropic?.disableParallelToolUse).toBe(true);
  });

  // Regression: an errored turn rejects `result.finishReason` with
  // NoOutputGeneratedError. The abort-cleanup chain must swallow that
  // rejection — an unhandled rejection terminates the Node process
  // (Node ≥15), taking the whole backend down mid-stream.
  it("does not emit an unhandled rejection when the stream's finishReason rejects", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const { service, abortFlags } = makeHarness({});
      // Set AFTER makeHarness (which resets the override) so this turn's
      // stubbed stream rejects its finishReason.
      mockFinishReason = () =>
        Promise.reject(new Error("No output generated. Check the stream."));
      // startChat itself must resolve — the errored turn surfaces via the
      // stream/onError, not by rejecting startChat.
      await service.startChat({
        ...baseInput,
        messages: [userMsg("hi")],
      } as never);
      // Let the finishReason .finally chain settle and any unhandled
      // rejection surface on the next macrotask ticks.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toHaveLength(0);
      // Cleanup still ran despite the rejection.
      expect(abortFlags.abort("conv-1")).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("AgentService.startChat — ctx binding via onWorkflowCreated (ITEM 25)", () => {
  it("binds the conversation workflowId when the agent's onWorkflowCreated hook fires", async () => {
    const { service, setWorkflowId } = makeHarness({
      conversation: {
        id: "conv-1",
        workflowId: null,
        title: "t",
        groupId: "g1",
      },
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
      conversation: {
        id: "conv-1",
        workflowId: "wf-existing",
        title: "t",
        groupId: "g1",
      },
    });
    await service.startChat({
      ...baseInput,
      messages: [userMsg("edit wf")],
    } as never);

    await capturedToolCtx?.onWorkflowCreated?.("wf-other");
    expect(setWorkflowId).not.toHaveBeenCalled();
  });
});

describe("AgentService.startChat — internal-token self-calls (Change W)", () => {
  it("mints one token per run from the resolved identity and binds it into the tool ctx", async () => {
    const { service, internalTokenService } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);

    expect(internalTokenService.mint).toHaveBeenCalledTimes(1);
    expect(internalTokenService.mint).toHaveBeenCalledWith(
      "g1",
      "agent-self-call",
      "actor-1",
      15 * 60_000,
    );
    expect(capturedToolCtx?.internalToken).toBe("raw-internal-token");
  });

  it("works for a JWT-shaped identity — no apiKey exists anywhere in the input or ctx", async () => {
    // baseInput carries only groupId + actorId (the resolved identity), the
    // shape a JWT/IDIR chat request produces. The run must succeed and the
    // ctx must not carry any caller credential.
    const { service } = makeHarness({});
    const result = await service.startChat({
      ...baseInput,
      messages: [userMsg("build me a workflow")],
    } as never);
    expect(result.conversationId).toBe("conv-1");
    expect(capturedToolCtx).not.toBeNull();
    expect(
      (capturedToolCtx as unknown as Record<string, unknown>).apiKey,
    ).toBeUndefined();
    expect(capturedToolCtx?.internalToken).toBe("raw-internal-token");
  });
});

describe("AgentService.startChat — audit events (Change H)", () => {
  it("records chat_conversation_created when a new conversation row is created", async () => {
    const { service, auditService } = makeHarness({ conversation: null });
    await service.startChat({
      ...baseInput,
      conversationId: null,
      messages: [userMsg("hi")],
    } as never);

    const created = auditService.recordEvent.mock.calls
      .map(([e]) => e)
      .find((e) => e.event_type === "chat_conversation_created");
    expect(created).toMatchObject({
      resource_type: "chat_conversation",
      resource_id: "conv-new",
      actor_id: "actor-1",
      group_id: "g1",
      payload: { provider: "anthropic", model: "m" },
    });
  });

  it("does NOT record a created event when resuming an existing conversation", async () => {
    const { service, auditService } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("hi")],
    } as never);
    const created = auditService.recordEvent.mock.calls
      .map(([e]) => e)
      .find((e) => e.event_type === "chat_conversation_created");
    expect(created).toBeUndefined();
  });

  it("records exactly one chat_message_appended per user turn, without the message body", async () => {
    const { service, auditService } = makeHarness({});
    await service.startChat({
      ...baseInput,
      messages: [userMsg("some private document text")],
    } as never);

    const appended = auditService.recordEvent.mock.calls
      .map(([e]) => e)
      .filter((e) => e.event_type === "chat_message_appended");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      resource_type: "chat_conversation",
      resource_id: "conv-1",
      actor_id: "actor-1",
      group_id: "g1",
      payload: { messageId: "m1", role: "user" },
    });
    // The user's words are chat data, not audit metadata.
    expect(JSON.stringify(appended[0])).not.toContain(
      "some private document text",
    );
  });
});
