/**
 * Helpers for the local-folder dataset seed convention.
 *
 * Convention: `data/datasets/<name>/{public,private}/manifest.json` with
 * companion `documents/` and `ground-truth/` subfolders. See
 * `docs/superpowers/specs/2026-05-08-extraction-experiments-design.md`.
 *
 * The parser is a pure function so it can be unit-tested without a database
 * or filesystem mock. The seed in `seed.ts` calls it and persists the records.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type DatasetVisibility = "public" | "private";

export interface LocalDatasetSampleManifest {
  id: string;
  inputs?: Array<{ path: string; mimeType: string }>;
  groundTruth?: Array<{ path: string; format: string }>;
  metadata?: Record<string, unknown>;
}

export interface LocalDatasetManifest {
  datasetName?: string;
  templateModelKey?: string;
  samples?: LocalDatasetSampleManifest[];
}

export interface ParsedLocalDataset {
  /** Folder name under `data/datasets/`. */
  folder: string;
  /** Public or private subfolder. */
  visibility: DatasetVisibility;
  /** Display name from manifest.datasetName, falls back to folder. */
  datasetName: string;
  /** Optional `templateModelKey` from manifest. */
  templateModelKey: string | null;
  /** Number of samples in `manifest.samples`. */
  sampleCount: number;
  /** Repo-relative path to manifest.json. */
  manifestPath: string;
  /** Repo-relative path to the directory containing the manifest. */
  storagePrefix: string;
}

export interface ParseLocalDatasetsLogger {
  warn(message: string): void;
}

/**
 * Scan `<datasetsDir>` for `<name>/{public,private}/manifest.json` files and
 * return one parsed entry per valid manifest. Skips folders without
 * manifests, logs a warning for invalid JSON or missing `samples` array.
 *
 * `repoRoot` is used to make `manifestPath` and `storagePrefix` repo-relative
 * (the convention used by existing `DatasetVersion` rows).
 */
export function parseLocalDatasets(
  datasetsDir: string,
  repoRoot: string,
  log: ParseLocalDatasetsLogger,
): ParsedLocalDataset[] {
  if (!fs.existsSync(datasetsDir) || !fs.statSync(datasetsDir).isDirectory()) {
    return [];
  }

  const folders = fs
    .readdirSync(datasetsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const results: ParsedLocalDataset[] = [];
  for (const folder of folders) {
    for (const visibility of ["public", "private"] as const) {
      const folderPath = path.join(datasetsDir, folder, visibility);
      const manifestFile = path.join(folderPath, "manifest.json");
      if (!fs.existsSync(manifestFile)) {
        continue;
      }

      let manifest: LocalDatasetManifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
      } catch (err) {
        log.warn(
          `Skipping ${folder}/${visibility}: invalid manifest.json (${(err as Error).message})`,
        );
        continue;
      }

      if (!Array.isArray(manifest.samples)) {
        log.warn(
          `Skipping ${folder}/${visibility}: manifest.json is missing 'samples' array`,
        );
        continue;
      }

      results.push({
        folder,
        visibility,
        datasetName: manifest.datasetName ?? folder,
        templateModelKey: manifest.templateModelKey ?? null,
        sampleCount: manifest.samples.length,
        manifestPath: path.relative(repoRoot, manifestFile),
        storagePrefix: path.relative(repoRoot, folderPath),
      });
    }
  }

  return results;
}

/** Stable Dataset row id derived from folder + visibility. */
export function localDatasetId(
  folder: string,
  visibility: DatasetVisibility,
): string {
  return `seed-local-${folder}-${visibility}`;
}

/** Stable DatasetVersion row id. */
export function localDatasetVersionId(
  folder: string,
  visibility: DatasetVisibility,
): string {
  return `${localDatasetId(folder, visibility)}-v1`;
}
