import {
  type BlobFilePath,
  type BlobPrefixPath,
  validateBlobFilePathInGroup,
  validateBlobPrefixPathInGroup,
} from "@ai-di/blob-storage-paths";
import { groupScopeViolation } from "../group-scope-violation";
import { getBlobStorageClient } from "./blob-storage-client";

/**
 * Blob storage bound to one group. Every key and prefix is validated and must
 * belong to the group before the storage client is called.
 *
 * Worker code reaches blob storage only through this (or `readGroupBlob`);
 * a lint rule keeps `getBlobStorageClient` inside `src/blob-storage`.
 */
export interface GroupBlobStorage {
  readonly groupId: string;
  read(key: string): Promise<Buffer>;
  write(key: string, data: Buffer): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  generateSasUrl(key: string, expiryMinutes: number): Promise<string>;
}

function refusal(error: unknown): Error {
  return groupScopeViolation(
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Validates a blob key and confirms it belongs to `groupId`. A refused key
 * throws a failure Temporal does not retry.
 */
export function validateGroupBlobKey(
  key: string,
  groupId: string,
): BlobFilePath {
  try {
    return validateBlobFilePathInGroup(key, groupId);
  } catch (error) {
    throw refusal(error);
  }
}

function validateGroupBlobPrefix(
  prefix: string,
  groupId: string,
): BlobPrefixPath {
  try {
    return validateBlobPrefixPathInGroup(prefix, groupId);
  } catch (error) {
    throw refusal(error);
  }
}

export function getGroupBlobStorage(
  groupId: string | null | undefined,
): GroupBlobStorage {
  if (!groupId) {
    throw new Error("groupId is required to access blob storage");
  }
  const client = getBlobStorageClient();
  return {
    groupId,
    async read(key) {
      return client.read(validateGroupBlobKey(key, groupId));
    },
    async write(key, data) {
      return client.write(validateGroupBlobKey(key, groupId), data);
    },
    async exists(key) {
      return client.exists(validateGroupBlobKey(key, groupId));
    },
    async delete(key) {
      return client.delete(validateGroupBlobKey(key, groupId));
    },
    async list(prefix) {
      return client.list(validateGroupBlobPrefix(prefix, groupId));
    },
    async generateSasUrl(key, expiryMinutes) {
      return client.generateSasUrl(
        validateGroupBlobKey(key, groupId),
        expiryMinutes,
      );
    },
  };
}
