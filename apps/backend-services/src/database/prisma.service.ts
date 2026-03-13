import { PrismaClient } from "@generated/client";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getPrismaPgOptions } from "@/utils/database-url";

@Injectable()
export class PrismaService implements OnModuleInit {
  public readonly prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      log: [
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
      adapter: new PrismaPg(dbOptions),
    });
  }

  onModuleInit(): void {
    this.prisma.$on("warn", (e: { message: string; target?: string }) => {
      this.logger.warn(e.message, { category: "external", target: e.target });
    });
    this.prisma.$on("error", (e: { message: string; target?: string }) => {
      this.logger.error(e.message, { category: "external", target: e.target });
    });
    this.logger.log("Prisma client initialized");
  }
}
