import { materializeDataset, loadDatasetManifest } from './benchmark-materialize';
import { getPrismaClient } from './database-client';
import * as fs from 'fs/promises';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock('child_process');

// Create mock execAsync that will be returned by promisify (using var for hoisting)
var mockExecAsyncImpl: jest.Mock;

jest.mock('util', () => {
  mockExecAsyncImpl = jest.fn();
  return {
    promisify: jest.fn(() => mockExecAsyncImpl),
  };
});

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  rm: jest.fn(),
  readFile: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const fsMock = {
  access: fs.access as jest.Mock,
  mkdir: fs.mkdir as jest.Mock,
  rm: fs.rm as jest.Mock,
  readFile: (fs as unknown as { readFile: jest.Mock }).readFile as jest.Mock,
};

/**
 * Helper to set up fs.access mock that:
 * - Handles cache check (first call with materializedPath)
 * - Handles DVC check (call with path ending in '.dvc')
 */
function setupAccessMock(opts: { cacheHit: boolean; hasDvc: boolean }) {
  fsMock.access.mockImplementation((filePath: string) => {
    if (filePath.endsWith('.dvc')) {
      return opts.hasDvc ? Promise.resolve(undefined) : Promise.reject(new Error('ENOENT'));
    }
    // Cache check
    return opts.cacheHit ? Promise.resolve(undefined) : Promise.reject(new Error('ENOENT'));
  });
}

// Helper to create mock execAsync function
const mockExecAsync = (
  commandMap: Record<string, { stdout?: string; stderr?: string; error?: Error }>
) => {
  mockExecAsyncImpl.mockImplementation((command: string, _options?: unknown) => {
    const result = Object.entries(commandMap).find(([pattern]) =>
      command.includes(pattern)
    );

    if (result) {
      const [, response] = result;
      if (response.error) {
        return Promise.reject(response.error);
      } else {
        return Promise.resolve({
          stdout: response.stdout || '',
          stderr: response.stderr || ''
        });
      }
    } else {
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    }
  });
};

