import { extractAzureFieldDisplayValue } from "./azure-ocr-field-display-value";
import {
  canonicalizeSelectionMarkValue,
  normalizeSelectionMarksDeep,
} from "./selection-mark";

describe("canonicalizeSelectionMarkValue", () => {
  it("maps the Azure labelling-export tagged form to the plain canonical form", () => {
    expect(canonicalizeSelectionMarkValue(":selected:")).toBe("selected");
    expect(canonicalizeSelectionMarkValue(":unselected:")).toBe("unselected");
  });

  it("leaves already-plain selection-mark values unchanged", () => {
    expect(canonicalizeSelectionMarkValue("selected")).toBe("selected");
    expect(canonicalizeSelectionMarkValue("unselected")).toBe("unselected");
  });

  it("leaves unrelated string values unchanged", () => {
    expect(canonicalizeSelectionMarkValue("John Doe")).toBe("John Doe");
    expect(canonicalizeSelectionMarkValue("")).toBe("");
  });

  it("round-trips: the labelling export tag form and the runtime form canonicalize to the same value", () => {
    // Runtime form: extractAzureFieldDisplayValue's resolution of a
    // valueSelectionMark field (see azure-ocr-field-display-value.ts).
    const runtimeForm = extractAzureFieldDisplayValue({
      valueSelectionMark: "selected",
    });
    // Labelling-export form: template-model.service.ts's Azure export tags
    // (see template-model.service.spec.ts "should handle selection mark
    // fields correctly").
    const labellingExportForm = ":selected:";

    expect(runtimeForm).toBe("selected");
    expect(canonicalizeSelectionMarkValue(labellingExportForm)).toBe(
      runtimeForm,
    );
    expect(extractAzureFieldDisplayValue({ valueSelectionMark: "selected" })).toBe(
      canonicalizeSelectionMarkValue(":selected:"),
    );
  });

  it("round-trips the unselected case as well", () => {
    const runtimeForm = extractAzureFieldDisplayValue({
      valueSelectionMark: "unselected",
    });
    expect(runtimeForm).toBe("unselected");
    expect(canonicalizeSelectionMarkValue(":unselected:")).toBe(runtimeForm);
  });
});

describe("normalizeSelectionMarksDeep", () => {
  it("canonicalizes tagged selection-mark values in a flat ground truth object", () => {
    const groundTruth = {
      checkbox_yes: ":selected:",
      checkbox_no: ":unselected:",
      name: "Jane Doe",
    };

    expect(normalizeSelectionMarksDeep(groundTruth)).toEqual({
      checkbox_yes: "selected",
      checkbox_no: "unselected",
      name: "Jane Doe",
    });
  });

  it("canonicalizes tagged values inside one-of alternate arrays", () => {
    const groundTruth = {
      checkbox_yes: [":selected:", "selected"],
    };

    expect(normalizeSelectionMarksDeep(groundTruth)).toEqual({
      checkbox_yes: ["selected", "selected"],
    });
  });

  it("canonicalizes tagged values inside nested objects and arrays of rows", () => {
    const groundTruth = {
      table: [
        { checkbox: ":selected:", label: "row 1" },
        { checkbox: ":unselected:", label: "row 2" },
      ],
      nested: { checkbox: ":selected:" },
    };

    expect(normalizeSelectionMarksDeep(groundTruth)).toEqual({
      table: [
        { checkbox: "selected", label: "row 1" },
        { checkbox: "unselected", label: "row 2" },
      ],
      nested: { checkbox: "selected" },
    });
  });

  it("leaves non-string, null, and already-plain values unchanged", () => {
    const groundTruth = {
      amount: 100,
      flag: true,
      note: null,
      checkbox: "selected",
    };

    expect(normalizeSelectionMarksDeep(groundTruth)).toEqual(groundTruth);
  });
});
