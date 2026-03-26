import type { ApiKey, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface CreateApiKeyData {
  key_hash: string;
  key_prefix: string;
  generating_user_id: string;
  group_id: string;
}

export interface UpdateApiKeyData {
  key_hash: string;
  key_prefix: string;
  generating_user_id: string;
  group_id: string;
}

/**
 * Database service for ApiKey operations within the ApiKey module.
 */
@Injectable()
export class ApiKeyDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Finds the first API key for a given group.
   * @param groupId - The group ID to search for.
   * @param tx - Optional transaction client.
   * @returns The ApiKey record or null if not found.
   */
  async findApiKeyByGroupId(
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey | null> {
    const client = tx ?? this.prisma;
    return client.apiKey.findFirst({ where: { group_id: groupId } });
  }

  /**
   * Finds an API key by its record ID.
   * @param id - The API key record UUID.
   * @param tx - Optional transaction client.
   * @returns The ApiKey record or null if not found.
   */
  async findApiKeyById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey | null> {
    const client = tx ?? this.prisma;
    return client.apiKey.findUnique({ where: { id } });
  }

  /**
   * Finds all API keys matching a given key prefix.
   * @param prefix - The key prefix to match.
   * @param tx - Optional transaction client.
   * @returns An array of matching ApiKey records.
   */
  async findApiKeysByPrefix(
    prefix: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey[]> {
    const client = tx ?? this.prisma;
    return client.apiKey.findMany({ where: { key_prefix: prefix } });
  }

  /**
   * Creates a new API key record.
   * @param data - The data for the new API key.
   * @param tx - Optional transaction client.
   * @returns The created ApiKey record.
   */
  async createApiKey(
    data: CreateApiKeyData,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey> {
    const apiKeyHelper = async (tx: Prisma.TransactionClient) => {
      const actor = await tx.actor.create({});
      return await tx.apiKey.create({
        data: {
          ...data,
          actor_id: actor.id,
        },
      });
    };
    return tx
      ? await apiKeyHelper(tx)
      : await this.prisma.$transaction(async (tx) => await apiKeyHelper(tx));
  }

  async updateApiKey(
    data: UpdateApiKeyData,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey> {
    const client = tx ?? this.prisma;
    return client.apiKey.update({
      where: { group_id: data.group_id },
      data: {
        generating_user_id: data.generating_user_id,
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
      },
    });
  }

  /**
   * Deletes all API keys for a given group.
   * @param groupId - The group ID whose keys should be deleted.
   * @param tx - Optional transaction client.
   */
  async deleteApiKeysByGroupId(
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.apiKey.deleteMany({ where: { group_id: groupId } });
  }

  /**
   * Deletes a specific API key by its record ID.
   * @param id - The API key record UUID.
   * @param tx - Optional transaction client.
   * @returns The deleted ApiKey record.
   */
  async deleteApiKeyById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey> {
    const deleteKeyHelper = async (tx: Prisma.TransactionClient) => {
      const existingKey = await tx.apiKey.findFirstOrThrow({
        where: { id: id },
      });
      const actor = await tx.actor.findFirstOrThrow({
        where: { id: existingKey.actor_id },
      });
      const keyDeleteResult = await tx.apiKey.delete({ where: { id } });
      await tx.actor.delete({ where: { id: actor.id } });
      return keyDeleteResult;
    };
    return tx
      ? await deleteKeyHelper(tx)
      : await this.prisma.$transaction(async (tx) => await deleteKeyHelper(tx));
  }

  /**
   * Updates the last_used timestamp for an API key to now.
   * @param id - The API key record UUID.
   * @param tx - Optional transaction client.
   * @returns The updated ApiKey record.
   */
  async updateApiKeyLastUsed(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey> {
    const client = tx ?? this.prisma;
    return client.apiKey.update({
      where: { id },
      data: { last_used: new Date() },
    });
  }
}
