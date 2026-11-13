import { describe, expect, it } from "vitest";
import { mergeSuggestedAssignments } from "./mergeSuggestedAssignments";

const known = new Set(["p1-w0", "p1-w1", "p1-w2", "p1-w3", "p1-sm0"]);

describe("mergeSuggestedAssignments", () => {
  it("fills fields when nothing is labelled yet", () => {
    const result = mergeSuggestedAssignments(
      {},
      [
        { field_key: "name", element_ids: ["p1-w1", "p1-w2"] },
        { field_key: "consents", element_ids: ["p1-sm0"] },
      ],
      known,
    );

    expect(result.assignments).toEqual({
      "p1-w1": "name",
      "p1-w2": "name",
      "p1-sm0": "consents",
    });
    expect(result).toMatchObject({ filled: 2, kept: 0 });
  });

  it("keeps a field the user labelled by hand, even when the suggestion disagrees", () => {
    const result = mergeSuggestedAssignments(
      { "p1-w0": "name" },
      [
        { field_key: "name", element_ids: ["p1-w1", "p1-w2"] },
        { field_key: "file_number", element_ids: ["p1-w3"] },
      ],
      known,
    );

    expect(result.assignments).toEqual({
      "p1-w0": "name",
      "p1-w3": "file_number",
    });
    expect(result).toMatchObject({ filled: 1, kept: 1 });
  });

  it("never moves a word the user gave to another field", () => {
    const result = mergeSuggestedAssignments(
      { "p1-w1": "title" },
      [{ field_key: "name", element_ids: ["p1-w1", "p1-w2"] }],
      known,
    );

    expect(result.assignments).toEqual({ "p1-w1": "title", "p1-w2": "name" });
    expect(result).toMatchObject({ filled: 1, kept: 0 });
  });

  it("ignores ids that are not on this document", () => {
    const result = mergeSuggestedAssignments(
      {},
      [{ field_key: "name", element_ids: ["p9-w9"] }],
      known,
    );

    expect(result.assignments).toEqual({});
    expect(result).toMatchObject({ filled: 0, kept: 0 });
  });
});