describe('materializeDataset activity', () => {
  let prismaMock: {
    datasetVersion: {
      findUnique: jest.Mock;
    };
  };

  const mockDatasetVersion = {
    id: 'version-1',
    datasetId: 'dataset-1',
    gitRevision: 'abc123',
    dataset: {
      id: 'dataset-1',
      name: 'Test Dataset',
      repositoryUrl: 'https://github.com/test/dataset.git',
      dvcRemote: 'minio',
    },
  };

  beforeEach(() => {
    prismaMock = {
      datasetVersion: {
        findUnique: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);

    // Set default environment variables
    process.env.BENCHMARK_CACHE_DIR = '/tmp/test-cache';
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY = 'testkey';
    process.env.MINIO_SECRET_KEY = 'testsecret';
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.BENCHMARK_CACHE_DIR;
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
    delete process.env.DATASET_GIT_USERNAME;
    delete process.env.DATASET_GIT_PASSWORD;
  });

  describe('Scenario 1: Clone and checkout dataset repo at pinned revision', () => {
    it('clones repository and checks out specific revision', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: true });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: 'Cloning into' },
        'git checkout': { stdout: '', stderr: '' },
        'dvc remote list': { error: new Error('No remotes') },
        'dvc remote add': { stdout: '', stderr: '' },
        'dvc remote modify': { stdout: '', stderr: '' },
        'dvc pull': { stdout: '', stderr: '2 files downloaded' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result.materializedPath).toBe('/tmp/test-cache/dataset-1-abc123');
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        expect.stringContaining('git clone')
      );
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        'git checkout abc123',
        expect.objectContaining({ cwd: '/tmp/test-cache/dataset-1-abc123' })
      );
    });

    it('handles Git credentials when provided in environment', async () => {
      process.env.DATASET_GIT_USERNAME = 'testuser';
      process.env.DATASET_GIT_PASSWORD = 'testpass';

      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: 'Cloning into' },
        'git checkout': { stdout: '', stderr: '' },
      });

      await materializeDataset({ datasetVersionId: 'version-1' });

      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        expect.stringContaining('testuser:testpass')
      );
    });
  });

  describe('Scenario 2: Pull data files from MinIO via DVC', () => {
    it('configures DVC remote and runs dvc pull', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: true });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { stdout: '', stderr: '' },
        'dvc remote list': { error: new Error('No remotes') },
        'dvc remote add': { stdout: '', stderr: '' },
        'dvc remote modify': { stdout: '', stderr: '' },
        'dvc pull': { stdout: '', stderr: '5 files downloaded' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result.materializedPath).toBe('/tmp/test-cache/dataset-1-abc123');
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        'dvc remote add -d minio s3://datasets',
        expect.objectContaining({ cwd: '/tmp/test-cache/dataset-1-abc123' })
      );
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        'dvc remote modify minio endpointurl http://localhost:9000',
        expect.objectContaining({ cwd: '/tmp/test-cache/dataset-1-abc123' })
      );
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        'dvc pull',
        expect.objectContaining({ cwd: '/tmp/test-cache/dataset-1-abc123' })
      );
    });
  });

  describe('Scenario 3: Return path to materialized dataset', () => {
    it('returns absolute path to materialized dataset directory', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { stdout: '', stderr: '' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result).toEqual({
        materializedPath: '/tmp/test-cache/dataset-1-abc123',
      });
      expect(result.materializedPath).toMatch(/^\/tmp\/test-cache\//);
    });
  });

  describe('Scenario 4: Cache materialized datasets', () => {
    it('reuses cached dataset when gitRevision matches', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      fsMock.access.mockResolvedValue(undefined); // Cache exists

      mockExecAsync({
        'git rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result.materializedPath).toBe('/tmp/test-cache/dataset-1-abc123');
      expect(fsMock.access).toHaveBeenCalledWith('/tmp/test-cache/dataset-1-abc123');

      // Should not clone or pull
      expect(mockExecAsyncImpl).not.toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.anything(),
        expect.anything()
      );
      expect(mockExecAsyncImpl).not.toHaveBeenCalledWith(
        expect.stringContaining('dvc pull'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Scenario 5: Cache invalidation on revision mismatch', () => {
    it('invalidates cache and re-materializes when gitRevision differs', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      // Cache exists but then after re-clone, no DVC
      fsMock.access.mockImplementation((filePath: string) => {
        if (filePath.endsWith('.dvc')) return Promise.reject(new Error('ENOENT'));
        return Promise.resolve(undefined); // Cache exists
      });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git rev-parse HEAD': { stdout: 'old-revision\n', stderr: '' }, // Different revision
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { stdout: '', stderr: '' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result.materializedPath).toBe('/tmp/test-cache/dataset-1-abc123');
      expect(fsMock.rm).toHaveBeenCalledWith(
        '/tmp/test-cache/dataset-1-abc123',
        { recursive: true, force: true }
      );
      expect(mockExecAsyncImpl).toHaveBeenCalledWith(
        expect.stringContaining('git clone')
      );
    });
  });

  describe('Scenario 6: Handle materialization failure', () => {
    it('throws descriptive error when dataset version not found', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(null);

      await expect(
        materializeDataset({ datasetVersionId: 'non-existent' })
      ).rejects.toThrow('Dataset version not found: non-existent');
    });

    it('throws descriptive error and cleans up when git clone fails', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { error: new Error('Repository not found') },
      });

      await expect(
        materializeDataset({ datasetVersionId: 'version-1' })
      ).rejects.toThrow('Git clone failed: Repository not found');

      expect(fsMock.rm).toHaveBeenCalledWith(
        '/tmp/test-cache/dataset-1-abc123',
        { recursive: true, force: true }
      );
    });

    it('throws descriptive error and cleans up when git checkout fails', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { error: new Error('Revision not found') },
      });

      await expect(
        materializeDataset({ datasetVersionId: 'version-1' })
      ).rejects.toThrow('Git checkout failed: Revision not found');

      expect(fsMock.rm).toHaveBeenCalledWith(
        '/tmp/test-cache/dataset-1-abc123',
        { recursive: true, force: true }
      );
    });

    it('throws descriptive error and cleans up when dvc pull fails', async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: true });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { stdout: '', stderr: '' },
        'dvc remote list': { error: new Error('No remotes') },
        'dvc remote add': { stdout: '', stderr: '' },
        'dvc remote modify': { stdout: '', stderr: '' },
        'dvc pull': { error: new Error('Failed to download files from remote') },
      });

      await expect(
        materializeDataset({ datasetVersionId: 'version-1' })
      ).rejects.toThrow('DVC pull failed: Failed to download files from remote');

      expect(fsMock.rm).toHaveBeenCalledWith(
        '/tmp/test-cache/dataset-1-abc123',
        { recursive: true, force: true }
      );
    });
  });

  describe('Tilde expansion in repository URL', () => {
    it('resolves ~ to home directory in local repository paths', async () => {
      const tildeDatasetVersion = {
        ...mockDatasetVersion,
        dataset: {
          ...mockDatasetVersion.dataset,
          repositoryUrl: '~/datasets/my-test-dataset',
        },
      };

      prismaMock.datasetVersion.findUnique.mockResolvedValue(tildeDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: 'Cloning into' },
        'git checkout': { stdout: '', stderr: '' },
      });

      await materializeDataset({ datasetVersionId: 'version-1' });

      // The git clone command should contain the resolved home directory, not ~
      const cloneCall = mockExecAsyncImpl.mock.calls.find(
        (call: string[]) => call[0].includes('git clone')
      );
      expect(cloneCall).toBeDefined();
      expect(cloneCall[0]).not.toContain('~/');
      expect(cloneCall[0]).toContain('/datasets/my-test-dataset');
    });
  });

  describe('Cache directory configuration', () => {
    it('uses default cache directory when env var not set', async () => {
      delete process.env.BENCHMARK_CACHE_DIR;

      prismaMock.datasetVersion.findUnique.mockResolvedValue(mockDatasetVersion);
      setupAccessMock({ cacheHit: false, hasDvc: false });
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      mockExecAsync({
        'git clone': { stdout: '', stderr: '' },
        'git checkout': { stdout: '', stderr: '' },
      });

      const result = await materializeDataset({ datasetVersionId: 'version-1' });

      expect(result.materializedPath).toBe('/tmp/benchmark-cache/dataset-1-abc123');
      expect(fsMock.mkdir).toHaveBeenCalledWith('/tmp/benchmark-cache', { recursive: true });
    });
  });
});

