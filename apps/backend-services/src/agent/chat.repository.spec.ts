import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ChatRepository } from "./chat.repository";

interface MockPrisma {
  chatConversation: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  chatMessage: {
    create: jest.Mock;
    findMany: jest.Mock;
    aggregate: jest.Mock;
  };
}

describe("ChatRepository", () => {
  let repo: ChatRepository;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = {
      chatConversation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRepository,
        { provide: PrismaService, useValue: { prisma: mockPrisma } },
      ],
    }).compile();
    repo = module.get<ChatRepository>(ChatRepository);
  });

  it("createConversation forwards args to prisma", async () => {
    const row = { id: "c1" };
    mockPrisma.chatConversation.create.mockResolvedValue(row);
    const result = await repo.createConversation({
      workflowId: null,
      groupId: "g",
      createdBy: "u",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    expect(mockPrisma.chatConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ groupId: "g", createdBy: "u" }),
    });
    expect(result).toBe(row);
  });

  it("findConversationByIdForUser filters by createdBy (per-user-private)", async () => {
    mockPrisma.chatConversation.findFirst.mockResolvedValue(null);
    const result = await repo.findConversationByIdForUser("c1", "userA");
    expect(mockPrisma.chatConversation.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", createdBy: "userA" },
    });
    expect(result).toBeNull();
  });

  it("listConversationsForUser passes workflowId when provided", async () => {
    mockPrisma.chatConversation.findMany.mockResolvedValue([]);
    await repo.listConversationsForUser({
      groupId: "g",
      createdBy: "u",
      workflowId: "wf-1",
    });
    expect(mockPrisma.chatConversation.findMany).toHaveBeenCalledWith({
      where: { groupId: "g", createdBy: "u", workflowId: "wf-1" },
      orderBy: { lastMessageAt: "desc" },
    });
  });

  it("listConversationsForUser omits workflowId when not provided", async () => {
    mockPrisma.chatConversation.findMany.mockResolvedValue([]);
    await repo.listConversationsForUser({ groupId: "g", createdBy: "u" });
    expect(mockPrisma.chatConversation.findMany).toHaveBeenCalledWith({
      where: { groupId: "g", createdBy: "u" },
      orderBy: { lastMessageAt: "desc" },
    });
  });

  it("setWorkflowId updates the conversation", async () => {
    mockPrisma.chatConversation.update.mockResolvedValue(undefined);
    await repo.setWorkflowId("c1", "wf-1");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { workflowId: "wf-1" },
    });
  });

  it("setTitle updates the conversation title", async () => {
    mockPrisma.chatConversation.update.mockResolvedValue(undefined);
    await repo.setTitle("c1", "My Title");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { title: "My Title" },
    });
  });

  it("createMessage normalises optional token fields to null", async () => {
    mockPrisma.chatMessage.create.mockResolvedValue({});
    await repo.createMessage({
      conversationId: "c1",
      role: "assistant",
      content: { text: "hi" },
    });
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "c1",
        role: "assistant",
        inputTokens: null,
        outputTokens: null,
      }),
    });
  });

  it("listMessagesForConversation orders ascending", async () => {
    mockPrisma.chatMessage.findMany.mockResolvedValue([]);
    await repo.listMessagesForConversation("c1");
    expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("deleteConversation cascades via the schema (prisma.delete call)", async () => {
    mockPrisma.chatConversation.delete.mockResolvedValue(undefined);
    await repo.deleteConversation("c1");
    expect(mockPrisma.chatConversation.delete).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });

  it("sumConversationTokens sums input+output across messages (ITEM 26)", async () => {
    mockPrisma.chatMessage.aggregate.mockResolvedValue({
      _sum: { inputTokens: 300, outputTokens: 120 },
    });
    const total = await repo.sumConversationTokens("c1");
    expect(total).toBe(420);
    expect(mockPrisma.chatMessage.aggregate).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      _sum: { inputTokens: true, outputTokens: true },
    });
  });

  it("sumConversationTokens treats null aggregates as zero", async () => {
    mockPrisma.chatMessage.aggregate.mockResolvedValue({
      _sum: { inputTokens: null, outputTokens: null },
    });
    expect(await repo.sumConversationTokens("c1")).toBe(0);
  });
});
