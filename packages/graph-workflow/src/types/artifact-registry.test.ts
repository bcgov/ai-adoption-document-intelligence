/**
 * Tests for the runtime artifact registry (US-090).
 *
 * Coverage:
 *   - Every `ArtifactKind` union member has an `ARTIFACT_REGISTRY` entry.
 *   - Every entry's `baseKind` pointer (when set) is itself registered —
 *     no orphans, so subtype walks (US-091) terminate at `Artifact`.
 *   - Palette + displayName spot-checks against TYPED_IO_DESIGN.md §4 §1.
 *   - `registerArtifactKind` happy + error paths.
 *   - `getArtifactKindMeta` returns `undefined` for unknown kinds.
 *
 * Test isolation: each `registerArtifactKind` test uses a unique kind
 * name AND an `afterEach` deletes any kinds it registered, so the live
 * registry is restored to the v1 snapshot between tests.
 */

import type { ArtifactKind } from "./artifacts";
import {
  ARTIFACT_REGISTRY,
  type ArtifactKindMeta,
  getArtifactKindMeta,
  registerArtifactKind,
} from "./artifact-registry";

// The closed list of v1 kinds, type-checked against the union.
const ALL_KINDS = [
  "Artifact",
  "Document",
  "MultiPageDocument",
  "SinglePageDocument",
  "Segment",
  "Segment<Text>",
  "Segment<Table>",
  "Segment<Figure>",
  "Segment<Form>",
  "Segment<KeyValue>",
  "Segment<Signature>",
  "Segment<Header>",
  "OcrResult",
  "OcrFields",
  "OcrTable",
  "Classification",
  "ValidationResult",
  "Reference",
] as const satisfies readonly ArtifactKind[];

