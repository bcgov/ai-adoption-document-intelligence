// Re-exported from the shared @ai-di/blob-storage-paths package.
// All path building and validation logic lives there so it can be used
// by both backend-services and the temporal worker without duplication.

export type { BlobFilePath, BlobPrefixPath } from "@ai-di/blob-storage-paths";
export {
  buildBlobFilePath,
  buildBlobPrefixPath,
  buildSharedBlobPrefixPath,
  OperationCategory,
  validateBlobFilePath,
  validateBlobPrefixPath,
} from "@ai-di/blob-storage-paths";
