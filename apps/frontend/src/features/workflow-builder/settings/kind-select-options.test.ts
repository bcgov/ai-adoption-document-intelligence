/**
 * Pure-helper coverage for the Kind Select option builder (US-098).
 *
 * These tests pin the contract the `WorkflowSettingsDrawer` and the
 * future `LibraryPortListEditor` (US-099) both depend on:
 *   - wildcard group renders first with the "—" sentinel
 *   - every `ArtifactKind` from `ARTIFACT_REGISTRY` is represented
 *     in both base and array form
 *   - sentinel ↔ `KindRef | undefined` round-trip
 */

import { ARTIFACT_REGISTRY, type ArtifactKind } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import {
  buildKindSelectOptions,
  KIND_WILDCARD_VALUE,
  kindRefToSelectValue,
  selectValueToKindRef,
} from "./kind-select-options";

describe("buildKindSelectOptions", () => {
  const groups = buildKindSelectOptions();

  it("places the Wildcard group first with the '—' sentinel as its first option", () => {
    expect(groups[0]?.group).toBe("Wildcard");
    expect(groups[0]?.items[0]).toEqual({
      value: KIND_WILDCARD_VALUE,
      label: "—",
    });
  });

  it("renders every ArtifactKind from the registry in both base and array form", () => {
    const allValues = groups.flatMap((g) => g.items.map((i) => i.value));
    const registryKinds = Object.keys(ARTIFACT_REGISTRY) as ArtifactKind[];

    for (const kind of registryKinds) {
      expect(allValues).toContain(kind);
      expect(allValues).toContain(`${kind}[]`);
    }

    // Wildcard sentinel + 2 entries (base + array) per registry kind.
    expect(allValues).toHaveLength(1 + registryKinds.length * 2);
  });

  it("uses the registry displayName for labels and appends ' (array)' for the array variant", () => {
    const allItems = groups.flatMap((g) => g.items);
    const findItem = (value: string) => allItems.find((i) => i.value === value);

    expect(findItem("MultiPageDocument")?.label).toBe("Multi-page document");
    expect(findItem("MultiPageDocument[]")?.label).toBe(
      "Multi-page document (array)",
    );
    expect(findItem("Segment<Table>")?.label).toBe("Segment (Table)");
    expect(findItem("Segment<Table>[]")?.label).toBe("Segment (Table) (array)");
  });

  it("places Document-family kinds under the Document group", () => {
    const documentGroup = groups.find((g) => g.group === "Document");
    expect(documentGroup).toBeDefined();
    const values = documentGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("Document");
    expect(values).toContain("MultiPageDocument");
    expect(values).toContain("SinglePageDocument");
  });

  it("places Segment-family kinds under the Segment group", () => {
    const segmentGroup = groups.find((g) => g.group === "Segment");
    expect(segmentGroup).toBeDefined();
    const values = segmentGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("Segment");
    expect(values).toContain("Segment<Table>");
    expect(values).toContain("Segment<Text>");
  });

  it("places OcrResult-family kinds under the OCR group", () => {
    const ocrGroup = groups.find((g) => g.group === "OCR");
    expect(ocrGroup).toBeDefined();
    const values = ocrGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("OcrResult");
    expect(values).toContain("OcrFields");
    expect(values).toContain("OcrTable");
  });

  it("places Classification + ValidationResult under the Classification & Validation group", () => {
    const cvGroup = groups.find(
      (g) => g.group === "Classification & Validation",
    );
    expect(cvGroup).toBeDefined();
    const values = cvGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("Classification");
    expect(values).toContain("ValidationResult");
  });

  it("places Reference under the Reference group", () => {
    const refGroup = groups.find((g) => g.group === "Reference");
    expect(refGroup).toBeDefined();
    const values = refGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("Reference");
    expect(values).toContain("Reference[]");
  });

  it("places the literal 'Artifact' kind in the Wildcard group", () => {
    const wildcardGroup = groups.find((g) => g.group === "Wildcard");
    expect(wildcardGroup).toBeDefined();
    const values = wildcardGroup?.items.map((i) => i.value) ?? [];
    expect(values).toContain("Artifact");
    expect(values).toContain("Artifact[]");
  });
});

describe("kindRefToSelectValue / selectValueToKindRef", () => {
  it("maps undefined to the wildcard sentinel", () => {
    expect(kindRefToSelectValue(undefined)).toBe(KIND_WILDCARD_VALUE);
  });

  it("maps a defined KindRef to itself", () => {
    expect(kindRefToSelectValue("Document")).toBe("Document");
    expect(kindRefToSelectValue("Document[]")).toBe("Document[]");
    expect(kindRefToSelectValue("Segment<Table>")).toBe("Segment<Table>");
  });

  it("maps the wildcard sentinel back to undefined", () => {
    expect(selectValueToKindRef(KIND_WILDCARD_VALUE)).toBeUndefined();
  });

  it("maps null back to undefined", () => {
    expect(selectValueToKindRef(null)).toBeUndefined();
  });

  it("maps a non-sentinel value back to itself", () => {
    expect(selectValueToKindRef("Document")).toBe("Document");
    expect(selectValueToKindRef("Document[]")).toBe("Document[]");
    expect(selectValueToKindRef("Segment<Table>")).toBe("Segment<Table>");
  });
});
