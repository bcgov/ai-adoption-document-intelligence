import { NotFoundException } from "@nestjs/common";
import { AgentService } from "./agent.service";
import type { ChatRepository } from "./chat.repository";

// Exercises the conversation-query methods only; the streaming `startChat`
// path needs the AI SDK and is out of scope here. Only `chatRepository` is
// used, so the other constructor deps are stubbed.
function makeService(repo: Partial<ChatRepository>): AgentService {
  const dep = undefined as unknown as never;
  return new AgentService(
    dep,
    dep,
    repo as unknown as ChatRepository,
    dep,
    dep,
    dep,
    dep,
  );
}

describe("AgentService — conversation queries", () => {
  it("listConversationsForCaller maps the caller's actorId onto the repo `createdBy` filter", async () => {
    const listConversationsForUser = jest.fn().mockResolvedValue([]);
    const service = makeService({ listConversationsForUser });

    await service.listConversationsForCaller({
      actorId: "user-1",
      groupId: "g1",
      workflowId: "wf-1",
    });

    // Regression guard: previously the whole input (with `actorId`, no
    // `createdBy`) was forwarded, so the query filtered on createdBy=undefined.
    expect(listConversationsForUser).toHaveBeenCalledWith({
      groupId: "g1",
      createdBy: "user-1",
      workflowId: "wf-1",
    });
  });

  it("getConversationForCaller throws NotFound when the conversation is not owned by the caller", async () => {
    const service = makeService({
      findConversationByIdForUser: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.getConversationForCaller("c1", "user-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getConversationForCaller returns the conversation and its messages", async () => {
    const conversation = { id: "c1" };
    const messages = [{ id: "m1" }];
    const service = makeService({
      findConversationByIdForUser: jest.fn().mockResolvedValue(conversation),
      listMessagesForConversation: jest.fn().mockResolvedValue(messages),
    });
    await expect(
      service.getConversationForCaller("c1", "user-1"),
    ).resolves.toEqual({ conversation, messages });
  });

  it("deleteConversationForCaller throws NotFound when the conversation is missing", async () => {
    const service = makeService({
      findConversationByIdForUser: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.deleteConversationForCaller("c1", "user-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deleteConversationForCaller deletes when the conversation is owned by the caller", async () => {
    const deleteConversation = jest.fn().mockResolvedValue(undefined);
    const service = makeService({
      findConversationByIdForUser: jest.fn().mockResolvedValue({ id: "c1" }),
      deleteConversation,
    });
    await service.deleteConversationForCaller("c1", "user-1");
    expect(deleteConversation).toHaveBeenCalledWith("c1");
  });
});
