import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  localDatasetId,
  localDatasetVersionId,
  parseLocalDatasets,
} from "./local-datasets";

interface CapturedWarning {
  message: string;
}

function makeLogger() {
  const warnings: CapturedWarning[] = [];
  return {
    warn(message: string) {
      warnings.push({ message });
    },
    warnings,
  };
}

function makeRepoRoot(): {
  repoRoot: string;
  datasetsDir: string;
  cleanup: () => void;
} {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "local-datasets-test-"),
  );
  const datasetsDir = path.join(repoRoot, "data", "datasets");
  fs.mkdirSync(datasetsDir, { recursive: true });
  return {
    repoRoot,
    datasetsDir,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  };
}

function writeManifest(
  datasetsDir: string,
  folder: string,
  visibility: "public" | "private",
  body: unknown,
): void {
  const dir = path.join(datasetsDir, folder, visibility);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(body, null, 2),
  );
}

describe("parseLocalDatasets", () => {
  it("returns empty when datasetsDir does not exist", () => {
    const { repoRoot, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const result = parseLocalDatasets(
        path.join(repoRoot, "nonexistent"),
        repoRoot,
        log,
      );
      expect(result).toEqual([]);
      expect(log.warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("returns empty when datasetsDir is empty", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toEqual([]);
      expect(log.warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("parses a public-only dataset", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      writeManifest(datasetsDir, "handwritten-forms-2026", "public", {
        datasetName: "Handwritten Forms 2026",
        templateModelKey: "sdpr-monthly-report",
        samples: [
          { id: "form-001", inputs: [], groundTruth: [] },
          { id: "form-002", inputs: [], groundTruth: [] },
        ],
      });

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        folder: "handwritten-forms-2026",
        visibility: "public",
        datasetName: "Handwritten Forms 2026",
        templateModelKey: "sdpr-monthly-report",
        sampleCount: 2,
      });
      expect(result[0].manifestPath).toMatch(
        /data\/datasets\/handwritten-forms-2026\/public\/manifest\.json$/,
      );
      expect(result[0].storagePrefix).toMatch(
        /data\/datasets\/handwritten-forms-2026\/public$/,
      );
    } finally {
      cleanup();
    }
  });

  it("parses both public and private when both exist", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      writeManifest(datasetsDir, "ds-A", "public", { samples: [{ id: "s1" }] });
      writeManifest(datasetsDir, "ds-A", "private", {
        samples: [{ id: "s2" }, { id: "s3" }],
      });

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(2);
      const byVis = Object.fromEntries(result.map((r) => [r.visibility, r]));
      expect(byVis.public.sampleCount).toBe(1);
      expect(byVis.private.sampleCount).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("falls back to folder name when datasetName is missing in manifest", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      writeManifest(datasetsDir, "anonymous-set", "public", { samples: [] });

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result[0].datasetName).toBe("anonymous-set");
    } finally {
      cleanup();
    }
  });

  it("warns and skips when manifest.json is invalid JSON", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const dir = path.join(datasetsDir, "broken", "public");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "manifest.json"), "{not valid json");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toEqual([]);
      expect(log.warnings).toHaveLength(1);
      expect(log.warnings[0].message).toMatch(/invalid manifest\.json/);
    } finally {
      cleanup();
    }
  });

  it("warns and skips when 'samples' is missing or not an array", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      writeManifest(datasetsDir, "no-samples", "public", { datasetName: "x" });
      writeManifest(datasetsDir, "wrong-type", "public", {
        samples: "not an array",
      });

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toEqual([]);
      expect(log.warnings).toHaveLength(2);
      expect(log.warnings.every((w) => w.message.includes("samples"))).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it("ignores folders without any manifest under public/ or private/", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "no-manifest");
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, "README.md"), "no manifest here");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toEqual([]);
      expect(log.warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe("local dataset id helpers", () => {
  it("derives stable Dataset row IDs", () => {
    expect(localDatasetId("handwritten-forms-2026", "public")).toBe(
      "seed-local-handwritten-forms-2026-public",
    );
    expect(localDatasetId("handwritten-forms-2026", "private")).toBe(
      "seed-local-handwritten-forms-2026-private",
    );
  });

  it("derives stable DatasetVersion row IDs", () => {
    expect(localDatasetVersionId("ds", "public")).toBe(
      "seed-local-ds-public-v1",
    );
  });
});
