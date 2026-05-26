import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface ChatConversationRow {
  id: string;
  workflowId: string | null;
  groupId: string;
  createdBy: string;
  provider: string;
  model: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date;
}

export interface ChatMessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(input: {
    workflowId: string | null;
    groupId: string;
    createdBy: string;
    provider: string;
    model: string;
  }): Promise<ChatConversationRow> {
    return this.prisma.prisma.chatConversation.create({ data: input });
  }

  async findConversationByIdForUser(
    id: string,
    createdBy: string,
  ): Promise<ChatConversationRow | null> {
    return this.prisma.prisma.chatConversation.findFirst({
      where: { id, createdBy },
    });
  }

  async listConversationsForUser(input: {
    groupId: string;
    createdBy: string;
    workflowId?: string | null;
  }): Promise<ChatConversationRow[]> {
    const where: {
      groupId: string;
      createdBy: string;
      workflowId?: string | null;
    } = { groupId: input.groupId, createdBy: input.createdBy };
    if (input.workflowId !== undefined) {
      where.workflowId = input.workflowId;
    }
    return this.prisma.prisma.chatConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
    });
  }

  async touchLastMessageAt(id: string): Promise<void> {
    await this.prisma.prisma.chatConversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });
  }

  async setWorkflowId(id: string, workflowId: string): Promise<void> {
    await this.prisma.prisma.chatConversation.update({
      where: { id },
      data: { workflowId },
    });
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.prisma.prisma.chatConversation.update({
      where: { id },
      data: { title },
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.prisma.prisma.chatConversation.delete({ where: { id } });
  }

  async createMessage(input: {
    conversationId: string;
    role: string;
    content: unknown;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }): Promise<ChatMessageRow> {
    return this.prisma.prisma.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content as object,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
      },
    });
  }

  async listMessagesForConversation(
    conversationId: string,
  ): Promise<ChatMessageRow[]> {
    return this.prisma.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }
}
