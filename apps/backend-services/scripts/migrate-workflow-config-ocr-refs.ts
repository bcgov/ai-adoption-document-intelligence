/**
 * CLI: migrate workflow_versions.config to OCR *Ref ctx keys.
 *
 * Usage:
 *   npx tsx scripts/migrate-workflow-config-ocr-refs.ts [--apply] [--refresh-benchmark-hashes]
 */

import "dotenv/config";
import { PrismaClient } from "@generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "../src/utils/database-url";
import { computeConfigHash } from "../src/workflow/config-hash";
import { validateGraphConfig } from "../src/workflow/graph-schema-validator";
import type { GraphWorkflowConfig } from "../src/workflow/graph-workflow-types";
import {
  findLegacyOcrIdentifiers,
  migrateGraphConfigToOcrRefs,
} from "../src/workflow/migrate-graph-config-ocr-refs";

const apply = process.argv.includes("--apply");
const refreshBenchmarkHashes = process.argv.includes(
  "--refresh-benchmark-hashes",
);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)),
  });
  const versions = await prisma.workflowVersion.findMany({
    select: { id: true, config: true },
  });

  let changed = 0;
  const failures: string[] = [];

  for (const row of versions) {
    const config = row.config as unknown as GraphWorkflowConfig;
    const migrated = migrateGraphConfigToOcrRefs(config);
    const validation = validateGraphConfig(migrated);
    const legacy = findLegacyOcrIdentifiers(migrated);

    if (!validation.valid) {
      failures.push(
        `${row.id}: validation ${JSON.stringify(validation.errors)}`,
      );
      continue;
    }
    if (legacy.length > 0) {
      failures.push(`${row.id}: legacy keys ${JSON.stringify(legacy)}`);
      continue;
    }

    if (JSON.stringify(config) !== JSON.stringify(migrated)) {
      changed++;
      if (apply) {
        await prisma.workflowVersion.update({
          where: { id: row.id },
          data: { config: migrated as object },
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        total: versions.length,
        changed,
        failures,
      },
      null,
      2,
    ),
  );

  if (refreshBenchmarkHashes && apply) {
    // Definition.workflowConfigHash is the base config hash only; overrides are
    // stored separately and merged at run time via computeConfigHashWithOverrides.
    const definitions = await prisma.benchmarkDefinition.findMany();
    for (const def of definitions) {
      const version = await prisma.workflowVersion.findUnique({
        where: { id: def.workflowVersionId },
      });
      if (!version?.config) continue;
      const hash = computeConfigHash(version.config as GraphWorkflowConfig);
      await prisma.benchmarkDefinition.update({
        where: { id: def.id },
        data: { workflowConfigHash: hash },
      });
    }
    console.log(`Refreshed ${definitions.length} benchmark definition hashes`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
