import * as path from 'path';

const DEFAULT_BLOB_BASE_PATH = './data/blobs';
const TEMPORAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_SERVICES_ROOT = path.resolve(TEMPORAL_APP_ROOT, '../backend-services');

function resolveBlobBasePath(): string {
  const configuredBasePath = process.env.LOCAL_BLOB_STORAGE_PATH?.trim();
  if (configuredBasePath) {
    if (path.isAbsolute(configuredBasePath)) {
      return configuredBasePath;
    }
    return path.resolve(TEMPORAL_APP_ROOT, configuredBasePath);
  }

  return path.resolve(BACKEND_SERVICES_ROOT, DEFAULT_BLOB_BASE_PATH);
}

export function resolveBlobKeyToPath(blobKey: string): string {
  const normalized = path.normalize(blobKey);
  if (normalized.startsWith('..')) {
    throw new Error(`Invalid blob key: "${blobKey}"`);
  }

  // Absolute paths are used in benchmark mode where files are materialized on disk
  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.join(resolveBlobBasePath(), normalized);
}
