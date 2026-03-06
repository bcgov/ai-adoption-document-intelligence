import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { benchmarkWritePrediction } from "./benchmark-write-prediction";

describe("benchmarkWritePrediction", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-write-pred-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes prediction data to a JSON file", async () => {
    const predictionData = {
      "Invoice Number": "INV-001",
      "Total Amount": "1500.00",
      Date: "2024-01-15",
    };

    const result = await benchmarkWritePrediction({
      predictionData,
      outputDir: path.join(tempDir, "outputs"),
      sampleId: "sample-001",
    });

    expect(result.predictionPath).toContain("sample-001-prediction.json");

    const written = JSON.parse(
      await fs.readFile(result.predictionPath, "utf-8"),
    );
    expect(written).toEqual(predictionData);
  });

  it("creates the output directory if it does not exist", async () => {
    const nested = path.join(tempDir, "a", "b", "c");

    const result = await benchmarkWritePrediction({
      predictionData: { field: "value" },
      outputDir: nested,
      sampleId: "deep-sample",
    });

    const stat = await fs.stat(result.predictionPath);
    expect(stat.isFile()).toBe(true);
  });

  it("writes empty object when no prediction data", async () => {
    const result = await benchmarkWritePrediction({
      predictionData: {},
      outputDir: tempDir,
      sampleId: "empty",
    });

    const written = JSON.parse(
      await fs.readFile(result.predictionPath, "utf-8"),
    );
    expect(written).toEqual({});
  });
});
