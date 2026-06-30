/**
 * Dev-only: on backend startup, sync local-folder datasets in `data/datasets/`
 * to blob storage so the existing benchmark / sample-preview infrastructure
 * (which pulls from blob storage) can find the files.
 *
 * Pairs with `seedLocalDatasets()` in `apps/shared/prisma/seed.ts` — the seed
 * creates `Dataset` + `DatasetVersion` rows pointing at the *eventual* blob
 * storage path; this service ensures the actual files live there.
 *
 * Idempotent: skips files that already exist in blob storage. Re-runs after
 * adding new files pick up only the new ones.
 *
 * Disabled in production (`NODE_ENV === "production"`) and can be turned off
 * explicitly via `SYNC_LOCAL_DATASETS_ON_START=false`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import {
  BLOB_STORAGE,
  type BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobFilePath,
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  localDatasetId,
  localDatasetVersionId,
  type ParsedLocalDataset,
  parseLocalDatasets,
} from "./local-datasets";

/** Narrow Prisma surface used by the sync function — keeps tests free of full PrismaClient types. */
export interface DatasetVersionUpdater {
  datasetVersion: {
    update: (args: {
      where: { id: string };
      data: {
        storagePrefix: string;
        manifestPath: string;
        documentCount: number;
      };
    }) => Promise<unknown>;
  };
}

/** Group ID owned by the seed script (must match `SEED_GROUP_ID` in `apps/shared/prisma/seed.ts`). */
const SEED_GROUP_ID = "seeddefaultgroup";

interface DatasetManifestSample {
  id: string;
  inputs?: Array<{ path: string; mimeType: string }>;
  groundTruth?: Array<{ path: string; format: string }>;
  metadata?: Record<string, unknown>;
}

