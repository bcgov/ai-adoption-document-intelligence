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
   * Finds the API keys matching a given key prefix, among the keys of groups
   * that are not deleted. A deleted group's keys no longer authenticate.
   * @param prefix - The key prefix to match.
   * @param tx - Optional transaction client.
   * @returns An array of matching ApiKey records.
   */
  async findApiKeysByPrefix(
    prefix: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey[]> {
    const client = tx ?? this.prisma;
    return client.apiKey.findMany({
      where: { key_prefix: prefix, group: { deleted_at: null } },
    });
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
      const actorId = await this.getOrCreateGroupApiActorId(data.group_id, tx);
      return await tx.apiKey.create({
        data: {
          ...data,
          actor_id: actorId,
        },
      });
    };
    return tx
      ? await apiKeyHelper(tx)
      : await this.prisma.$transaction(async (tx) => await apiKeyHelper(tx));
  }

  /**
   * Returns the group's durable API-key actor, creating one the first time
   * the group ever gets a key. Reused across regenerate and delete/recreate
   * cycles so records authored via the API keep a stable author.
   * @param groupId - The group ID.
   * @param tx - Transaction client.
   * @returns The group's api_actor_id.
   */
  private async getOrCreateGroupApiActorId(
    groupId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { api_actor_id: true },
    });
    if (group.api_actor_id) {
      return group.api_actor_id;
    }
    const actor = await tx.actor.create({});
    await tx.group.update({
      where: { id: groupId },
      data: { api_actor_id: actor.id },
    });
    return actor.id;
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
   * Deletes a specific API key by its record ID. The group's api actor is
   * left in place (it is durable, see getOrCreateGroupApiActorId) so records
   * it authored keep a valid author.
   * @param id - The API key record UUID.
   * @param tx - Optional transaction client.
   * @returns The deleted ApiKey record.
   */
  async deleteApiKeyById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ApiKey> {
    const client = tx ?? this.prisma;
    return client.apiKey.delete({ where: { id } });
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
