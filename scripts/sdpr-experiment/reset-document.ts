/**
 * Reset a single experiment document by deleting its ReviewSession(s) so the
 * doc returns to the unreviewed state in the HITL queue. Cascades to
 * FieldCorrection and DocumentLock via Prisma onDelete relations.
 *
 * Usage (from repo root):
 *   npx tsx scripts/sdpr-experiment/reset-document.ts --doc-id <id>
 *   npx tsx scripts/sdpr-experiment/reset-document.ts --all   # reset every experiment doc
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../apps/backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../apps/backend-services/src/utils/database-url";

const EXPERIMENT_TAG = "sdpr-hitl-timing-experiment";

async function main(): Promise<number> {
  let docId: string | null = null;
  let all = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--doc-id" && process.argv[i + 1]) docId = process.argv[++i];
    if (process.argv[i] === "--all") all = true;
  }
  if (!docId && !all) {
    console.error("usage: reset-document.ts --doc-id <id> | --all");
    return 2;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("error: DATABASE_URL not set");
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)) });

  let targetDocIds: string[];
  if (all) {
    const docs = await prisma.document.findMany({
      where: { metadata: { path: ["experiment"], equals: EXPERIMENT_TAG } as never },
      select: { id: true },
    });
    targetDocIds = docs.map((d) => d.id);
  } else {
    targetDocIds = [docId as string];
  }

  // Locks have onDelete via the session, but releasing them explicitly avoids
  // surprises if the cascade order differs in a future schema rev.
  const lockResult = await prisma.documentLock.deleteMany({
    where: { document_id: { in: targetDocIds } },
  });
  const sessionResult = await prisma.reviewSession.deleteMany({
    where: { document_id: { in: targetDocIds } },
  });
  console.log(
    `reset ${targetDocIds.length} document(s): removed ${sessionResult.count} sessions, ${lockResult.count} locks`,
  );
  await prisma.$disconnect();
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
