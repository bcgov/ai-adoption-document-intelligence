import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePathInGroup } from "@ai-di/blob-storage-paths";
import { getGroupBlobStorage } from "./group-blob-storage";

/**
 * Directory where benchmark runs materialise one group's dataset files on the
 * worker: `{BENCHMARK_CACHE_DIR}/{groupId}`.
 */
export function getGroupBenchmarkCacheDir(groupId: string): string {
  const cacheBaseDir =
    process.env.BENCHMARK_CACHE_DIR || "/tmp/benchmark-cache";
  return path.join(cacheBaseDir, groupId);
}

/**
 * Reads document bytes for a workflow running in `groupId`.
 *
 * A blob key must belong to the group. An absolute path is a dataset file a
 * benchmark run materialised, and is read from the worker filesystem only when
 * it lies inside the group's benchmark cache directory.
 */
export async function readGroupBlob(
  key: string,
  groupId: string | null | undefined,
): Promise<Buffer> {
  if (!groupId) {
    throw new Error(`groupId is required to read "${key}"`);
  }

  if (path.isAbsolute(key)) {
    const groupCacheDir = path.resolve(getGroupBenchmarkCacheDir(groupId));
    const resolved = path.resolve(key);
    if (!resolved.startsWith(groupCacheDir + path.sep)) {
      throw new Error(
        `Local file is outside the group's benchmark cache: "${key}"`,
      );
    }
    try {
      return await fs.promises.readFile(resolved);
    } catch (_error) {
      throw new Error(`File not found on disk: "${key}"`);
    }
  }

  const blobPath = validateBlobFilePathInGroup(key, groupId);
  try {
    return await getGroupBlobStorage(groupId).read(blobPath);
  } catch (error) {
    throw new Error(`Blob not found: "${key}" — ${error}`);
  }
}
