import { getGroupBenchmarkCacheDir, readGroupBlob } from "./read-group-blob";

const mockRead = jest.fn();
jest.mock("./blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockRead,
  }),
}));

jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

import * as fs from "node:fs";

const readFileMock = fs.promises.readFile as jest.Mock;

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

function restoreCacheDir(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.BENCHMARK_CACHE_DIR;
  } else {
    process.env.BENCHMARK_CACHE_DIR = value;
  }
}

describe("readGroupBlob", () => {
  const ORIGINAL_CACHE_DIR = process.env.BENCHMARK_CACHE_DIR;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BENCHMARK_CACHE_DIR = "/tmp/benchmark-cache";
  });

  afterAll(() => {
    restoreCacheDir(ORIGINAL_CACHE_DIR);
  });

  it("reads a blob key that belongs to the group", async () => {
    mockRead.mockResolvedValueOnce(Buffer.from("%PDF"));

    const data = await readGroupBlob(
      `${GROUP}/ocr/doc-1/normalized.pdf`,
      GROUP,
    );

    expect(data.toString()).toBe("%PDF");
    expect(mockRead).toHaveBeenCalledWith(`${GROUP}/ocr/doc-1/normalized.pdf`);
  });

  it("refuses a blob key that belongs to another group", async () => {
    await expect(
      readGroupBlob(`${OTHER_GROUP}/ocr/doc-1/normalized.pdf`, GROUP),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("refuses a blob key with a dot segment", async () => {
    await expect(
      readGroupBlob(
        `${GROUP}/ocr/../../${OTHER_GROUP}/ocr/doc-1/normalized.pdf`,
        GROUP,
      ),
    ).rejects.toThrow(/dot segment/);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("refuses to read without a groupId", async () => {
    await expect(
      readGroupBlob(`${GROUP}/ocr/doc-1/normalized.pdf`, undefined),
    ).rejects.toThrow(/groupId is required/);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("reads a local file inside the group's benchmark cache", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("%PDF"));
    const localPath = `/tmp/benchmark-cache/${GROUP}/ds-1-v-1/inputs/a.pdf`;

    const data = await readGroupBlob(localPath, GROUP);

    expect(data.toString()).toBe("%PDF");
    expect(readFileMock).toHaveBeenCalledWith(localPath);
  });

  it.each([
    `/tmp/benchmark-cache/${OTHER_GROUP}/ds-1-v-1/inputs/a.pdf`,
    `/tmp/benchmark-cache/${GROUP}/../${OTHER_GROUP}/ds-1-v-1/inputs/a.pdf`,
    "/tmp/benchmark-cache/ds-1-v-1/inputs/a.pdf",
    "/var/data/a.pdf",
  ])("refuses a local file outside the group's benchmark cache: %s", async (localPath) => {
    await expect(readGroupBlob(localPath, GROUP)).rejects.toThrow(
      /outside the group's benchmark cache/,
    );
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("reports a missing local file", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    const localPath = `/tmp/benchmark-cache/${GROUP}/ds-1-v-1/inputs/missing.pdf`;

    await expect(readGroupBlob(localPath, GROUP)).rejects.toThrow(
      `File not found on disk: "${localPath}"`,
    );
  });
});

describe("getGroupBenchmarkCacheDir", () => {
  const ORIGINAL_CACHE_DIR = process.env.BENCHMARK_CACHE_DIR;

  afterEach(() => {
    restoreCacheDir(ORIGINAL_CACHE_DIR);
  });

  it("nests the group under BENCHMARK_CACHE_DIR", () => {
    process.env.BENCHMARK_CACHE_DIR = "/data/cache";
    expect(getGroupBenchmarkCacheDir(GROUP)).toBe(`/data/cache/${GROUP}`);
  });

  it("defaults to /tmp/benchmark-cache", () => {
    delete process.env.BENCHMARK_CACHE_DIR;
    expect(getGroupBenchmarkCacheDir(GROUP)).toBe(
      `/tmp/benchmark-cache/${GROUP}`,
    );
  });
});