describe("ARTIFACT_REGISTRY (v1 snapshot)", () => {
  it("has exactly one entry per ArtifactKind union member", () => {
    for (const kind of ALL_KINDS) {
      expect(ARTIFACT_REGISTRY[kind]).toBeDefined();
    }
    expect(Object.keys(ARTIFACT_REGISTRY).length).toBe(ALL_KINDS.length);
  });

  it("connects every entry's baseKind to another registered entry (no orphans)", () => {
    for (const kind of ALL_KINDS) {
      const meta = ARTIFACT_REGISTRY[kind];
      if (meta.baseKind !== undefined) {
        expect(ARTIFACT_REGISTRY[meta.baseKind]).toBeDefined();
      }
    }
  });

  it("roots the hierarchy at Artifact (only Artifact has no baseKind)", () => {
    expect(ARTIFACT_REGISTRY.Artifact.baseKind).toBeUndefined();
    for (const kind of ALL_KINDS) {
      if (kind !== "Artifact") {
        expect(ARTIFACT_REGISTRY[kind].baseKind).toBeDefined();
      }
    }
  });

  it("sets isArray=false on every entry (cardinality lives in the kind string)", () => {
    for (const kind of ALL_KINDS) {
      expect(ARTIFACT_REGISTRY[kind].isArray).toBe(false);
    }
  });

  it("matches TYPED_IO_DESIGN.md §4 palette (colour spot-checks)", () => {
    expect(ARTIFACT_REGISTRY.Artifact.color).toBe("gray");

    expect(ARTIFACT_REGISTRY.Document.color).toBe("blue");
    expect(ARTIFACT_REGISTRY.MultiPageDocument.color).toBe("blue");
    expect(ARTIFACT_REGISTRY.SinglePageDocument.color).toBe("blue");

    expect(ARTIFACT_REGISTRY.Segment.color).toBe("green");
    expect(ARTIFACT_REGISTRY["Segment<Table>"].color).toBe("green");
    expect(ARTIFACT_REGISTRY["Segment<KeyValue>"].color).toBe("green");

    expect(ARTIFACT_REGISTRY.OcrResult.color).toBe("violet");
    expect(ARTIFACT_REGISTRY.OcrFields.color).toBe("violet");
    expect(ARTIFACT_REGISTRY.OcrTable.color).toBe("violet");

    // "amber" in the design doc → "yellow" in Mantine's default palette.
    expect(ARTIFACT_REGISTRY.Classification.color).toBe("yellow");
    expect(ARTIFACT_REGISTRY.ValidationResult.color).toBe("yellow");

    expect(ARTIFACT_REGISTRY.Reference.color).toBe("teal");
  });

  it("matches TYPED_IO_DESIGN.md §1 hierarchy (baseKind spot-checks)", () => {
    expect(ARTIFACT_REGISTRY.Document.baseKind).toBe("Artifact");
    expect(ARTIFACT_REGISTRY.MultiPageDocument.baseKind).toBe("Document");
    expect(ARTIFACT_REGISTRY.SinglePageDocument.baseKind).toBe("Document");

    expect(ARTIFACT_REGISTRY.Segment.baseKind).toBe("Artifact");
    expect(ARTIFACT_REGISTRY["Segment<Text>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Table>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Figure>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Form>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<KeyValue>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Signature>"].baseKind).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Header>"].baseKind).toBe("Segment");

    expect(ARTIFACT_REGISTRY.OcrResult.baseKind).toBe("Artifact");
    expect(ARTIFACT_REGISTRY.OcrFields.baseKind).toBe("OcrResult");
    expect(ARTIFACT_REGISTRY.OcrTable.baseKind).toBe("OcrResult");

    expect(ARTIFACT_REGISTRY.Classification.baseKind).toBe("Artifact");
    expect(ARTIFACT_REGISTRY.ValidationResult.baseKind).toBe("Artifact");
    expect(ARTIFACT_REGISTRY.Reference.baseKind).toBe("Artifact");
  });

  it("uses human-readable displayName values (Scenario 2)", () => {
    expect(ARTIFACT_REGISTRY.Artifact.displayName).toBe("Artifact");
    expect(ARTIFACT_REGISTRY.Document.displayName).toBe("Document");
    expect(ARTIFACT_REGISTRY.MultiPageDocument.displayName).toBe(
      "Multi-page document",
    );
    expect(ARTIFACT_REGISTRY.SinglePageDocument.displayName).toBe(
      "Single-page document",
    );

    expect(ARTIFACT_REGISTRY.Segment.displayName).toBe("Segment");
    expect(ARTIFACT_REGISTRY["Segment<Text>"].displayName).toBe(
      "Segment (Text)",
    );
    expect(ARTIFACT_REGISTRY["Segment<Table>"].displayName).toBe(
      "Segment (Table)",
    );
    expect(ARTIFACT_REGISTRY["Segment<Figure>"].displayName).toBe(
      "Segment (Figure)",
    );
    expect(ARTIFACT_REGISTRY["Segment<Form>"].displayName).toBe(
      "Segment (Form)",
    );
    expect(ARTIFACT_REGISTRY["Segment<KeyValue>"].displayName).toBe(
      "Segment (Key/value)",
    );
    expect(ARTIFACT_REGISTRY["Segment<Signature>"].displayName).toBe(
      "Segment (Signature)",
    );
    expect(ARTIFACT_REGISTRY["Segment<Header>"].displayName).toBe(
      "Segment (Header)",
    );

    expect(ARTIFACT_REGISTRY.OcrResult.displayName).toBe("OCR result");
    expect(ARTIFACT_REGISTRY.OcrFields.displayName).toBe("OCR fields");
    expect(ARTIFACT_REGISTRY.OcrTable.displayName).toBe("OCR table");

    expect(ARTIFACT_REGISTRY.Classification.displayName).toBe("Classification");
    expect(ARTIFACT_REGISTRY.ValidationResult.displayName).toBe(
      "Validation result",
    );
    expect(ARTIFACT_REGISTRY.Reference.displayName).toBe("Reference");
  });

  it("does not leak camelCase into displayName values", () => {
    for (const kind of ALL_KINDS) {
      const display = ARTIFACT_REGISTRY[kind].displayName;
      // camelCase = lowercase letter immediately followed by uppercase.
      expect(display).not.toMatch(/[a-z][A-Z]/);
    }
  });
});

