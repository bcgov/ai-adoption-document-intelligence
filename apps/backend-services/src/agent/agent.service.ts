import { Injectable, NotFoundException } from "@nestjs/common";
import {
  convertToModelMessages,
  generateText,
  type StreamTextResult,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { DynamicNodesService } from "@/dynamic-nodes/dynamic-nodes.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { AbortFlagMap } from "./abort-flag-map";
import { AgentEnv, type AgentProvider } from "./agent.env";
import { ChatRepository } from "./chat.repository";
import { ProviderResolver } from "./provider-resolver";
import { WORKFLOW_BUILDER_SYSTEM_PROMPT } from "./system-prompt";
import { type AgentToolContext, createAgentTools } from "./tools";

export interface AgentChatRunInput {
  conversationId: string | null;
  workflowId: string | null;
  groupId: string;
  actorId: string;
  apiKey: string | null;
  backendBaseUrl: string;
  provider?: AgentProvider;
  model?: string;
  /** UI messages from the frontend assistant-ui composer. */
  messages: UIMessage[];
}

export interface AgentChatRunResult {
  conversationId: string;
  streamResult: StreamTextResult<ToolSet, never>;
}

/**
 * Orchestrates a single agent turn. Pure SDK glue — the agentic loop
 * runs inside `streamText` with `stopWhen: stepCountIs(env.maxSteps)`.
 *
 * Persistence: the conversation row is created on first call; the user
 * message is persisted before the SDK call; the assistant message is
 * persisted in `onFinish`.
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly env: AgentEnv,
    private readonly providerResolver: ProviderResolver,
    private readonly chatRepository: ChatRepository,
    private readonly workflowService: WorkflowService,
    private readonly dynamicNodesService: DynamicNodesService,
    private readonly abortFlags: AbortFlagMap,
    private readonly logger: AppLoggerService,
  ) {}

  async startChat(input: AgentChatRunInput): Promise<AgentChatRunResult> {
    const selection = this.providerResolver.resolve({
      provider: input.provider,
      model: input.model,
    });
    const model = this.providerResolver.buildModel(selection);

    let conversation =
      input.conversationId === null
        ? null
        : await this.chatRepository.findConversationByIdForUser(
            input.conversationId,
            input.actorId,
          );

    if (input.conversationId !== null && conversation === null) {
      throw new NotFoundException("Conversation not found");
    }

    if (conversation === null) {
      conversation = await this.chatRepository.createConversation({
        workflowId: input.workflowId,
        groupId: input.groupId,
        createdBy: input.actorId,
        provider: selection.provider,
        model: selection.model,
      });
    }

    // If the client only sent the latest turn (assistant-ui's
    // useChatRuntime sometimes does), hydrate prior messages from the DB
    // so the model has full conversation context across drawer reopens.
    let workingMessages: UIMessage[] = input.messages;
    if (input.conversationId !== null && input.messages.length <= 1) {
      const stored = await this.chatRepository.listMessagesForConversation(
        conversation.id,
      );
      const hydrated = stored
        .map((row) => storedRowToUIMessage(row))
        .filter((m): m is UIMessage => m !== null);
      if (hydrated.length > 0) {
        // Drop the latest stored user turn if the incoming payload's
        // single message duplicates it.
        workingMessages = mergeForResume(hydrated, input.messages);
      }
    }
    const latestUserMessage = lastUserUIMessage(workingMessages);
    const isFirstTurn = conversation.title === null;
    if (latestUserMessage !== null) {
      await this.chatRepository.createMessage({
        conversationId: conversation.id,
        role: "user",
        content: latestUserMessage as unknown,
      });
    }
    // Title generation: side `generateText` call on first message,
    // best-effort (failure is logged but doesn't block the main stream).
    if (isFirstTurn && latestUserMessage !== null) {
      const firstUserText = extractTextFromUIMessage(latestUserMessage);
      void this.generateTitle(conversation.id, firstUserText, model).catch(
        (err: unknown) => {
          this.logger.error?.("AgentService title-gen failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );
    }

    const ctx: AgentToolContext = {
      actorId: input.actorId,
      groupId: input.groupId,
      workflowId: conversation.workflowId ?? input.workflowId,
      apiKey: input.apiKey,
      backendBaseUrl: input.backendBaseUrl,
      workflowService: this.workflowService,
      dynamicNodesService: this.dynamicNodesService,
      onWorkflowCreated: async (workflowId) => {
        if (conversation !== null && conversation.workflowId === null) {
          await this.chatRepository.setWorkflowId(conversation.id, workflowId);
        }
      },
    };

    const tools = createAgentTools(ctx);

    this.logger.log?.(
      `Agent.startChat workingMessages.length=${workingMessages.length}`,
    );
    const modelMessages = await convertToModelMessages(workingMessages);
    this.logger.log?.(
      `Agent.startChat modelMessages.length=${modelMessages.length}`,
    );

    const conversationIdForCallback = conversation.id;
    const abortController = this.abortFlags.register(conversation.id);
    const result = streamText({
      model,
      system: WORKFLOW_BUILDER_SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(this.env.maxSteps),
      maxOutputTokens: this.env.maxOutputTokens,
      abortSignal: abortController.signal,
      onFinish: async (event) => {
        try {
          await this.chatRepository.touchLastMessageAt(
            conversationIdForCallback,
          );
          await this.chatRepository.createMessage({
            conversationId: conversationIdForCallback,
            role: "assistant",
            content: {
              text: event.text,
              finishReason: event.finishReason,
              usage: event.usage,
            },
            inputTokens: event.usage?.inputTokens ?? null,
            outputTokens: event.usage?.outputTokens ?? null,
          });
        } catch (err) {
          this.logger.error?.("AgentService.onFinish persistence failed", {
            stack: err instanceof Error ? err.stack : String(err),
          });
        }
      },
      onError: ({ error }) => {
        this.logger.error?.("AgentService streamText error", {
          stack: error instanceof Error ? error.stack : String(error),
        });
      },
    });

    // Clear the abort registration once the stream completes so the
    // map doesn't leak entries across long-lived conversations.
    void Promise.resolve(result.finishReason).finally(() => {
      this.abortFlags.clear(conversation.id);
    });

    return { conversationId: conversation.id, streamResult: result };
  }

  async listConversationsForCaller(input: {
    actorId: string;
    groupId: string;
    workflowId?: string | null;
  }) {
    // Conversations are keyed by `createdBy` (set to the actor id at creation
    // time), so map the caller's actorId onto the repository's `createdBy`
    // filter. Passing `actorId` straight through queried `createdBy: undefined`.
    return this.chatRepository.listConversationsForUser({
      groupId: input.groupId,
      createdBy: input.actorId,
      workflowId: input.workflowId,
    });
  }

  async getConversationForCaller(id: string, actorId: string) {
    const conversation = await this.chatRepository.findConversationByIdForUser(
      id,
      actorId,
    );
    if (conversation === null) {
      throw new NotFoundException("Conversation not found");
    }
    const messages = await this.chatRepository.listMessagesForConversation(id);
    return { conversation, messages };
  }

  async deleteConversationForCaller(id: string, actorId: string) {
    const conversation = await this.chatRepository.findConversationByIdForUser(
      id,
      actorId,
    );
    if (conversation === null) {
      throw new NotFoundException("Conversation not found");
    }
    await this.chatRepository.deleteConversation(id);
  }

  /**
   * Background side call: ask the same provider for a short (3-6 word)
   * title for this conversation. Tools disabled; bounded by 64 output
   * tokens. Failure is logged but does not affect the main chat.
   */
  private async generateTitle(
    conversationId: string,
    firstUserText: string,
    model: ReturnType<ProviderResolver["buildModel"]>,
  ): Promise<void> {
    const trimmed = firstUserText.trim();
    if (trimmed.length === 0) return;
    const prompt = `Generate a 3-6 word title for this workflow-building request. Output the title only, no quotes, no trailing punctuation:\n\n${trimmed.slice(0, 600)}`;
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 64,
    });
    const title = result.text.trim().split("\n")[0]?.slice(0, 80);
    if (title && title.length > 0) {
      await this.chatRepository.setTitle(conversationId, title);
    }
  }
}

function lastUserUIMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

function storedRowToUIMessage(row: {
  id: string;
  role: string;
  content: unknown;
}): UIMessage | null {
  // Reconstruct a UIMessage shape from the stored content for the SDK's
  // convertToModelMessages. We accept either an already-shaped UIMessage
  // (saved verbatim for user messages) or our assistant-row envelope
  // `{ text, finishReason, usage }` which we project into a single text
  // part.
  if (row.content === null || typeof row.content !== "object") return null;
  const obj = row.content as Record<string, unknown>;
  if (Array.isArray(obj.parts)) {
    return {
      id: row.id,
      role: row.role as "user" | "assistant" | "system",
      parts: obj.parts as UIMessage["parts"],
    } as UIMessage;
  }
  if (typeof obj.text === "string") {
    return {
      id: row.id,
      role: row.role as "user" | "assistant" | "system",
      parts: [{ type: "text", text: obj.text }],
    } as unknown as UIMessage;
  }
  return null;
}

function mergeForResume(
  stored: UIMessage[],
  incoming: UIMessage[],
): UIMessage[] {
  if (incoming.length === 0) return stored;
  const lastStored = stored[stored.length - 1];
  const incomingFirst = incoming[0];
  // Drop the duplicate trailing user message if it matches what we just
  // persisted in createMessage().
  if (
    lastStored &&
    lastStored.role === "user" &&
    incomingFirst &&
    incomingFirst.role === "user" &&
    JSON.stringify(lastStored.parts) === JSON.stringify(incomingFirst.parts)
  ) {
    return [...stored.slice(0, -1), ...incoming];
  }
  return [...stored, ...incoming];
}

function extractTextFromUIMessage(msg: UIMessage): string {
  if (!Array.isArray(msg.parts)) return "";
  const out: string[] = [];
  for (const part of msg.parts) {
    if (
      part !== null &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type: string }).type === "text" &&
      typeof (part as { text?: string }).text === "string"
    ) {
      out.push((part as { text: string }).text);
    }
  }
  return out.join("\n");
}
