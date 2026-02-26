import * as path from 'path';
import { resolveBlobKeyToPath } from './blob-path-resolver';

describe('resolveBlobKeyToPath', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LOCAL_BLOB_STORAGE_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses backend-services blob path by default', () => {
    const resolved = resolveBlobKeyToPath('documents/doc-1/original.pdf');

    expect(resolved).toContain(
      path.join('apps', 'backend-services', 'data', 'blobs'),
    );
    expect(resolved).toContain(
      path.join('documents', 'doc-1', 'original.pdf'),
    );
  });

  it('resolves relative LOCAL_BLOB_STORAGE_PATH from temporal app root', () => {
    process.env.LOCAL_BLOB_STORAGE_PATH = './data/blobs';

    const resolved = resolveBlobKeyToPath('documents/doc-1/original.pdf');

    expect(resolved).toContain(path.join('apps', 'temporal', 'data', 'blobs'));
    expect(resolved).toContain(
      path.join('documents', 'doc-1', 'original.pdf'),
    );
  });

  it('uses absolute LOCAL_BLOB_STORAGE_PATH as-is', () => {
    process.env.LOCAL_BLOB_STORAGE_PATH = '/tmp/blobs';

    const resolved = resolveBlobKeyToPath('documents/doc-1/original.pdf');

    expect(resolved).toBe(path.join('/tmp/blobs', 'documents/doc-1/original.pdf'));
  });

  it('passes through absolute blob keys for benchmark mode', () => {
    const absolutePath = '/tmp/benchmark-cache/dataset-1/inputs/doc.pdf';
    const resolved = resolveBlobKeyToPath(absolutePath);
    expect(resolved).toBe(absolutePath);
  });

  it('rejects path traversal blob keys', () => {
    expect(() => resolveBlobKeyToPath('../../../etc/passwd')).toThrow(
      'Invalid blob key: "../../../etc/passwd"',
    );
  });
});