interface BlobDatasetManifest {
  schemaVersion: string;
  samples: Array<{
    id: string;
    inputs: Array<{ path: string; mimeType: string }>;
    groundTruth: Array<{ path: string; format: string }>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface LocalDatasetSyncResult {
  folder: string;
  visibility: "public" | "private";
  uploaded: number;
  skipped: number;
}

@Injectable()
export class LocalDatasetSyncService implements OnApplicationBootstrap {
  constructor(
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    if (process.env.SYNC_LOCAL_DATASETS_ON_START === "false") {
      this.logger.debug(
        "Local dataset sync disabled (SYNC_LOCAL_DATASETS_ON_START=false)",
      );
      return;
    }

    const force = process.env.FORCE_RESYNC_LOCAL_DATASETS === "true";

    const repoRoot = path.resolve(__dirname, "../../../..");
    const datasetsDir = path.join(repoRoot, "data", "datasets");

    const parsed = parseLocalDatasets(datasetsDir, repoRoot, {
      warn: (msg) => this.logger.warn(`local-dataset-sync: ${msg}`),
    });

    if (parsed.length === 0) {
      return;
    }

    this.logger.log(
      `Syncing ${parsed.length} local dataset version(s) to blob storage${force ? " (force mode: will delete + re-upload)" : ""}...`,
    );

    for (const entry of parsed) {
      try {
        const result = await this.syncOne(entry, repoRoot, { force });
        this.logger.log(
          `Synced ${result.folder}/${result.visibility}: ${result.uploaded} uploaded, ${result.skipped} skipped`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to sync local dataset ${entry.folder}/${entry.visibility}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error && err.stack ? { stack: err.stack } : undefined,
        );
      }
    }
  }

  /**
   * Sync one parsed local dataset version to blob storage. Public for testing.
   */
  async syncOne(
    entry: ParsedLocalDataset,
    repoRoot: string,
    options: { force?: boolean } = {},
  ): Promise<LocalDatasetSyncResult> {
    return syncLocalDatasetToBlobStorage(
      entry,
      repoRoot,
      this.blobStorage,
      this.prisma.prisma as unknown as DatasetVersionUpdater,
      options,
    );
  }
}

/**
 * Pure-ish sync function so it can be unit tested without spinning up NestJS.
 *
 * `options.force` (default false) — when true, deletes all blobs under the
 * dataset's prefix before uploading. Use after local renames or content edits
 * that the standard idempotent sync can't propagate (because it skips files
 * that already exist on blob storage). The next benchmark run will also need
 * a clean materialized cache; the temporal worker re-downloads on each run
 * so blob is the source of truth.
 */
export async function syncLocalDatasetToBlobStorage(
  entry: ParsedLocalDataset,
  repoRoot: string,
  blobStorage: BlobStorageInterface,
  prisma: DatasetVersionUpdater,
  options: { force?: boolean } = {},
): Promise<LocalDatasetSyncResult> {
  const datasetId = localDatasetId(entry.folder, entry.visibility);
  const versionId = localDatasetVersionId(entry.folder, entry.visibility);
  const folderPath = path.join(repoRoot, entry.storagePrefix);
  const manifestFilePath = path.join(repoRoot, entry.manifestPath);

  const manifest: { samples?: DatasetManifestSample[] } = JSON.parse(
    fs.readFileSync(manifestFilePath, "utf-8"),
  );
  const samples = Array.isArray(manifest.samples) ? manifest.samples : [];

  const blobStoragePrefix = `datasets/${datasetId}/${versionId}`;

  // Force mode: nuke the prefix so subsequent writes overwrite cleanly and
  // any blobs not in the local manifest (orphans from prior layouts) are
  // removed. Without this, the existence-skip below would leave stale files
  // on cloud storage forever.
  if (options.force) {
    const fullPrefix = buildBlobPrefixPath(
      SEED_GROUP_ID,
      OperationCategory.BENCHMARK,
      [blobStoragePrefix],
    );
    await blobStorage.deleteByPrefix(fullPrefix);
  }

  let uploaded = 0;
  let skipped = 0;

  for (const sample of samples) {
    for (const input of sample.inputs ?? []) {
      const filename = path.basename(input.path);
      const blobKey = buildBlobFilePath(
        SEED_GROUP_ID,
        OperationCategory.BENCHMARK,
        [blobStoragePrefix, "inputs"],
        filename,
      );
      if (await blobStorage.exists(blobKey)) {
        skipped++;
        continue;
      }
      const localFile = path.join(folderPath, input.path);
      const data = await fs.promises.readFile(localFile);
      await blobStorage.write(blobKey, data);
      uploaded++;
    }
    for (const gt of sample.groundTruth ?? []) {
      const filename = path.basename(gt.path);
      const blobKey = buildBlobFilePath(
        SEED_GROUP_ID,
        OperationCategory.BENCHMARK,
        [blobStoragePrefix, "ground-truth"],
        filename,
      );
      if (await blobStorage.exists(blobKey)) {
        skipped++;
        continue;
      }
      const localFile = path.join(folderPath, gt.path);
      const data = await fs.promises.readFile(localFile);
      await blobStorage.write(blobKey, data);
      uploaded++;
    }
  }

  // Always overwrite the dataset-manifest.json (cheap, lets the manifest catch
  // up if the local manifest changed). The blob manifest follows the existing
  // dataset.service.ts schema (schemaVersion + samples with inputs/groundTruth/...).
  const datasetManifest: BlobDatasetManifest = {
    schemaVersion: "1.0",
    samples: samples.map((sample) => ({
      id: sample.id,
      inputs: (sample.inputs ?? []).map((input) => ({
        path: `inputs/${path.basename(input.path)}`,
        mimeType: input.mimeType,
      })),
      groundTruth: (sample.groundTruth ?? []).map((gt) => ({
        path: `ground-truth/${path.basename(gt.path)}`,
        format: gt.format,
      })),
      ...(sample.metadata ? { metadata: sample.metadata } : {}),
    })),
  };
  const manifestKey = buildBlobFilePath(
    SEED_GROUP_ID,
    OperationCategory.BENCHMARK,
    [blobStoragePrefix],
    "dataset-manifest.json",
  );
  await blobStorage.write(
    manifestKey,
    Buffer.from(JSON.stringify(datasetManifest, null, 2)),
  );

  // Update DatasetVersion to point at the blob storage (in case the seed
  // initially wrote a local path, or to keep documentCount in sync).
  // manifestPath is stored relative to storagePrefix — same convention as
  // dataset.service.ts createVersion (defaults to "dataset-manifest.json").
  // The benchmark materializer downloads files relative to the full storage
  // prefix and joins materializedPath + manifestPath to find the manifest.
  await prisma.datasetVersion.update({
    where: { id: versionId },
    data: {
      storagePrefix: blobStoragePrefix,
      manifestPath: "dataset-manifest.json",
      documentCount: samples.length,
    },
  });

  return {
    folder: entry.folder,
    visibility: entry.visibility,
    uploaded,
    skipped,
  };
}
