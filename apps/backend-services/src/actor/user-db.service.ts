import type { Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

/**
 * Database service for ApiKey operations within the ApiKey module.
 */
@Injectable()
export class UserDbService {
  constructor(private readonly prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async upsertUser(sub: string, email: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const lastLogin = new Date();
    // Does user exist?
    const existingUser = await client.user.findFirst({ where: { id: sub } });
    if (existingUser != null) {
      return await client.user.update({
        where: {
          id: sub,
        },
        data: {
          email,
          last_login_at: lastLogin,
        },
      });
    }
    const userHelper = async (tx: Prisma.TransactionClient) => {
      const actor = await tx.actor.create({});
      return await tx.user.create({
        data: {
          id: sub,
          email,
          last_login_at: lastLogin,
          actor_id: actor.id,
        },
      });
    };
    return tx
      ? await userHelper(tx)
      : await this.prisma.$transaction(async (tx) => await userHelper(tx));
  }
  /**
     * Checks whether a user is a system admin.
     * @param userId - The ID of the user to check.
     * @returns `true` when the user has `is_system_admin` set to `true`, `false` otherwise.
     */
  async isUserSystemAdmin(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { is_system_admin: true },
    });
    return user?.is_system_admin ?? false;
  }

  async findUser(userId: string, includeGroups: boolean = false, tx?: Prisma.TransactionClient,) {
    const client = tx ?? this.prisma;
    return await client.user.findUnique({
      where: { id: userId },
      include: { userGroups: includeGroups }
    })
  }
}
