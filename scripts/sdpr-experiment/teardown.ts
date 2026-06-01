/**
 * Remove all SDPR HITL timing experiment documents from the DB.
 *
 * Deletes every Document where metadata.experiment = "sdpr-hitl-timing-experiment".
 * ReviewSession + FieldCorrection + DocumentLock cascade via Prisma's
 * onDelete relations.
 *
 * Usage (from repo root):
 *   npx tsx scripts/sdpr-experiment/teardown.ts [--group-id seeddefaultgroup]
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../apps/backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../apps/backend-services/src/utils/database-url";

const EXPERIMENT_TAG = "sdpr-hitl-timing-experiment";

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("error: DATABASE_URL not set");
    return 2;
  }
  let groupId = "seeddefaultgroup";
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--group-id" && process.argv[i + 1])
      groupId = process.argv[++i];
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)),
  });

  // Find experiment docs via JSON-path filter on metadata.experiment.
  const experimentDocs = await prisma.document.findMany({
    where: {
      group_id: groupId,
      metadata: {
        path: ["experiment"],
        equals: EXPERIMENT_TAG,
      } as never, // Prisma JSON-path filter typing
    },
    select: { id: true },
  });

  if (experimentDocs.length === 0) {
    console.log(
      `no experiment documents found (group=${groupId}, metadata.experiment=${EXPERIMENT_TAG})`,
    );
    await prisma.$disconnect();
    return 0;
  }

  const result = await prisma.document.deleteMany({
    where: { id: { in: experimentDocs.map((d) => d.id) } },
  });
  console.log(
    `deleted ${result.count} experiment documents (group=${groupId})`,
  );
  await prisma.$disconnect();
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