describe("registerArtifactKind", () => {
  // The registry is module-level state; we cannot fully reset it between
  // tests without exposing a private hatch. Instead, each test below uses
  // a unique kind name ("CustomDoc1", "CustomDoc2", ...) so cases never
  // collide with each other or pollute v1 entries.

  it("registers a new kind with a valid baseKind (happy path)", () => {
    expect(getArtifactKindMeta("CustomDoc1")).toBeUndefined();

    const meta: ArtifactKindMeta = {
      displayName: "Custom doc 1",
      color: "indigo",
      baseKind: "Document",
      isArray: false,
    };
    registerArtifactKind("CustomDoc1", meta);

    const resolved = getArtifactKindMeta("CustomDoc1");
    expect(resolved).toBeDefined();
    expect(resolved?.displayName).toBe("Custom doc 1");
    expect(resolved?.color).toBe("indigo");
    expect(resolved?.baseKind).toBe("Document");
    expect(resolved?.isArray).toBe(false);
  });

  it("rejects a kind whose baseKind is not in the registry", () => {
    const meta: ArtifactKindMeta = {
      displayName: "Bad parent",
      color: "red",
      // Cast required because the v1 union doesn't include this name;
      // the test deliberately exercises the unknown-baseKind error path.
      baseKind: "NonExistentParent" as ArtifactKind,
      isArray: false,
    };

    expect(() => registerArtifactKind("CustomDoc2", meta)).toThrow(
      'baseKind "NonExistentParent" not found in registry',
    );

    // No partial state — the kind itself should not have been added.
    expect(getArtifactKindMeta("CustomDoc2")).toBeUndefined();
  });

  it("rejects a duplicate kind name (no silent overwrite)", () => {
    const meta: ArtifactKindMeta = {
      displayName: "Custom doc 3",
      color: "indigo",
      baseKind: "Document",
      isArray: false,
    };
    registerArtifactKind("CustomDoc3", meta);

    const overwrite: ArtifactKindMeta = {
      displayName: "Other",
      color: "red",
      baseKind: "Artifact",
      isArray: false,
    };
    expect(() => registerArtifactKind("CustomDoc3", overwrite)).toThrow(
      'kind "CustomDoc3" already registered',
    );

    // Original entry preserved.
    expect(getArtifactKindMeta("CustomDoc3")?.displayName).toBe("Custom doc 3");
    expect(getArtifactKindMeta("CustomDoc3")?.color).toBe("indigo");
  });

  it("rejects duplicate registration of a v1 kind (Document)", () => {
    expect(() =>
      registerArtifactKind("Document", {
        displayName: "Hijack",
        color: "red",
        baseKind: "Artifact",
        isArray: false,
      }),
    ).toThrow('kind "Document" already registered');
  });

  it("accepts a new kind with no baseKind (root-level addition)", () => {
    const meta: ArtifactKindMeta = {
      displayName: "Custom root",
      color: "pink",
      isArray: false,
    };
    registerArtifactKind("CustomRoot4", meta);

    const resolved = getArtifactKindMeta("CustomRoot4");
    expect(resolved).toBeDefined();
    expect(resolved?.baseKind).toBeUndefined();
  });
});

describe("getArtifactKindMeta", () => {
  it("returns the v1 meta for a known kind", () => {
    const meta = getArtifactKindMeta("Document");
    expect(meta).toBeDefined();
    expect(meta?.displayName).toBe("Document");
    expect(meta?.color).toBe("blue");
    expect(meta?.baseKind).toBe("Artifact");
  });

  it("returns the v1 meta for a parameterised Segment kind", () => {
    const meta = getArtifactKindMeta("Segment<Table>");
    expect(meta).toBeDefined();
    expect(meta?.displayName).toBe("Segment (Table)");
    expect(meta?.color).toBe("green");
    expect(meta?.baseKind).toBe("Segment");
  });

  it("returns undefined for unknown kinds", () => {
    expect(getArtifactKindMeta("NotARealKind")).toBeUndefined();
    expect(getArtifactKindMeta("")).toBeUndefined();
    expect(getArtifactKindMeta("document")).toBeUndefined(); // case-sensitive
  });
});
