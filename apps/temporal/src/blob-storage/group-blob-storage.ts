import {
  validateBlobFilePathInGroup,
  validateBlobPrefixPathInGroup,
} from "@ai-di/blob-storage-paths";
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
      return client.read(validateBlobFilePathInGroup(key, groupId));
    },
    async write(key, data) {
      return client.write(validateBlobFilePathInGroup(key, groupId), data);
    },
    async exists(key) {
      return client.exists(validateBlobFilePathInGroup(key, groupId));
    },
    async delete(key) {
      return client.delete(validateBlobFilePathInGroup(key, groupId));
    },
    async list(prefix) {
      return client.list(validateBlobPrefixPathInGroup(prefix, groupId));
    },
    async generateSasUrl(key, expiryMinutes) {
      return client.generateSasUrl(
        validateBlobFilePathInGroup(key, groupId),
        expiryMinutes,
      );
    },
  };
}
