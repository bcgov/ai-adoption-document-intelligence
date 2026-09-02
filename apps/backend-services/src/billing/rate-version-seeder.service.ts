import * as fs from "node:fs";
import * as path from "node:path";
import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { RateVersionEntry } from "./rate-version.types";

@Injectable()
export class RateVersionSeederService implements OnApplicationBootstrap {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Seeds RateVersion and ActivityCost rows from rate_versions.json on startup.
   * Idempotent: versions that already exist in the database are skipped.
   */
  async onApplicationBootstrap(): Promise<void> {
    const entries = this.loadRateVersionsFile();
    for (const entry of entries) {
      await this.seedRateVersion(entry);
    }
  }

  /**
   * Loads and parses the rate_versions.json file from the billing directory.
   */
  loadRateVersionsFile(): RateVersionEntry[] {
    const filePath = path.join(__dirname, "rate_versions.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RateVersionEntry[];
  }

  /**
   * Inserts a single RateVersion and its ActivityCost rows in a transaction
   * if the version does not already exist. If the version exists, any activity
   * cost entries present in the JSON but missing from the database are inserted
   * (handles additions to existing versions such as training costs).
   */
  async seedRateVersion(entry: RateVersionEntry): Promise<void> {
    const existing = await this.prismaService.prisma.rateVersion.findUnique({
      where: { version: entry.version },
      include: { activity_costs: true },
    });

    if (existing) {
      // Backfill any activity costs that are in the JSON but not in the DB
      const existingNames = new Set(
        existing.activity_costs.map((ac) => ac.activity_name),
      );
      const missing = Object.entries(entry.activity_costs).filter(
        ([name]) => !existingNames.has(name),
      );

      if (missing.length > 0) {
        await this.prismaService.prisma.activityCost.createMany({
          data: missing.map(([activity_name, cost]) => ({
            rate_version_id: existing.id,
            activity_name,
            cost_type: cost.cost_type,
            units: cost.units,
          })),
          skipDuplicates: true,
        });
        this.logger.log("Backfilled missing activity costs", {
          version: entry.version,
          added: missing.map(([name]) => name),
        });
      } else {
        this.logger.debug("Rate version already exists, skipping", {
          version: entry.version,
        });
      }
      return;
    }

    await this.prismaService.prisma.$transaction(async (tx) => {
      const rateVersion = await tx.rateVersion.create({
        data: {
          version: entry.version,
          effective_from: new Date(entry.effective_from),
          unit_cost_dollars: entry.unit_cost_dollars,
          units_per_gb_per_month: entry.units_per_gb_per_month,
          max_pages_assumption: entry.max_pages_assumption,
          max_array_items_assumption: entry.max_array_items_assumption,
        },
      });

      const activityCostData = Object.entries(entry.activity_costs).map(
        ([activity_name, cost]) => ({
          rate_version_id: rateVersion.id,
          activity_name,
          cost_type: cost.cost_type,
          units: cost.units,
        }),
      );

      if (activityCostData.length > 0) {
        await tx.activityCost.createMany({ data: activityCostData });
      }
    });

    this.logger.log("Seeded rate version", { version: entry.version });
  }

  /**
   * Returns the active RateVersion at the given timestamp — the version with
   * the highest effective_from that is ≤ the given timestamp.
   */
  async getActiveRateVersion(at: Date) {
    return this.prismaService.prisma.rateVersion.findFirst({
      where: { effective_from: { lte: at } },
      orderBy: { effective_from: "desc" },
      include: { activity_costs: true },
    });
  }

  /**
   * Returns the training costs for the active rate version at the given
   * timestamp, paired with the rate version's id and unit_cost_dollars.
   * Training costs are read from rate_versions.json (not stored in the DB).
   *
   * @returns null if no active rate version is found or the version is not in
   * the JSON file.
   */
  /**
   * Returns the training costs for the active rate version at the given
   * timestamp. Training costs are stored as ActivityCost rows with names
   * `training.template_model` and `training.classifier`.
   *
   * @returns null if no active rate version is found or training cost rows are missing.
   */
  async getActiveTrainingCosts(at: Date): Promise<{
    rateVersionId: string;
    unitCostDollars: number;
    templateModelCost: number;
    classifierCost: number;
  } | null> {
    const rateVersion = await this.getActiveRateVersion(at);
    if (!rateVersion) {
      return null;
    }

    const templateCost = rateVersion.activity_costs.find(
      (ac) => ac.activity_name === "training.template_model",
    );
    const classifierCost = rateVersion.activity_costs.find(
      (ac) => ac.activity_name === "training.classifier",
    );

    if (!templateCost || !classifierCost) {
      return null;
    }

    return {
      rateVersionId: rateVersion.id,
      unitCostDollars: Number(rateVersion.unit_cost_dollars),
      templateModelCost: Number(templateCost.units),
      classifierCost: Number(classifierCost.units),
    };
  }
}
