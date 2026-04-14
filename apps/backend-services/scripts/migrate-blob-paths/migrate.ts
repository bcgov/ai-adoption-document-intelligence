/**
 * Migrate legacy Azure blob storage paths to the standardized
 * `{groupId}/{category}/...` layout introduced in AI-1073.
 *
 * Covers two targets:
 *   - LabelingDocument blobs: `labeling-documents/{id}/...`
 *       → `{groupId}/training/labeling-documents/{id}/...`
 *       (also rewrites LabelingDocument.file_path / normalized_file_path)
 *   - Dataset blobs: `datasets/{datasetId}/{versionId}/...`
 *       → `{groupId}/benchmark/datasets/{datasetId}/{versionId}/...`
 *       (DatasetVersion.storagePrefix stays unchanged — relative portion)
 *
 * Two phases:
 *   --phase=copy     non-destructive; copies blobs + rewrites DB rows.
 *   --phase=cleanup  destructive; deletes old blobs whose new counterpart
 *                    is already present. Run this only after the new code
 *                    is deployed and smoke-tested.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register \
 *     scripts/migrate-blob-paths/migrate.ts \
 *     --phase=copy --category=all --execute
 *
 * Env:
 *   AZURE_STORAGE_CONNECTION_STRING
 *   AZURE_STORAGE_CONTAINER_NAME
 *   DATABASE_URL
 */

import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { PrismaClient } from "@generated/client";

interface Args {
  phase: "copy" | "cleanup";
  category: "labeling-documents" | "datasets" | "all";
  execute: boolean;
  concurrency: number;
}

interface WorkUnit {
  label: string;
  blobs: Array<{ oldKey: string; newKey: string }>;
  finalize?: () => Promise<void>;
}

const TRAINING_CATEGORY = "training";
const BENCHMARK_CATEGORY = "benchmark";
const LABELING_OLD_PREFIX = "labeling-documents/";
const DATASETS_OLD_PREFIX = "datasets/";

function parseArgs(): Args {
  const map: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [k, v] = arg.slice(2).split("=");
    map[k] = v ?? "true";
  }

  const phase = (map.phase ?? "copy") as Args["phase"];
  if (phase !== "copy" && phase !== "cleanup") {
    throw new Error(`--phase must be "copy" or "cleanup" (got "${phase}")`);
  }

  const category = (map.category ?? "all") as Args["category"];
  if (
    category !== "labeling-documents" &&
    category !== "datasets" &&
    category !== "all"
  ) {
    throw new Error(
      `--category must be "labeling-documents", "datasets", or "all"`,
    );
  }

  const execute = map.execute === "true";
  const concurrency = map.concurrency
    ? Number.parseInt(map.concurrency, 10)
    : 10;
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error(`--concurrency must be a positive integer`);
  }

  return { phase, category, execute, concurrency };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx], idx);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

// --- Work collection ------------------------------------------------------

async function collectLabelingDocumentWork(
  prisma: PrismaClient,
): Promise<WorkUnit[]> {
  const rows = await prisma.labelingDocument.findMany({
    where: {
      OR: [
        { file_path: { startsWith: LABELING_OLD_PREFIX } },
        { normalized_file_path: { startsWith: LABELING_OLD_PREFIX } },
      ],
    },
    select: {
      id: true,
      group_id: true,
      file_path: true,
      normalized_file_path: true,
    },
  });

  const units: WorkUnit[] = [];
  for (const row of rows) {
    const blobs: WorkUnit["blobs"] = [];
    const updates: {
      file_path?: string;
      normalized_file_path?: string;
    } = {};

    if (row.file_path.startsWith(LABELING_OLD_PREFIX)) {
      const newKey = `${row.group_id}/${TRAINING_CATEGORY}/${row.file_path}`;
      blobs.push({ oldKey: row.file_path, newKey });
      updates.file_path = newKey;
    }
    if (row.normalized_file_path?.startsWith(LABELING_OLD_PREFIX)) {
      const newKey = `${row.group_id}/${TRAINING_CATEGORY}/${row.normalized_file_path}`;
      blobs.push({ oldKey: row.normalized_file_path, newKey });
      updates.normalized_file_path = newKey;
    }

    if (blobs.length === 0) continue;

    units.push({
      label: `labeling-document ${row.id}`,
      blobs,
      finalize: async () => {
        await prisma.labelingDocument.update({
          where: { id: row.id },
          data: updates,
        });
      },
    });
  }

  return units;
}

async function collectDatasetWork(
  prisma: PrismaClient,
  container: ContainerClient,
): Promise<WorkUnit[]> {
  const datasets = await prisma.dataset.findMany({
    select: { id: true, group_id: true },
  });
  const groupByDatasetId = new Map(datasets.map((d) => [d.id, d.group_id]));

  const units: WorkUnit[] = [];
  const orphaned: string[] = [];

  for await (const blob of container.listBlobsFlat({
    prefix: DATASETS_OLD_PREFIX,
  })) {
    const key = blob.name;
    // Expected: datasets/{datasetId}/{versionId}/...
    const parts = key.split("/");
    if (parts.length < 3) continue;
    const datasetId = parts[1];
    const groupId = groupByDatasetId.get(datasetId);
    if (!groupId) {
      orphaned.push(key);
      continue;
    }
    const newKey = `${groupId}/${BENCHMARK_CATEGORY}/${key}`;
    units.push({
      label: key,
      blobs: [{ oldKey: key, newKey }],
    });
  }

  if (orphaned.length > 0) {
    console.warn(
      `⚠ ${orphaned.length} dataset blob(s) reference unknown dataset IDs — skipped. ` +
        `Examples: ${orphaned.slice(0, 3).join(", ")}`,
    );
  }

  return units;
}

