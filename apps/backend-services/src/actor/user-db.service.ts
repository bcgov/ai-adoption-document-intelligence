import type { PrismaClient, Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";


@Injectable()
export class UserDbService {
  constructor(private readonly prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async getUser(sub: string, includeGroups: boolean = false, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.user.findUnique({
      where: { id: sub }, include: {
        userGroups: includeGroups,
      }
    })
  }

  async upsertUser(sub: string, email: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const lastLogin = new Date();
    // Does user exist?
    const existingUser = await client.user.findFirst({ where: { id: sub } });
    if (existingUser != null) {
      return await client.user.update({
        where: {
          id: sub
        }, data: {
          email,
          last_login_at: lastLogin,
        }
      })
    }
    const userHelper = async (tx: Prisma.TransactionClient) => {
      const actor = await tx.actor.create({});
      return await tx.user.create({
        data: {
          id: sub,
          email,
          last_login_at: lastLogin,
          actor_id: actor.id
        }
      });
    }
    return tx
      ? await userHelper(tx)
      : await this.prisma.$transaction(async (tx) => await userHelper(tx));
  }
}
