import * as fs from "fs/promises";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import {
  loadDatasetManifest,
  materializeDataset,
} from "./benchmark-materialize";
import { getPrismaClient } from "./database-client";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: jest.fn(),
}));

jest.mock("fs/promises", () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  rm: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;
const getBlobStorageClientMock = getBlobStorageClient as jest.Mock;

const fsMock = {
  access: fs.access as jest.Mock,
  mkdir: fs.mkdir as jest.Mock,
  rm: fs.rm as jest.Mock,
  readFile: (fs as unknown as { readFile: jest.Mock }).readFile as jest.Mock,
  writeFile: (fs as unknown as { writeFile: jest.Mock }).writeFile as jest.Mock,
};

describe("materializeDataset activity", () => {
  let prismaMock: {
    datasetVersion: {
      findUnique: jest.Mock;
    };
  };

  let blobStorageMock: {
    list: jest.Mock;
    read: jest.Mock;
  };

  const mockDatasetVersion = {
    id: "version-1",
    datasetId: "dataset-1",
    storagePrefix: "atestgroup/benchmark/version1",
    dataset: {
      id: "dataset-1",
      name: "Test Dataset",
      storagePath: "atestgroup/benchmark",
    },
  };

  beforeEach(() => {
    prismaMock = {
      datasetVersion: {
        findUnique: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);

    blobStorageMock = {
      list: jest.fn(),
      read: jest.fn(),
    };
    getBlobStorageClientMock.mockReturnValue(blobStorageMock);

    process.env.BENCHMARK_CACHE_DIR = "/tmp/test-cache";
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.BENCHMARK_CACHE_DIR;
  });

  describe("Scenario 1: Download dataset files from object storage", () => {
    it("downloads files from blob storage to local cache", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(
        mockDatasetVersion,
      );
      fsMock.access.mockRejectedValue(new Error("ENOENT")); // Cache miss
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);

      blobStorageMock.list.mockResolvedValue([
        "atestgroup/benchmark/version1/dataset-manifest.json",
        "atestgroup/benchmark/version1/inputs/doc1.pdf",
        "atestgroup/benchmark/version1/ground-truth/doc1.json",
      ]);
      blobStorageMock.read.mockResolvedValue(Buffer.from("file-content"));

      const result = await materializeDataset({
        datasetVersionId: "version-1",
      });

      expect(result.materializedPath).toBe(
        "/tmp/test-cache/dataset-1-version-1",
      );
      expect(blobStorageMock.list).toHaveBeenCalledWith(
        "atestgroup/benchmark/version1",
      );
      expect(blobStorageMock.read).toHaveBeenCalledTimes(3);
      expect(fsMock.writeFile).toHaveBeenCalledTimes(3);
    });
  });

  describe("Scenario 2: Return path to materialized dataset", () => {
    it("returns absolute path to materialized dataset directory", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(
        mockDatasetVersion,
      );
      fsMock.access.mockRejectedValue(new Error("ENOENT"));
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);

      blobStorageMock.list.mockResolvedValue([]);

      const result = await materializeDataset({
        datasetVersionId: "version-1",
      });

      expect(result).toEqual({
        materializedPath: "/tmp/test-cache/dataset-1-version-1",
      });
      expect(result.materializedPath).toMatch(/^\/tmp\/test-cache\//);
    });
  });

  describe("Scenario 3: Cache materialized datasets", () => {
    it("reuses cached dataset when manifest exists", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(
        mockDatasetVersion,
      );
      fsMock.access.mockResolvedValue(undefined); // Cache exists (manifest found)

      const result = await materializeDataset({
        datasetVersionId: "version-1",
      });

      expect(result.materializedPath).toBe(
        "/tmp/test-cache/dataset-1-version-1",
      );
      expect(fsMock.access).toHaveBeenCalledWith(
        "/tmp/test-cache/dataset-1-version-1/dataset-manifest.json",
      );

      // Should not download
      expect(blobStorageMock.list).not.toHaveBeenCalled();
      expect(blobStorageMock.read).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 4: Handle materialization failure", () => {
    it("throws descriptive error when dataset version not found", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(null);

      await expect(
        materializeDataset({ datasetVersionId: "non-existent" }),
      ).rejects.toThrow("Dataset version not found: non-existent");
    });

    it("throws error when storage prefix is missing", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue({
        ...mockDatasetVersion,
        storagePrefix: null,
      });

      await expect(
        materializeDataset({ datasetVersionId: "version-1" }),
      ).rejects.toThrow("has no storage prefix");
    });

    it("throws descriptive error and cleans up when blob download fails", async () => {
      prismaMock.datasetVersion.findUnique.mockResolvedValue(
        mockDatasetVersion,
      );
      fsMock.access.mockRejectedValue(new Error("ENOENT"));
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      blobStorageMock.list.mockRejectedValue(
        new Error("Storage connection failed"),
      );

      await expect(
        materializeDataset({ datasetVersionId: "version-1" }),
      ).rejects.toThrow(
        "Dataset download from object storage failed: Storage connection failed",
      );

      expect(fsMock.rm).toHaveBeenCalledWith(
        "/tmp/test-cache/dataset-1-version-1",
        { recursive: true, force: true },
      );
    });
  });

  describe("Cache directory configuration", () => {
    it("uses default cache directory when env var not set", async () => {
      delete process.env.BENCHMARK_CACHE_DIR;

      prismaMock.datasetVersion.findUnique.mockResolvedValue(
        mockDatasetVersion,
      );
      fsMock.access.mockRejectedValue(new Error("ENOENT"));
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);
      blobStorageMock.list.mockResolvedValue([]);

      const result = await materializeDataset({
        datasetVersionId: "version-1",
      });

      expect(result.materializedPath).toBe(
        "/tmp/benchmark-cache/dataset-1-version-1",
      );
      expect(fsMock.mkdir).toHaveBeenCalledWith("/tmp/benchmark-cache", {
        recursive: true,
      });
    });
  });
});