describe('loadDatasetManifest activity', () => {
  let prismaMock: {
    datasetVersion: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      datasetVersion: {
        findUnique: jest.fn(),
      },
    };
    (getPrismaClient as jest.Mock).mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('reads manifest using manifestPath from database', async () => {
    const mockManifest = {
      schemaVersion: '1.0',
      samples: [
        {
          id: 'sample-1',
          inputs: [{ path: 'inputs/doc1.pdf', mimeType: 'application/pdf' }],
          groundTruth: [{ path: 'ground-truth/doc1.json', format: 'json' }],
          metadata: {},
        },
      ],
    };

    prismaMock.datasetVersion.findUnique.mockResolvedValue({
      manifestPath: 'dataset-manifest.json',
    });
    fsMock.readFile.mockResolvedValue(JSON.stringify(mockManifest));

    const result = await loadDatasetManifest({
      materializedPath: '/tmp/test-cache/dataset-1-abc123',
      datasetVersionId: 'version-1',
    });

    expect(prismaMock.datasetVersion.findUnique).toHaveBeenCalledWith({
      where: { id: 'version-1' },
      select: { manifestPath: true },
    });
    expect(fsMock.readFile).toHaveBeenCalledWith(
      '/tmp/test-cache/dataset-1-abc123/dataset-manifest.json',
      'utf-8'
    );
    expect(result.manifest).toEqual(mockManifest);
  });

  it('throws when dataset version not found', async () => {
    prismaMock.datasetVersion.findUnique.mockResolvedValue(null);

    await expect(
      loadDatasetManifest({
        materializedPath: '/tmp/test-cache/dataset-1-abc123',
        datasetVersionId: 'non-existent',
      })
    ).rejects.toThrow('Dataset version not found: non-existent');
  });

  it('throws when manifest file does not exist', async () => {
    prismaMock.datasetVersion.findUnique.mockResolvedValue({
      manifestPath: 'dataset-manifest.json',
    });
    fsMock.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    await expect(
      loadDatasetManifest({
        materializedPath: '/tmp/test-cache/dataset-1-abc123',
        datasetVersionId: 'version-1',
      })
    ).rejects.toThrow('Failed to load manifest');
  });
});
