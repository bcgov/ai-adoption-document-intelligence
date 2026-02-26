import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  ApiKeyInfoDto,
  GeneratedApiKeyDto,
} from "@/api-key/dto/api-key-info.dto";
import { PrismaService } from "@/database/prisma.service";

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async getApiKey(userId: string): Promise<ApiKeyInfoDto | null> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { generating_user_id: userId },
    });

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

  async generateApiKey(
    userId: string,
    groupId: string,
  ): Promise<GeneratedApiKeyDto> {
    // Check if user already has a key
    const existingKey = await this.prisma.apiKey.findFirst({
      where: { generating_user_id: userId },
    });

    if (existingKey) {
      throw new ConflictException(
        "User already has an API key. Delete it first or use regenerate.",
      );
    }

    // Generate a secure random key
    const key = crypto.randomBytes(32).toString("base64url");
    const keyPrefix = key.substring(0, 8);

    // Hash the key for storage
    const keyHash = await bcrypt.hash(key, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        key_hash: keyHash,
        key_prefix: keyPrefix,
        generating_user_id: userId,
        group_id: groupId,
      },
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

  async deleteApiKey(groupId: string): Promise<void> {
    const deleted = await this.prisma.apiKey.deleteMany({
      where: { group_id: groupId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException("No API key found for this group");
    }
    this.logger.log(`API key(s) deleted for group ${groupId}`);
  }

  async regenerateApiKey(
    userId: string,
    groupId: string,
  ): Promise<GeneratedApiKeyDto> {
    // Delete existing key(s) if any
    await this.prisma.apiKey.deleteMany({ where: { group_id: groupId } });
    // Generate new key
    return this.generateApiKey(userId, groupId);
  }

  async validateApiKey(key: string): Promise<{ groupId: string } | null> {
    // Extract prefix from the incoming key for indexed lookup
    const prefix = key.substring(0, 8);

    // Query only keys with matching prefix (O(1) lookup instead of O(n)).
    // No user JOIN needed — the key is group-scoped for auth purposes.
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { key_prefix: prefix },
    });

    for (const apiKey of apiKeys) {
      const isValid = await bcrypt.compare(key, apiKey.key_hash);
      if (isValid) {
        // Update last_used timestamp
        await this.prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { last_used: new Date() },
        });

        return { groupId: apiKey.group_id };
      }
    }

    return null;
  }
}
