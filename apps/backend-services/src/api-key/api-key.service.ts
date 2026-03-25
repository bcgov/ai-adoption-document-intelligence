import { Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  ApiKeyInfoDto,
  GeneratedApiKeyDto,
} from "@/api-key/dto/api-key-info.dto";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { ValidatedApiKey } from "@/auth/types";
import { ApiKeyDbService } from "./api-key-db.service";

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly apiKeyDb: ApiKeyDbService,
    private readonly logger: AppLoggerService,
  ) {}

  async getApiKey(groupId: string): Promise<ApiKeyInfoDto | null> {
    const apiKey = await this.apiKeyDb.findApiKeyByGroupId(groupId);

    if (!apiKey) {
      return null;
    }

    return {
      id: apiKey.id,
      keyPrefix: apiKey.key_prefix,
      groupId: apiKey.group_id,
      createdAt: apiKey.created_at,
      lastUsed: apiKey.last_used,
    };
  }

  /**
   * Looks up an API key record by its ID and returns the associated group ID.
   * Throws NotFoundException when no matching key exists.
   *
   * @param keyId - The UUID of the API key record.
   * @returns The group ID the key belongs to.
   */
  async getApiKeyGroupId(keyId: string): Promise<string> {
    const apiKey = await this.apiKeyDb.findApiKeyById(keyId);
    if (!apiKey) {
      throw new NotFoundException("No API key found with this ID");
    }
    return apiKey.group_id;
  }

  async generateApiKey(
    userId: string,
    groupId: string,
  ): Promise<GeneratedApiKeyDto> {
    // Delete any existing key for this group (upsert: one key per group)
    await this.apiKeyDb.deleteApiKeysByGroupId(groupId);

    // Generate a secure random key
    const key = crypto.randomBytes(32).toString("base64url");
    const keyPrefix = key.substring(0, 8);

    // Hash the key for storage
    const keyHash = await bcrypt.hash(key, 10);

    const apiKey = await this.apiKeyDb.createApiKey({
      key_hash: keyHash,
      key_prefix: keyPrefix,
      generating_user_id: userId,
      group_id: groupId,
    });

    this.logger.log(`API key generated for user ${userId} in group ${groupId}`);

    return {
      id: apiKey.id,
      key,
      keyPrefix,
      groupId: apiKey.group_id,
      createdAt: apiKey.created_at,
      lastUsed: null,
    };
  }

  async deleteApiKey(keyId: string): Promise<void> {
    const deleted = await this.apiKeyDb.deleteApiKeyById(keyId);
    if (!deleted) {
      throw new NotFoundException("No API key found with this ID");
    }
    this.logger.log(`API key ${keyId} deleted`);
  }

  async regenerateApiKey(
    userId: string,
    keyId: string,
  ): Promise<GeneratedApiKeyDto> {
    const groupId = await this.getApiKeyGroupId(keyId);
    return this.generateApiKey(userId, groupId);
  }

  async validateApiKey(
    key: string,
  ): Promise<ValidatedApiKey | null> {
    // Extract prefix from the incoming key for indexed lookup
    const prefix = key.substring(0, 8);

    // Query only keys with matching prefix (O(1) lookup instead of O(n)).
    // No user JOIN needed — the key is group-scoped for auth purposes.
    const apiKeys = await this.apiKeyDb.findApiKeysByPrefix(prefix);

    for (const apiKey of apiKeys) {
      const isValid = await bcrypt.compare(key, apiKey.key_hash);
      if (isValid) {
        // Update last_used timestamp
        await this.apiKeyDb.updateApiKeyLastUsed(apiKey.id);

        return { groupId: apiKey.group_id, keyPrefix: apiKey.key_prefix };
      }
    }

    return null;
  }
}
