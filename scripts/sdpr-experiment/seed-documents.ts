/**
 * Seed 99 SDPR experiment Documents (metadata only — no PII) by reading
 * sampleIds from a benchmark JSON streamed on stdin.
 *
 * Creates ONE Document row per sample with:
 *   - source = "api" (so it passes the HITL queue's source filter)
 *   - metadata = { experiment: "sdpr-hitl-timing-experiment", sampleId }
 *     (the marker the HitlService uses to switch to experiment behavior)
 *   - file_path = "<sampleId>.pdf" (resolved by the UNC filesystem blob adapter)
 *
 * NO OcrResult row is created. OCR field values are NEVER written to the DB.
 * The backend loads them from the benchmark JSON on the share into memory
 * via ExperimentOcrLoaderService.
 *
 * Idempotent: re-running upserts by (group_id, metadata.experiment, metadata.sampleId).
 *
 * Usage (from repo root):
 *   stream-bench.sh | npx tsx scripts/sdpr-experiment/seed-documents.ts \
 *     --group-id seeddefaultgroup \
 *     [--model-id sdpr-monthly-prod-neural-v2] \
 *     [--limit N]
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DocumentStatus,
  PrismaClient,
} from "../../apps/backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../apps/backend-services/src/utils/database-url";

const EXPERIMENT_TAG = "sdpr-hitl-timing-experiment";

type Args = { groupId: string; modelId: string; limit: number | null };

function parseArgs(argv: string[]): Args {
  const args: Args = {
    groupId: "seeddefaultgroup",
    modelId: "sdpr-monthly-prod-neural-v2",
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--group-id" && argv[i + 1]) {
      args.groupId = argv[++i];
      continue;
    }
    if (argv[i] === "--model-id" && argv[i + 1]) {
      args.modelId = argv[++i];
      continue;
    }
    if (argv[i] === "--limit" && argv[i + 1]) {
      args.limit = Number.parseInt(argv[++i], 10);
      continue;
    }
  }
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function stripSuffix(s: string): string {
  return s.replace(/\.(jpg|jpeg|png|tif|tiff|pdf)$/i, "");
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const json = await readStdin();
  const data = JSON.parse(json);
  const samples = (data?.perSampleResults ?? []) as Array<{
    sampleId?: string;
  }>;
  if (!samples.length) {
    console.error("error: no perSampleResults in input");
    return 2;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("error: DATABASE_URL not set");
    return 2;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)),
  });

  const group = await prisma.group.findUnique({ where: { id: args.groupId } });
  if (!group) {
    console.error(
      `error: group "${args.groupId}" not found — run npm run db:seed first`,
    );
    await prisma.$disconnect();
    return 2;
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const toProcess = args.limit ? samples.slice(0, args.limit) : samples;
  for (const sample of toProcess) {
    if (!sample.sampleId) {
      skipped++;
      continue;
    }
    const sampleId = stripSuffix(sample.sampleId);
    const fileName = `${sampleId}.pdf`;
    const title = `[${EXPERIMENT_TAG}] ${sampleId}`;

    // Identify experiment docs via JSON metadata. Source stays "api" so the
    // HITL queue's source filter passes; the metadata marker drives the
    // experiment behavior in HitlService.
    const metadata = {
      experiment: EXPERIMENT_TAG,
      sampleId,
    };

    const existing = await prisma.document.findFirst({
      where: {
        group_id: args.groupId,
        title,
      },
    });

    if (existing) {
      // Build a structured blob path that passes validateBlobFilePath:
      // `{cuid}/ocr/sdpr-experiment/<sampleId>.pdf`. The UNC adapter resolves
      // only the basename, so the prefix doesn't have to point at a real
      // share directory — it just has to be a CUID + valid category.
      const blobPath = `${existing.id}/ocr/sdpr-experiment/${fileName}`;
      await prisma.document.update({
        where: { id: existing.id },
        data: {
          original_filename: fileName,
          file_path: blobPath,
          normalized_file_path: blobPath,
          file_type: "application/pdf",
          status: DocumentStatus.completed_ocr,
          model_id: args.modelId,
          metadata,
        },
      });
      // Defensive: if a prior run left an OcrResult on this document, drop it
      // so OCR data lives only in memory.
      await prisma.ocrResult.deleteMany({ where: { document_id: existing.id } });
      updated++;
    } else {
      // Two-step: create the Document to mint a CUID, then update file_path
      // to a structured `{cuid}/ocr/sdpr-experiment/<sampleId>.pdf` that
      // passes validateBlobFilePath.
      const created = await prisma.document.create({
        data: {
          title,
          original_filename: fileName,
          file_path: fileName, // placeholder, replaced below
          normalized_file_path: fileName,
          file_type: "application/pdf",
          file_size: 0,
          source: "api",
          status: DocumentStatus.completed_ocr,
          model_id: args.modelId,
          group_id: args.groupId,
          metadata,
        },
      });
      const blobPath = `${created.id}/ocr/sdpr-experiment/${fileName}`;
      await prisma.document.update({
        where: { id: created.id },
        data: { file_path: blobPath, normalized_file_path: blobPath },
      });
      inserted++;
    }
  }

  console.log(
    `seeded ${inserted} new, updated ${updated}, skipped ${skipped} (total samples processed: ${toProcess.length})`,
  );
  console.log(
    `NOTE: no OcrResult rows created — field values live only in backend memory via ExperimentOcrLoaderService.`,
  );
  await prisma.$disconnect();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("seed failed:", err);
    process.exit(1);
  });
