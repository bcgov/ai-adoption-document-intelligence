import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { benchmarkWritePrediction } from "./benchmark-write-prediction";

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("benchmarkWritePrediction", () => {
  const ORIGINAL_CACHE_DIR = process.env.BENCHMARK_CACHE_DIR;
  let cacheDir: string;
  let outputsDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-write-pred-"));
    process.env.BENCHMARK_CACHE_DIR = cacheDir;
    outputsDir = path.join(
      cacheDir,
      GROUP,
      "dataset-1-version-1",
      ".benchmark-outputs",
    );
  });

  afterEach(async () => {
    if (ORIGINAL_CACHE_DIR === undefined) {
      delete process.env.BENCHMARK_CACHE_DIR;
    } else {
      process.env.BENCHMARK_CACHE_DIR = ORIGINAL_CACHE_DIR;
    }
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it("writes prediction data to a JSON file", async () => {
    const predictionData = {
      "Invoice Number": "INV-001",
      "Total Amount": "1500.00",
      Date: "2024-01-15",
    };

    const result = await benchmarkWritePrediction({
      predictionData,
      outputDir: path.join(outputsDir, "sample-001"),
      sampleId: "sample-001",
      groupId: GROUP,
    });

    expect(result.predictionPath).toBe(
      path.join(outputsDir, "sample-001", "sample-001-prediction.json"),
    );

    const written = JSON.parse(
      await fs.readFile(result.predictionPath, "utf-8"),
    );
    expect(written).toEqual(predictionData);
  });

  it("creates the output directory if it does not exist", async () => {
    const nested = path.join(outputsDir, "a", "b", "c");

    const result = await benchmarkWritePrediction({
      predictionData: { field: "value" },
      outputDir: nested,
      sampleId: "deep-sample",
      groupId: GROUP,
    });

    const stat = await fs.stat(result.predictionPath);
    expect(stat.isFile()).toBe(true);
  });

  it("writes empty object when no prediction data", async () => {
    const result = await benchmarkWritePrediction({
      predictionData: {},
      outputDir: path.join(outputsDir, "empty"),
      sampleId: "empty",
      groupId: GROUP,
    });

    const written = JSON.parse(
      await fs.readFile(result.predictionPath, "utf-8"),
    );
    expect(written).toEqual({});
  });

  it("refuses an output folder in another group's cache and writes nothing", async () => {
    const otherGroupDir = path.join(
      cacheDir,
      OTHER_GROUP,
      "dataset-2-version-1",
      ".benchmark-outputs",
      "s1",
    );

    await expect(
      benchmarkWritePrediction({
        predictionData: { field: "value" },
        outputDir: otherGroupDir,
        sampleId: "s1",
        groupId: GROUP,
      }),
    ).rejects.toThrow(/outside the group's benchmark cache/);
    await expect(fs.access(otherGroupDir)).rejects.toThrow();
  });

  it("refuses a sample id that climbs out of the output folder", async () => {
    await expect(
      benchmarkWritePrediction({
        predictionData: { field: "value" },
        outputDir: path.join(outputsDir, "s1"),
        sampleId: `../../../../${OTHER_GROUP}/escape`,
        groupId: GROUP,
      }),
    ).rejects.toThrow(/outside the group's benchmark cache/);
    await expect(
      fs.access(path.join(cacheDir, OTHER_GROUP, "escape-prediction.json")),
    ).rejects.toThrow();
  });

  it("refuses to write without a groupId", async () => {
    await expect(
      benchmarkWritePrediction({
        predictionData: {},
        outputDir: path.join(outputsDir, "s1"),
        sampleId: "s1",
        groupId: undefined,
      }),
    ).rejects.toThrow(/groupId is required/);
  });
});
