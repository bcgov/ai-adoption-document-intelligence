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
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { user_id: userId },
      include: {
        user: {
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (!apiKey || !apiKey.user) {
      return null;
    }

    const roles = apiKey.user.userRoles.map((ur) => ur.role.name);

    return {
      id: apiKey.id,
      keyPrefix: apiKey.key_prefix,
      userEmail: apiKey.user.email,
      roles,
      createdAt: apiKey.created_at,
      lastUsed: apiKey.last_used,
    };
  }

  async generateApiKey(userId: string): Promise<GeneratedApiKeyDto> {
    // Check if user already has a key
    const existingKey = await this.prisma.apiKey.findFirst({
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

    // Fetch user and roles for response
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
      },
    });
    const roles = user?.userRoles?.map((ur) => ur.role.name) ?? [];

    const apiKey = await this.prisma.apiKey.create({
      data: {
        key_hash: keyHash,
        key_prefix: keyPrefix,
        user_id: userId,
      },
    });

    this.logger.log(`API key generated for user ${userId}`);

    return {
      id: apiKey.id,
      key,
      keyPrefix,
      userEmail: user?.email ?? null,
      roles,
      createdAt: apiKey.created_at,
      lastUsed: null,
    };
  }

  async deleteApiKey(userId: string): Promise<void> {
    const deleted = await this.prisma.apiKey.deleteMany({
      where: { user_id: userId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException("No API key found for this user");
    }
    this.logger.log(`API key(s) deleted for user ${userId}`);
  }

  async regenerateApiKey(userId: string): Promise<GeneratedApiKeyDto> {
    // Delete existing key(s) if any
    await this.prisma.apiKey.deleteMany({ where: { user_id: userId } });
    // Generate new key
    return this.generateApiKey(userId);
  }

  async validateApiKey(key: string): Promise<{
    userId: string;
    userEmail: string | null;
    roles: string[];
  } | null> {
    // Extract prefix from the incoming key for indexed lookup
    const prefix = key.substring(0, 8);

    // Query only keys with matching prefix (O(1) lookup instead of O(n))
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { key_prefix: prefix },
      include: {
        user: {
          include: {
            userRoles: { include: { role: true } },
          },
        },
      },
    });

    for (const apiKey of apiKeys) {
      const isValid = await bcrypt.compare(key, apiKey.key_hash);
      if (isValid) {
        // Update last_used timestamp
        await this.prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { last_used: new Date() },
        });

        const roles = apiKey.user?.userRoles?.map((ur) => ur.role.name) ?? [];

        return {
          userId: apiKey.user_id,
          userEmail: apiKey.user?.email ?? null,
          roles,
        };
      }
    }

    return null;
  }
}
