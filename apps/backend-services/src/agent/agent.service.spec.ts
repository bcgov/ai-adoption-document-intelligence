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
    dep,
  );
}

describe("AgentService — conversation queries", () => {
  it("listConversationsForCaller asks for what the caller can see, in their group", async () => {
    const listConversationsVisibleTo = jest.fn().mockResolvedValue([]);
    const service = makeService({ listConversationsVisibleTo });

    await service.listConversationsForCaller({
      actorId: "user-1",
      groupId: "g1",
      workflowId: "wf-1",
    });

    // Item 24: the list is the caller's own conversations PLUS the group's
    // seeded demo replays — the repository owns that union, so all the
    // service must do is hand over both identifiers.
    expect(listConversationsVisibleTo).toHaveBeenCalledWith({
      groupId: "g1",
      actorId: "user-1",
      workflowId: "wf-1",
    });
  });

  it("getConversationForCaller throws NotFound when the conversation is not visible to the caller", async () => {
    const service = makeService({
      findConversationForReader: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.getConversationForCaller("c1", "user-1", "g1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getConversationForCaller returns the conversation and its messages", async () => {
    const conversation = { id: "c1" };
    const messages = [{ id: "m1" }];
    const findConversationForReader = jest.fn().mockResolvedValue(conversation);
    const service = makeService({
      findConversationForReader,
      listMessagesForConversation: jest.fn().mockResolvedValue(messages),
    });
    await expect(
      service.getConversationForCaller("c1", "user-1", "g1"),
    ).resolves.toEqual({ conversation, messages });
    expect(findConversationForReader).toHaveBeenCalledWith(
      "c1",
      "user-1",
      "g1",
    );
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

  it("deleting still uses the owner-only lookup, so a demo is not deletable by a reader", async () => {
    const findConversationByIdForUser = jest.fn().mockResolvedValue(null);
    const service = makeService({ findConversationByIdForUser });
    await expect(
      service.deleteConversationForCaller("demo-agent-1", "someone-else"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findConversationByIdForUser).toHaveBeenCalledWith(
      "demo-agent-1",
      "someone-else",
    );
  });
});
