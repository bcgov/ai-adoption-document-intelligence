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

  async getUserApiKey(userId: string): Promise<ApiKeyInfoDto | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { user_id: userId },
    });

    if (!apiKey) {
      return null;
    }

    return {
      id: apiKey.id,
      keyPrefix: apiKey.key_prefix,
      userEmail: apiKey.user_email,
      roles: apiKey.roles,
      createdAt: apiKey.created_at,
      lastUsed: apiKey.last_used,
    };
  }

  async generateApiKey(
    userId: string,
    userEmail: string,
    roles: string[],
  ): Promise<GeneratedApiKeyDto> {
    // Check if user already has a key
    const existingKey = await this.prisma.apiKey.findUnique({
      where: { user_id: userId },
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
        user_id: userId,
        user_email: userEmail,
        roles,
      },
    });

    this.logger.log(`API key generated for user ${userId}`);

    return {
      id: apiKey.id,
      key, // Return full key only once
      keyPrefix,
      userEmail: apiKey.user_email,
      roles: apiKey.roles,
      createdAt: apiKey.created_at,
      lastUsed: null,
    };
  }

  async deleteApiKey(userId: string): Promise<void> {
    const existingKey = await this.prisma.apiKey.findUnique({
      where: { user_id: userId },
    });

    if (!existingKey) {
      throw new NotFoundException("No API key found for this user");
    }

    await this.prisma.apiKey.delete({
      where: { user_id: userId },
    });

    this.logger.log(`API key deleted for user ${userId}`);
  }

  async regenerateApiKey(
    userId: string,
    userEmail: string,
    roles: string[],
  ): Promise<GeneratedApiKeyDto> {
    // Delete existing key if any
    try {
      await this.deleteApiKey(userId);
    } catch {
      // Ignore if no key exists
    }

    // Generate new key
    return this.generateApiKey(userId, userEmail, roles);
  }

  async validateApiKey(
    key: string,
  ): Promise<{ userId: string; userEmail: string; roles: string[] } | null> {
    // Extract prefix from the incoming key for indexed lookup
    const prefix = key.substring(0, 8);

    // Query only keys with matching prefix (O(1) lookup instead of O(n))
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

        return {
          userId: apiKey.user_id,
          userEmail: apiKey.user_email,
          roles: apiKey.roles,
        };
      }
    }

    return null;
  }
}
