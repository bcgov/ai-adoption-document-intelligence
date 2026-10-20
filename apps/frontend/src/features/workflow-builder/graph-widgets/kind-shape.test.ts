/**
 * What the kind popover says a kind contains. The answer has to come from the
 * registry, so these tests are written against the registry's real content
 * rather than against a fixture: if `PreparedFile` gains a field, the popover
 * gains it too and nothing here needs editing.
 */

import { ARTIFACT_REGISTRY } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { describeKind } from "./kind-shape";

describe("describeKind", () => {
  it("says Document is a family wildcard, and names members that do have a shape", () => {
    const shape = describeKind("Document");
    expect(shape.variant.kind).toBe("wildcard");
    if (shape.variant.kind !== "wildcard") throw new Error("unreachable");
    // PreparedFile is a Document subkind with a Zod-derived schema.
    expect(shape.variant.describedSubkinds).toContain("PreparedFile");
    // A Segment subkind is NOT under Document and must not leak in.
    expect(shape.variant.describedSubkinds).not.toContain("DocumentSegment");
  });

  it("lists the real fields of a kind that has a schema", () => {
    const shape = describeKind("PreparedFile");
    expect(shape.variant.kind).toBe("fields");
    if (shape.variant.kind !== "fields") throw new Error("unreachable");
    const names = shape.variant.fields.map((f) => f.name);
    expect(names).toContain("fileName");
    expect(names).toContain("blobKey");
    const fileName = shape.variant.fields.find((f) => f.name === "fileName");
    expect(fileName?.required).toBe(true);
  });

  it("inherits a base kind's fields", () => {
    // TypedSegment extends DocumentSegment, so it must carry both sets.
    const shape = describeKind("TypedSegment");
    if (shape.variant.kind !== "fields") throw new Error("expected fields");
    const names = shape.variant.fields.map((f) => f.name);
    expect(names).toContain("segmentIndex"); // from DocumentSegment
    expect(names).toContain("segmentType"); // its own
  });

  it("unwraps an array kind and says each item is one element", () => {
    const shape = describeKind("DocumentSegment[]");
    expect(shape.isList).toBe(true);
    expect(shape.elementKind).toBe("DocumentSegment");
    expect(shape.variant.kind).toBe("fields");
  });

  it("walks the ancestry chain outwards", () => {
    const shape = describeKind("PreparedFile");
    expect(shape.ancestry[0]).toBe("Document");
    expect(shape.ancestry[shape.ancestry.length - 1]).toBe("Artifact");
  });

  it("does not throw on a kind nobody registered", () => {
    const shape = describeKind("NotAKindAtAll");
    expect(shape.variant.kind).toBe("unregistered");
    expect(shape.displayName).toBe("NotAKindAtAll");
    expect(shape.ancestry).toEqual([]);
  });

  it("calls a schema-free kind with no members a single kind, not a family", () => {
    for (const kind of [
      "DocumentId",
      "GroupId",
      "ClassificationLabel",
      "SinglePageDocument",
      "Segment<Text>",
      "Reference",
      "ValidationResult",
    ]) {
      expect(describeKind(kind).variant.kind, kind).toBe("leaf");
    }
  });

  it("keeps the family reading for schema-free kinds that other kinds descend from", () => {
    for (const kind of [
      "Artifact",
      "Document",
      "DocumentRef",
      "Identifier",
      "Classification",
      "Segment",
    ]) {
      expect(describeKind(kind).variant.kind, kind).toBe("wildcard");
    }
  });

  it("is a family exactly when some registered kind names it as its base", () => {
    const bases = new Set<string | undefined>(
      Object.values(ARTIFACT_REGISTRY).map((meta) => meta.baseKind),
    );
    for (const kind of Object.keys(ARTIFACT_REGISTRY)) {
      const variant = describeKind(kind).variant.kind;
      if (variant === "fields") continue;
      expect(variant, kind).toBe(bases.has(kind) ? "wildcard" : "leaf");
    }
  });

  it("describes a list of a leaf kind as a list of that one kind", () => {
    const shape = describeKind("DocumentId[]");
    expect(shape.isList).toBe(true);
    expect(shape.variant.kind).toBe("leaf");
  });
});