describe("loadDatasetManifest activity", () => {
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

  it("reads manifest using manifestPath from database", async () => {
    const mockManifest = {
      schemaVersion: "1.0",
      samples: [
        {
          id: "sample-1",
          inputs: [{ path: "inputs/doc1.pdf", mimeType: "application/pdf" }],
          groundTruth: [{ path: "ground-truth/doc1.json", format: "json" }],
          metadata: {},
        },
      ],
    };

    prismaMock.datasetVersion.findUnique.mockResolvedValue({
      manifestPath: "dataset-manifest.json",
    });
    fsMock.readFile.mockResolvedValue(JSON.stringify(mockManifest));

    const result = await loadDatasetManifest({
      materializedPath: "/tmp/test-cache/dataset-1-version-1",
      datasetVersionId: "version-1",
    });

    expect(prismaMock.datasetVersion.findUnique).toHaveBeenCalledWith({
      where: { id: "version-1" },
      select: { manifestPath: true },
    });
    expect(fsMock.readFile).toHaveBeenCalledWith(
      "/tmp/test-cache/dataset-1-version-1/dataset-manifest.json",
      "utf-8",
    );
    expect(result.manifest).toEqual(mockManifest);
  });

  it("throws when dataset version not found", async () => {
    prismaMock.datasetVersion.findUnique.mockResolvedValue(null);

    await expect(
      loadDatasetManifest({
        materializedPath: "/tmp/test-cache/dataset-1-version-1",
        datasetVersionId: "non-existent",
      }),
    ).rejects.toThrow("Dataset version not found: non-existent");
  });

  it("throws when manifest file does not exist", async () => {
    prismaMock.datasetVersion.findUnique.mockResolvedValue({
      manifestPath: "dataset-manifest.json",
    });
    fsMock.readFile.mockRejectedValue(
      new Error("ENOENT: no such file or directory"),
    );

    await expect(
      loadDatasetManifest({
        materializedPath: "/tmp/test-cache/dataset-1-version-1",
        datasetVersionId: "version-1",
      }),
    ).rejects.toThrow("Failed to load manifest");
  });
});
