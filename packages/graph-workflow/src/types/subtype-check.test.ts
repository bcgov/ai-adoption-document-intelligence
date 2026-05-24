/**
 * Tests for `isAssignable` (US-091).
 *
 * Coverage maps 1:1 to the five acceptance scenarios in
 * `US-091-isassignable-subtype-check.md`, plus a parametric matrix that
 * walks the full v1 registry asserting:
 *
 *   - Every kind is assignable to the `Artifact` root.
 *   - `Artifact` is not assignable to any other v1 kind (upcast rejected).
 *   - Every kind with a `baseKind` is assignable to that direct parent.
 *
 * Why the matrix? It catches regressions if a new kind is added to the
 * registry without wiring its `baseKind` (subtype walk would silently
 * fail at that branch).
 */

import type { ArtifactKind } from "./artifacts";
import { ARTIFACT_REGISTRY } from "./artifact-registry";
import { isAssignable } from "./subtype-check";

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

describe("isAssignable — Scenario 1: identity returns true", () => {
  it("returns true for identical base kinds", () => {
    expect(isAssignable("Document", "Document")).toBe(true);
  });

  it("returns true for identical array kinds", () => {
    expect(isAssignable("Segment[]", "Segment[]")).toBe(true);
  });

  it("returns true for identical parameterised kinds", () => {
    expect(isAssignable("Segment<Table>", "Segment<Table>")).toBe(true);
  });

  it("returns true for identical parameterised array kinds", () => {
    expect(isAssignable("Segment<Table>[]", "Segment<Table>[]")).toBe(true);
  });
});

describe("isAssignable — Scenario 2: subtype + reverse + transitive", () => {
  it("accepts direct subtype → supertype (SinglePageDocument → Document)", () => {
    expect(isAssignable("SinglePageDocument", "Document")).toBe(true);
  });

  it("rejects the reverse (Document → SinglePageDocument)", () => {
    expect(isAssignable("Document", "SinglePageDocument")).toBe(false);
  });

  it("accepts transitive walk (SinglePageDocument → Artifact)", () => {
    expect(isAssignable("SinglePageDocument", "Artifact")).toBe(true);
  });

  it("accepts Segment<Table> → Segment", () => {
    expect(isAssignable("Segment<Table>", "Segment")).toBe(true);
  });

  it("rejects Segment → Segment<Table>", () => {
    expect(isAssignable("Segment", "Segment<Table>")).toBe(false);
  });

  it("accepts OcrFields → OcrResult", () => {
    expect(isAssignable("OcrFields", "OcrResult")).toBe(true);
  });

  it("rejects OcrResult → OcrFields", () => {
    expect(isAssignable("OcrResult", "OcrFields")).toBe(false);
  });

  it("accepts MultiPageDocument → Artifact (transitive)", () => {
    expect(isAssignable("MultiPageDocument", "Artifact")).toBe(true);
  });
});

describe("isAssignable — Scenario 3: array cardinality is strict", () => {
  it("rejects T → T[] (no auto-wrap)", () => {
    expect(isAssignable("Document", "Document[]")).toBe(false);
  });

  it("rejects T[] → T (no auto-unwrap)", () => {
    expect(isAssignable("Document[]", "Document")).toBe(false);
  });

  it("accepts element subtype across arrays (SinglePageDocument[] → Document[])", () => {
    expect(isAssignable("SinglePageDocument[]", "Document[]")).toBe(true);
  });

  it("accepts Document[] → Artifact[] (transitive across cardinality)", () => {
    expect(isAssignable("Document[]", "Artifact[]")).toBe(true);
  });

  it("accepts Segment<Table>[] → Segment[]", () => {
    expect(isAssignable("Segment<Table>[]", "Segment[]")).toBe(true);
  });

  it("rejects T[] → unrelated U[]", () => {
    expect(isAssignable("Document[]", "Segment[]")).toBe(false);
  });
});

describe("isAssignable — Scenario 4: unknown kinds default to wildcard Artifact", () => {
  it("treats unknown `from` as wildcard (UnknownKind → Document)", () => {
    expect(isAssignable("UnknownKind", "Document")).toBe(true);
  });

  it("treats unknown `to` as wildcard (Document → UnknownKind)", () => {
    expect(isAssignable("Document", "UnknownKind")).toBe(true);
  });

  it("treats undefined `from` as wildcard", () => {
    expect(isAssignable(undefined, "Document")).toBe(true);
  });

  it("treats undefined `to` as wildcard", () => {
    expect(isAssignable("Document", undefined)).toBe(true);
  });

  it("treats both undefined as wildcard (no kind on either side)", () => {
    expect(isAssignable(undefined, undefined)).toBe(true);
  });

  it("treats two unknown kinds as wildcards on both sides", () => {
    expect(isAssignable("UnknownA", "UnknownB")).toBe(true);
  });
});

describe("isAssignable — Scenario 5: Artifact is the universal target", () => {
  it("accepts Document → Artifact", () => {
    expect(isAssignable("Document", "Artifact")).toBe(true);
  });

  it("accepts Segment[] → Artifact[] (universal target with arrays)", () => {
    expect(isAssignable("Segment[]", "Artifact[]")).toBe(true);
  });

  it("rejects Artifact → Document (upcast rejected)", () => {
    expect(isAssignable("Artifact", "Document")).toBe(false);
  });

  it("rejects Artifact → Segment<Table>", () => {
    expect(isAssignable("Artifact", "Segment<Table>")).toBe(false);
  });

  it("accepts Artifact[] → Artifact[] (identity still wins)", () => {
    expect(isAssignable("Artifact[]", "Artifact[]")).toBe(true);
  });

  it("accepts Artifact → Artifact (identity still wins)", () => {
    expect(isAssignable("Artifact", "Artifact")).toBe(true);
  });
});

describe("isAssignable — parametric matrix over the v1 registry", () => {
  it.each(ALL_KINDS)(
    "every v1 kind is assignable to Artifact (%s → Artifact)",
    (kind) => {
      expect(isAssignable(kind, "Artifact")).toBe(true);
    },
  );

  it.each(ALL_KINDS.filter((k) => k !== "Artifact"))(
    "Artifact is not assignable to any other v1 kind (Artifact → %s)",
    (kind) => {
      expect(isAssignable("Artifact", kind)).toBe(false);
    },
  );

  it.each(
    ALL_KINDS.filter(
      (k) => ARTIFACT_REGISTRY[k].baseKind !== undefined,
    ).map((k) => [k, ARTIFACT_REGISTRY[k].baseKind as ArtifactKind] as const),
  )("every kind with a baseKind is assignable to it (%s → %s)", (kind, base) => {
    expect(isAssignable(kind, base)).toBe(true);
  });

  it.each(
    ALL_KINDS.filter(
      (k) => ARTIFACT_REGISTRY[k].baseKind !== undefined,
    ).map((k) => [k, ARTIFACT_REGISTRY[k].baseKind as ArtifactKind] as const),
  )(
    "every kind with a baseKind is assignable to it across arrays (%s[] → %s[])",
    (kind, base) => {
      expect(isAssignable(`${kind}[]`, `${base}[]`)).toBe(true);
    },
  );
});
