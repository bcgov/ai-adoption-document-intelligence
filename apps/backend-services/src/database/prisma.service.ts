import { PrismaClient } from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "@/utils/database-url";

@Injectable()
export class PrismaService {
  private readonly logger = new Logger(PrismaService.name);
  public readonly prisma: PrismaClient;

  constructor(private configService: ConfigService) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      log: ["error", "warn"],
      adapter: new PrismaPg(dbOptions),
    });
    this.logger.log("Prisma client initialized");
  }
}
