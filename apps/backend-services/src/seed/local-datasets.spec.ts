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

describe("parseLocalDatasets flat-pair mode (no manifest.json)", () => {
  function writeFile(p: string, content = ""): void {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }

  it("auto-derives a manifest when only flat <name>.<image> + <name>.json pairs exist", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "samples-mix", "private");
      writeFile(path.join(folder, "Fake 1.jpg"), "fake-image-bytes");
      writeFile(
        path.join(folder, "Fake 1.json"),
        JSON.stringify({ name: "Pam Beesly", date: "1985-01-04" }),
      );
      writeFile(path.join(folder, "Fake 2.jpg"), "fake-image-bytes");
      writeFile(
        path.join(folder, "Fake 2.json"),
        JSON.stringify({ name: "Jim Halpert" }),
      );

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        folder: "samples-mix",
        visibility: "private",
        sampleCount: 2,
        autoGenerated: true,
      });

      const manifestPath = path.join(folder, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const written = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(written.metadata.autoGenerated).toBe(true);
      expect(written.samples).toHaveLength(2);
      expect(written.samples[0]).toMatchObject({
        id: "Fake 1",
        inputs: [{ path: "Fake 1.jpg", mimeType: "image/jpeg" }],
        groundTruth: [{ path: "Fake 1.json", format: "field-key-value-json" }],
      });
    } finally {
      cleanup();
    }
  });

  it("regenerates the manifest on re-run when metadata.autoGenerated is true", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "ds", "private");
      writeFile(path.join(folder, "a.jpg"), "");
      writeFile(path.join(folder, "a.json"), "{}");

      // First parse: auto-generates manifest with 1 sample.
      const first = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(first[0].sampleCount).toBe(1);

      // User adds another pair. Re-parse should pick it up.
      writeFile(path.join(folder, "b.jpg"), "");
      writeFile(path.join(folder, "b.json"), "{}");

      const second = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(second[0].sampleCount).toBe(2);
      expect(second[0].autoGenerated).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("treats user-curated manifest (no autoGenerated marker) as authoritative", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "ds", "private");
      // User manifest with single explicit sample
      writeFile(
        path.join(folder, "manifest.json"),
        JSON.stringify({
          datasetName: "User Curated",
          samples: [
            {
              id: "only-one",
              inputs: [{ path: "only-one.pdf", mimeType: "application/pdf" }],
              groundTruth: [
                { path: "only-one.json", format: "field-key-value-json" },
              ],
            },
          ],
        }),
      );
      // Drop a flat pair too — should be ignored because manifest is curated.
      writeFile(path.join(folder, "extra.jpg"), "");
      writeFile(path.join(folder, "extra.json"), "{}");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(1);
      expect(result[0].sampleCount).toBe(1);
      expect(result[0].datasetName).toBe("User Curated");
      expect(result[0].autoGenerated).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("warns about unpaired documents and unpaired ground-truth files", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "ds", "private");
      writeFile(path.join(folder, "lonely.jpg"), "");
      writeFile(path.join(folder, "orphan.json"), "{}");
      writeFile(path.join(folder, "good.png"), "");
      writeFile(path.join(folder, "good.json"), "{}");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(1);
      expect(result[0].sampleCount).toBe(1); // only "good"
      const messages = log.warnings.map((w) => w.message).join("\n");
      expect(messages).toMatch(/lonely\.jpg/);
      expect(messages).toMatch(/orphan\.json/);
    } finally {
      cleanup();
    }
  });

  it("returns nothing for a folder with neither manifest nor flat pairs", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "empty", "private");
      fs.mkdirSync(folder, { recursive: true });
      // Just a stray README
      writeFile(path.join(folder, "README.md"), "nothing here");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toEqual([]);
      expect(log.warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("matches multiple image extensions case-insensitively", () => {
    const { repoRoot, datasetsDir, cleanup } = makeRepoRoot();
    const log = makeLogger();
    try {
      const folder = path.join(datasetsDir, "ds", "private");
      writeFile(path.join(folder, "doc.PDF"), "");
      writeFile(path.join(folder, "doc.json"), "{}");
      writeFile(path.join(folder, "scan.TIFF"), "");
      writeFile(path.join(folder, "scan.json"), "{}");

      const result = parseLocalDatasets(datasetsDir, repoRoot, log);
      expect(result).toHaveLength(1);
      expect(result[0].sampleCount).toBe(2);
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