// --- Phase implementations ------------------------------------------------

interface UnitResult {
  label: string;
  status:
    | "copied"
    | "skipped-already-migrated"
    | "deleted"
    | "skipped-new-missing"
    | "skipped-source-missing"
    | "failed";
  error?: string;
}

async function copyUnit(
  container: ContainerClient,
  unit: WorkUnit,
  execute: boolean,
): Promise<UnitResult> {
  const copied: string[] = [];

  for (const { oldKey, newKey } of unit.blobs) {
    const src = container.getBlockBlobClient(oldKey);
    const dst = container.getBlockBlobClient(newKey);

    if (await dst.exists()) {
      // Already migrated — skip this blob, but the unit may have others
      continue;
    }
    if (!(await src.exists())) {
      return {
        label: unit.label,
        status: "failed",
        error: `source blob missing: ${oldKey}`,
      };
    }
    if (!execute) {
      copied.push(newKey);
      continue;
    }

    try {
      const poller = await dst.beginCopyFromURL(src.url);
      await poller.pollUntilDone();

      const [srcProps, dstProps] = await Promise.all([
        src.getProperties(),
        dst.getProperties(),
      ]);
      if (srcProps.contentLength !== dstProps.contentLength) {
        await dst.deleteIfExists();
        return {
          label: unit.label,
          status: "failed",
          error: `size mismatch for ${oldKey} (src=${srcProps.contentLength}, dst=${dstProps.contentLength})`,
        };
      }
      copied.push(newKey);
    } catch (err) {
      return {
        label: unit.label,
        status: "failed",
        error: `copy failed for ${oldKey}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // If nothing needed copying, everything was already in place.
  if (copied.length === 0) {
    return { label: unit.label, status: "skipped-already-migrated" };
  }

  if (execute && unit.finalize) {
    try {
      await unit.finalize();
    } catch (err) {
      // Roll back any blobs this unit just copied so a retry starts clean.
      await Promise.all(
        copied.map((key) =>
          container
            .getBlockBlobClient(key)
            .deleteIfExists()
            .catch(() => {
              /* best-effort */
            }),
        ),
      );
      return {
        label: unit.label,
        status: "failed",
        error: `finalize (DB update) failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { label: unit.label, status: "copied" };
}

async function cleanupUnit(
  container: ContainerClient,
  unit: WorkUnit,
  execute: boolean,
): Promise<UnitResult> {
  let anyDeleted = false;
  let anyNewMissing = false;

  for (const { oldKey, newKey } of unit.blobs) {
    const src = container.getBlockBlobClient(oldKey);
    const dst = container.getBlockBlobClient(newKey);

    if (!(await dst.exists())) {
      anyNewMissing = true;
      continue;
    }
    if (!(await src.exists())) {
      continue;
    }
    if (!execute) {
      anyDeleted = true;
      continue;
    }
    try {
      await src.delete();
      anyDeleted = true;
    } catch (err) {
      return {
        label: unit.label,
        status: "failed",
        error: `delete failed for ${oldKey}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (anyDeleted) return { label: unit.label, status: "deleted" };
  if (anyNewMissing)
    return { label: unit.label, status: "skipped-new-missing" };
  return { label: unit.label, status: "skipped-source-missing" };
}

// --- Main ------------------------------------------------------------------

function summarize(category: string, results: UnitResult[]): void {
  const counts: Record<string, number> = {};
  const failures: UnitResult[] = [];
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.status === "failed") failures.push(r);
  }
  console.log(
    `[${category}] ${
      Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "no units"
    }`,
  );
  for (const f of failures.slice(0, 10)) {
    console.log(`[${category}] FAIL ${f.label}: ${f.error}`);
  }
  if (failures.length > 10) {
    console.log(`[${category}] ...and ${failures.length - 10} more failures`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(
    `Blob-path migration: phase=${args.phase}, category=${args.category}, ${
      args.execute ? "EXECUTE" : "DRY-RUN"
    }, concurrency=${args.concurrency}`,
  );

  const connectionString = requireEnv("AZURE_STORAGE_CONNECTION_STRING");
  const containerName = requireEnv("AZURE_STORAGE_CONTAINER_NAME");
  requireEnv("DATABASE_URL");

  const serviceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const container = serviceClient.getContainerClient(containerName);
  if (!(await container.exists())) {
    throw new Error(`Container "${containerName}" does not exist.`);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;

    const targets: Array<{
      name: string;
      collect: () => Promise<WorkUnit[]>;
    }> = [];
    if (args.category === "labeling-documents" || args.category === "all") {
      targets.push({
        name: "labeling-documents",
        collect: () => collectLabelingDocumentWork(prisma),
      });
    }
    if (args.category === "datasets" || args.category === "all") {
      targets.push({
        name: "datasets",
        collect: () => collectDatasetWork(prisma, container),
      });
    }

    let hadFailures = false;
    for (const target of targets) {
      console.log(`\n=== ${target.name} ===`);
      const units = await target.collect();
      console.log(`Collected ${units.length} unit(s) to process.`);

      const worker =
        args.phase === "copy"
          ? (u: WorkUnit) => copyUnit(container, u, args.execute)
          : (u: WorkUnit) => cleanupUnit(container, u, args.execute);

      const results = await runWithLimit(units, args.concurrency, worker);
      summarize(target.name, results);
      if (results.some((r) => r.status === "failed")) hadFailures = true;
    }

    process.exitCode = hadFailures ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Migration aborted:", err);
  process.exit(1);
});
