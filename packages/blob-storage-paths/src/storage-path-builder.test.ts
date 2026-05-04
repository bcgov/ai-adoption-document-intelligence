import {
  OperationCategory,
  buildBlobFilePath,
  buildBlobPrefixPath,
  buildSharedBlobPrefixPath,
  validateBlobFilePath,
  validateBlobPrefixPath,
} from "./storage-path-builder";

const VALID_CUID = "clh7z2xk00000356u8e3h1234";

describe("buildSharedBlobPrefixPath", () => {
  it("builds a shared prefix starting with _shared", () => {
    const result = buildSharedBlobPrefixPath(OperationCategory.CLASSIFICATION, ["other"]);
    expect(result).toBe("_shared/classification/other");
  });

  it("builds a shared prefix with multiple components", () => {
    const result = buildSharedBlobPrefixPath(OperationCategory.OCR, ["models", "v2"]);
    expect(result).toBe("_shared/ocr/models/v2");
  });

  it("throws on illegal characters", () => {
    expect(() =>
      buildSharedBlobPrefixPath(OperationCategory.CLASSIFICATION, ["bad:path"])
    ).toThrow("Blob storage path includes illegal characters.");
  });
});

describe("buildBlobPrefixPath", () => {
  it("builds a prefix path with prefix components", () => {
    const result = buildBlobPrefixPath(VALID_CUID, OperationCategory.OCR, ["doc1", "pages"]);
    expect(result).toBe(`${VALID_CUID}/ocr/doc1/pages`);
  });

  it("builds a prefix path with a single prefix component", () => {
    const result = buildBlobPrefixPath(VALID_CUID, OperationCategory.TRAINING, ["run1"]);
    expect(result).toBe(`${VALID_CUID}/training/run1`);
  });

  it("builds a prefix path with empty prefix components", () => {
    const result = buildBlobPrefixPath(VALID_CUID, OperationCategory.CLASSIFICATION, [""]);
    expect(result).toBe(`${VALID_CUID}/classification`);
  });

  it("throws when a prefix component contains a backslash", () => {
    expect(() => buildBlobPrefixPath(VALID_CUID, OperationCategory.OCR, ["bad\\path"])).toThrow(
      "Blob storage path includes illegal characters. No : or \\ permitted."
    );
  });

  it("throws when a prefix component contains a colon", () => {
    expect(() => buildBlobPrefixPath(VALID_CUID, OperationCategory.OCR, ["bad:path"])).toThrow(
      "Blob storage path includes illegal characters. No : or \\ permitted."
    );
  });

  it("collapses double slashes from prefix components", () => {
    // path.posix.join normalises these, but guard the behaviour
    const result = buildBlobPrefixPath(VALID_CUID, OperationCategory.BENCHMARK, ["a//b"]);
    expect(result).not.toContain("//");
  });
});

describe("buildBlobFilePath", () => {
  it("builds a fully-qualified file path", () => {
    const result = buildBlobFilePath(VALID_CUID, OperationCategory.OCR, ["doc1"], "output.json");
    expect(result).toBe(`${VALID_CUID}/ocr/doc1/output.json`);
  });

  it("builds a file path with multiple prefix components", () => {
    const result = buildBlobFilePath(VALID_CUID, OperationCategory.TRAINING, ["run1", "epoch2"], "weights.bin");
    expect(result).toBe(`${VALID_CUID}/training/run1/epoch2/weights.bin`);
  });

  it("builds a file path with no intermediate prefix components", () => {
    const result = buildBlobFilePath(VALID_CUID, OperationCategory.CLASSIFICATION, [""], "result.txt");
    expect(result).toBe(`${VALID_CUID}/classification/result.txt`);
  });

  it("inherits the illegal-character restriction from buildBlobPrefixPath", () => {
    expect(() =>
      buildBlobFilePath(VALID_CUID, OperationCategory.OCR, ["bad:component"], "file.txt")
    ).toThrow("Blob storage path includes illegal characters.");
  });
});

describe("validateBlobPrefixPath", () => {
  it("returns the path unchanged for a valid path", () => {
    const validPath = `${VALID_CUID}/ocr/doc1/pages`;
    expect(validateBlobPrefixPath(validPath)).toBe(validPath);
  });

  it("accepts all known OperationCategory values", () => {
    for (const category of Object.values(OperationCategory)) {
      const validPath = `${VALID_CUID}/${category}/some/prefix`;
      expect(() => validateBlobPrefixPath(validPath)).not.toThrow();
    }
  });

  it("throws when the group ID is not a valid CUID (starts with uppercase)", () => {
    expect(() => validateBlobPrefixPath("INVALID/ocr/doc1")).toThrow(
      /Group ID INVALID in blob file path not a valid cuid/
    );
  });

  it("throws when the group ID is too short", () => {
    expect(() => validateBlobPrefixPath("a/ocr/doc1")).toThrow(
      /not a valid cuid/
    );
  });

  it("throws when the group ID contains illegal CUID characters", () => {
    expect(() => validateBlobPrefixPath("ab-cd-ef/ocr/doc1")).toThrow(
      /not a valid cuid/
    );
  });

  it("throws when the category is not a known OperationCategory", () => {
    expect(() => validateBlobPrefixPath(`${VALID_CUID}/unknown/doc1`)).toThrow(
      /Category unknown in blob file path not a valid category/
    );
  });

  it("throws when the category is missing", () => {
    expect(() => validateBlobPrefixPath(`${VALID_CUID}`)).toThrow(
      /not a valid category/
    );
  });
});

describe("validateBlobFilePath", () => {
  it("returns the path unchanged for a valid file path", () => {
    const validPath = `${VALID_CUID}/ocr/doc1/output.json`;
    expect(validateBlobFilePath(validPath)).toBe(validPath);
  });

  it("throws when the group ID is invalid", () => {
    expect(() => validateBlobFilePath("BAD_GROUP/ocr/file.json")).toThrow(
      /not a valid cuid/
    );
  });

  it("throws when the category is invalid", () => {
    expect(() => validateBlobFilePath(`${VALID_CUID}/badcat/file.json`)).toThrow(
      /not a valid category/
    );
  });
});
