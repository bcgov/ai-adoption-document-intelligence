/**
 * Export per-document HITL timing data for the SDPR experiment.
 *
 * Pulls ReviewSession + FieldCorrection rows for all documents tagged with
 * source = "sdpr-hitl-timing-experiment" and writes two CSVs:
 *
 *   sessions.csv     — one row per ReviewSession with started_at,
 *                       completed_at, total seconds, # corrections,
 *                       # by action.
 *   corrections.csv  — one row per FieldCorrection with field, action,
 *                       original/corrected values, created_at.
 *                       NOTE: corrected_value may contain PII the reviewer
 *                       typed. Treat the CSV as confidential.
 *
 * Usage (from repo root):
 *   npx tsx scripts/sdpr-experiment/export-timings.ts \
 *       --out-dir ./scripts/sdpr-experiment/output
 */
import "dotenv/config";
import { mkdirSync, createWriteStream } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../apps/backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../apps/backend-services/src/utils/database-url";

const SOURCE_TAG = "sdpr-hitl-timing-experiment";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main(): Promise<number> {
  let outDir = "./scripts/sdpr-experiment/output";
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--out-dir" && process.argv[i + 1]) outDir = process.argv[++i];
  }
  mkdirSync(outDir, { recursive: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("error: DATABASE_URL not set");
    return 2;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)),
  });

  const documents = await prisma.document.findMany({
    where: {
      metadata: {
        path: ["experiment"],
        equals: SOURCE_TAG,
      } as never,
    },
    include: {
      review_sessions: {
        include: { corrections: { orderBy: { created_at: "asc" } } },
        orderBy: { started_at: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });

  const sessionsPath = path.join(outDir, "sessions.csv");
  const correctionsPath = path.join(outDir, "corrections.csv");

  const sessions = createWriteStream(sessionsPath);
  sessions.write(
    "documentId,title,sessionId,status,startedAt,completedAt,durationSeconds,totalCorrections,confirmed,corrected,flagged,deleted\n",
  );

  const corrections = createWriteStream(correctionsPath);
  corrections.write(
    "documentId,title,sessionId,fieldKey,action,originalValue,correctedValue,originalConfidence,createdAt\n",
  );

  let sessionCount = 0;
  let correctionCount = 0;

  for (const doc of documents) {
    for (const sess of doc.review_sessions) {
      const startMs = sess.started_at.getTime();
      const endMs = sess.completed_at?.getTime();
      const dur = endMs != null ? (endMs - startMs) / 1000 : "";

      const byAction = { confirmed: 0, corrected: 0, flagged: 0, deleted: 0 };
      for (const c of sess.corrections) {
        const key = c.action as keyof typeof byAction;
        if (key in byAction) byAction[key]++;
      }

      sessions.write(
        [
          csvEscape(doc.id),
          csvEscape(doc.title),
          csvEscape(sess.id),
          csvEscape(sess.status),
          csvEscape(sess.started_at.toISOString()),
          csvEscape(endMs != null ? sess.completed_at?.toISOString() : ""),
          csvEscape(dur),
          csvEscape(sess.corrections.length),
          csvEscape(byAction.confirmed),
          csvEscape(byAction.corrected),
          csvEscape(byAction.flagged),
          csvEscape(byAction.deleted),
        ].join(",") + "\n",
      );
      sessionCount++;

      for (const c of sess.corrections) {
        corrections.write(
          [
            csvEscape(doc.id),
            csvEscape(doc.title),
            csvEscape(sess.id),
            csvEscape(c.field_key),
            csvEscape(c.action),
            csvEscape(c.original_value),
            csvEscape(c.corrected_value),
            csvEscape(c.original_conf),
            csvEscape(c.created_at.toISOString()),
          ].join(",") + "\n",
        );
        correctionCount++;
      }
    }
  }

  sessions.end();
  corrections.end();
  await new Promise<void>((resolve) => sessions.on("close", () => resolve()));
  await new Promise<void>((resolve) => corrections.on("close", () => resolve()));

  console.log(`wrote ${sessionsPath} (${sessionCount} sessions)`);
  console.log(`wrote ${correctionsPath} (${correctionCount} corrections)`);
  console.log(`covered ${documents.length} experiment documents`);

  await prisma.$disconnect();
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
